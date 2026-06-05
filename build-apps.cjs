const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const pkgPath = path.join(__dirname, 'package.json');
const pkgBakPath = path.join(__dirname, 'package.json.bak');

console.log('Starting custom double-build process (Player/Admin)...');

// 1. Back up package.json
try {
  fs.copyFileSync(pkgPath, pkgBakPath);
  console.log('Successfully backed up package.json.');
} catch (err) {
  console.error('Failed to back up package.json', err);
  process.exit(1);
}

function restorePkg() {
  try {
    if (fs.existsSync(pkgBakPath)) {
      fs.copyFileSync(pkgBakPath, pkgPath);
      fs.unlinkSync(pkgBakPath);
      console.log('Successfully restored original package.json.');
    }
  } catch (err) {
    console.error('Critical: Failed to restore package.json!', err);
  }
}

function getPngDimensions(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(24);
    fs.readSync(fd, buffer, 0, 24, 0);
    fs.closeSync(fd);

    if (buffer[0] !== 0x89 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
      return null;
    }
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  } catch (err) {
    return null;
  }
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      // Handle HTTP redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        https.get(response.headers.location, (redirectResponse) => {
          if (redirectResponse.statusCode !== 200) {
            fs.unlink(destPath, () => {});
            reject(new Error(`Redirect response failed: status ${redirectResponse.statusCode}`));
            return;
          }
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
        return;
      }

      if (response.statusCode !== 200) {
        fs.unlink(destPath, () => {});
        reject(new Error(`Request failed: status ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function syncRemoteIcons() {
  console.log('\nSynchronizing remote builder icon assets from GitHub (branch: assets)...');
  const baseRawUrl = 'https://raw.githubusercontent.com/JON99999/Interstitial-er/assets';
  
  const filesToSync = [
    {
      remote: `${baseRawUrl}/src/assets/images/user-icon.png`,
      local: path.join(__dirname, 'src', 'assets', 'images', 'user-icon.png'),
      name: 'user-icon.png (Application and installer logo)',
      requiredSpec: 'High-resolution 1024x1024 pixel PNG file.'
    },
    {
      remote: `${baseRawUrl}/src/assets/images/mac/icon.icns`,
      local: path.join(__dirname, 'src', 'assets', 'images', 'mac', 'icon.icns'),
      name: 'mac/icon.icns (macOS application icon bundle)',
      requiredSpec: 'Standard Apple ICNS file containing multiple resolutions up to 1024x1024 pixels.'
    },
    {
      remote: `${baseRawUrl}/src/assets/images/win/icon.ico`,
      local: path.join(__dirname, 'src', 'assets', 'images', 'win', 'icon.ico'),
      name: 'win/icon.ico (Windows application icon bundle)',
      requiredSpec: 'Standard Windows ICO file containing multiple sizes (16, 24, 32, 48, 256 pixels).'
    }
  ];

  for (const item of filesToSync) {
    try {
      await downloadFile(item.remote, item.local);
      console.log(`Successfully downloaded and updated remote icon: ${item.name}`);
    } catch (err) {
      console.log(`[INFO] Could not sync remote icon: ${item.name}`);
      console.log(`       Target URL: ${item.remote}`);
      console.log(`       Reason: ${err.message}`);
      if (fs.existsSync(item.local)) {
        console.log(`       Using existing local cached copy of ${path.basename(item.local)} instead.`);
      } else {
        console.log(`       ⚠️ WARNING: Local icon file is missing.`);
        console.log(`       Please verify you have pushed a valid file at:`);
        console.log(`       GitHub Branch: assets`);
        console.log(`       Path: ${item.remote.replace(baseRawUrl + '/', '')}`);
        console.log(`       Requirements: ${item.requiredSpec}`);
      }
    }
  }
  console.log('GitHub icon assets synchronization complete.\n');
}

(async () => {
  try {
    const cleanBuild = () => {
      console.log('Cleaning up old build outputs...');
      if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true, force: true });
      }
      fs.mkdirSync('dist');
    };

    const compileAssets = (mode) => {
      console.log(`Compiling Vite assets for mode: ${mode}...`);
      execSync('npx vite build', {
        env: { ...process.env, VITE_APP_MODE: mode },
        stdio: 'inherit'
      });

      console.log(`Compiling server back-end for mode: ${mode}...`);
      execSync('npx esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs', {
        stdio: 'inherit'
      });

      // Write app config
      const configPath = path.join(__dirname, 'dist', 'app-config.json');
      fs.writeFileSync(configPath, JSON.stringify({ mode }, null, 2));
      console.log(`Wrote dist/app-config.json for mode: ${mode}.`);
    };

    const packageApp = (mode) => {
      console.log(`Updating package.json for packaging mode: ${mode}...`);
      const pkg = JSON.parse(fs.readFileSync(pkgBakPath, 'utf8'));

      // Inject App names & IDs
      pkg.productName = `Interstitial-er ${mode}`;
      if (!pkg.build) pkg.build = {};
      pkg.build.productName = `Interstitial-er ${mode}`;
      pkg.build.appId = `com.interstitialer.scheduler.${mode.toLowerCase()}`;

      // Ensure build directory exists and has our physical composite icon copied as build/icon.png
      const buildIconDir = path.join(__dirname, 'build');
      if (!fs.existsSync(buildIconDir)) {
        fs.mkdirSync(buildIconDir, { recursive: true });
      }

      const userIconPath = path.join(__dirname, 'src', 'assets', 'images', 'user-icon.png');
      const placeholderPath = path.join(__dirname, 'src', 'assets', 'images', 'interstitialer_icon_1779637727966.png');
      let chosenIconSource = placeholderPath;

      if (fs.existsSync(userIconPath)) {
        const dims = getPngDimensions(userIconPath);
        if (dims && dims.width === 1024 && dims.height === 1024) {
          console.log(`Custom user-icon.png with correct 1024x1024 dimensions detected. Using as active build launcher icon for mode: ${mode}`);
          chosenIconSource = userIconPath;
        } else {
          if (dims) {
            console.log(`Custom user-icon.png has incorrect dimensions (${dims.width}x${dims.height}). Falling back to preseeded placeholder.`);
          } else {
            console.log('Custom user-icon.png is not a valid PNG file. Falling back to preseeded placeholder.');
          }
        }
      } else {
        console.log(`No custom user-icon.png present. Using preseeded placeholder for mode: ${mode}`);
      }

      if (fs.existsSync(chosenIconSource)) {
        try {
          fs.copyFileSync(chosenIconSource, path.join(buildIconDir, 'icon.png'));
          console.log(`Successfully copied ${path.basename(chosenIconSource)} to build/icon.png for installer/desktop app launcher representation.`);
        } catch (err) {
          console.error('Failed to copy active logo to build/icon.png:', err);
        }
      }

      // Copy pre-generated native system-specific icons (icns, ico)
      const macIconSource = path.join(__dirname, 'src', 'assets', 'images', 'mac', 'icon.icns');
      const winIconSource = path.join(__dirname, 'src', 'assets', 'images', 'win', 'icon.ico');

      const isRealIconFile = (filePath) => {
        try {
          return fs.existsSync(filePath) && fs.statSync(filePath).size > 500;
        } catch (err) {
          return false;
        }
      };

      if (isRealIconFile(macIconSource)) {
        try {
          fs.copyFileSync(macIconSource, path.join(buildIconDir, 'icon.icns'));
          console.log(`Successfully copied pre-generated icon.icns to build/icon.icns for macOS.`);
        } catch (err) {
          console.error('Failed to copy pre-generated icon.icns to build/icon.icns:', err);
        }
      } else {
        console.log(`mac/icon.icns not found or is placeholder at ${macIconSource}. (Skipping local copy; expected to be handled in GitHub CI environment or generated.)`);
      }

      if (isRealIconFile(winIconSource)) {
        try {
          fs.copyFileSync(winIconSource, path.join(buildIconDir, 'icon.ico'));
          console.log(`Successfully copied pre-generated icon.ico to build/icon.ico for Windows.`);
        } catch (err) {
          console.error('Failed to copy pre-generated icon.ico to build/icon.ico:', err);
        }
      } else {
        console.log(`win/icon.ico not found or is placeholder at ${winIconSource}. (Skipping local copy; expected to be handled in GitHub CI environment or generated.)`);
      }

      // Ensure explicit icon configuration is specified inside the build config schema
      if (!pkg.build.mac) pkg.build.mac = {};
      pkg.build.mac.icon = "build/icon.icns";
      pkg.build.mac.writeUpdateMetadata = false;
      pkg.build.mac.differentialPackage = false;

      if (!pkg.build.win) pkg.build.win = {};
      pkg.build.win.icon = "build/icon.ico";

      // Configure Windows specific artifactNames dynamically in running package settings
      if (!pkg.build.nsis) pkg.build.nsis = {};
      pkg.build.nsis.differentialPackage = false;
      pkg.build.nsis.writeUpdateMetadata = false;
      pkg.build.nsis.artifactName = "${productName}-${version}-Windows-Installer.${ext}";

      if (!pkg.build.dmg) pkg.build.dmg = {};
      pkg.build.dmg.differentialPackage = false;
      pkg.build.dmg.writeUpdateMetadata = false;

      if (!pkg.build.portable) pkg.build.portable = {};
      pkg.build.portable.artifactName = "${productName}-${version}-Windows-Portable.${ext}";

      // Register custom afterAllArtifactBuild hook for renaming Mac artifacts dynamically
      pkg.build.afterAllArtifactBuild = "./afterAllArtifactBuild.cjs";

      console.log(`Packaging Electron app for mode: ${mode}...`);
      // Force '--publish never' so on-disk renaming can happen on macOS cleanly, allowing GitHub Actions release upload to capture the renamed files
      const publishFlag = '--publish never';

      if (process.platform === 'darwin') {
        console.log(`Packaging Electron app for Mac...`);
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

        execSync(`npx electron-builder --mac --x64 --arm64 ${publishFlag}`, {
          stdio: 'inherit',
          env: { ...process.env }
        });
      } else if (process.platform === 'win32') {
        console.log(`Packaging Electron app for Windows...`);
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

        execSync(`npx electron-builder --win --x64 ${publishFlag}`, {
          stdio: 'inherit',
          env: { ...process.env }
        });
      } else {
        console.log(`Packaging Electron app for default platform...`);
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

        execSync(`npx electron-builder --publish never`, {
          stdio: 'inherit',
          env: { ...process.env }
        });
      }
      console.log(`Successfully completed packaging for mode: ${mode}!`);
    };

    // --- Step 0: Sync Remote Icons from assets branch ---
    await syncRemoteIcons();

    // --- Step 1: Build & Package Admin ---
    console.log('\n=========================================');
    console.log(' BUILDING INTERSTITIAL-ER ADMIN ');
    console.log('=========================================\n');
    cleanBuild();
    compileAssets('Admin');
    packageApp('Admin');

    // --- Step 2: Build & Package Player ---
    console.log('\n=========================================');
    console.log(' BUILDING INTERSTITIAL-ER PLAYER ');
    console.log('=========================================\n');
    cleanBuild();
    compileAssets('Player');
    packageApp('Player');

    console.log('\nDouble-build packaged successfully!');

  } catch (err) {
    console.error('\nAn error occurred during build/packaging:', err);
    process.exitCode = 1;
  } finally {
    restorePkg();
    const backupReleaseDir = path.join(__dirname, 'release_backup_temp');
    if (fs.existsSync(backupReleaseDir)) {
      try {
        fs.rmSync(backupReleaseDir, { recursive: true, force: true });
        console.log('Successfully cleared temporary release backups.');
      } catch (e) {
        console.error('Failed to clear temporary release backups:', e);
      }
    }
  }
})();
