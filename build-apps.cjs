const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, 'package.json');
const pkgBakPath = path.join(__dirname, 'package.json.bak');
const globalReleaseBackupDir = path.join(__dirname, 'global-release-backup');

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
    if (fs.existsSync(globalReleaseBackupDir)) {
      fs.rmSync(globalReleaseBackupDir, { recursive: true, force: true });
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
    pkg.build.appId = `com.minutesync.scheduler.${mode.toLowerCase()}`;

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

    if (!pkg.build.win) pkg.build.win = {};
    pkg.build.win.icon = "build/icon.ico";

    // Configure Windows specific artifactNames dynamically in running package settings
    if (!pkg.build.nsis) pkg.build.nsis = {};
    pkg.build.nsis.differentialPackage = false;
    pkg.build.nsis.artifactName = "${productName}-${version}-Windows-Installer.${ext}";

    if (!pkg.build.portable) pkg.build.portable = {};
    pkg.build.portable.artifactName = "${productName}-${version}-Windows-Portable.${ext}";

    const backupReleaseAssets = () => {
      if (fs.existsSync('release')) {
        if (!fs.existsSync(globalReleaseBackupDir)) {
          fs.mkdirSync(globalReleaseBackupDir, { recursive: true });
        }
        fs.readdirSync('release').forEach(file => {
          const src = path.join('release', file);
          const dest = path.join(globalReleaseBackupDir, file);
          try {
            const stat = fs.statSync(src);
            if (stat.isFile()) {
              fs.copyFileSync(src, dest);
              console.log(`[Backup] Copying ${file} to global release backup directory.`);
            }
          } catch (e) {
            console.error(`Failed to back up asset: ${file}`, e);
          }
        });
      }
    };

    console.log(`Packaging Electron app for mode: ${mode}...`);
    // Only publish on GitHub Actions when GH_TOKEN/GITHUB_TOKEN is present, fallback to local packaging (publish never) otherwise
    const isCI = process.env.GITHUB_ACTIONS === 'true';
    const publishFlag = isCI ? '--publish always' : '--publish never';

    if (process.platform === 'darwin') {
      console.log(`Packaging Electron app for Mac x64 (Intel)...`);
      if (!pkg.build.dmg) pkg.build.dmg = {};
      if (!pkg.build.mac) pkg.build.mac = {};
      
      pkg.build.mac.artifactName = "${productName}-${version}-Apple-Intel-(older)-Installer.${ext}";
      pkg.build.dmg.artifactName = "${productName}-${version}-Apple-Intel-(older)-Installer.${ext}";
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      execSync(`npx electron-builder --mac --x64 ${publishFlag}`, {
        stdio: 'inherit',
        env: { ...process.env }
      });
      // Back up x64 DMG immediately to prevent overwrite/clean sweeps by subsequent builds
      backupReleaseAssets();

      console.log(`Packaging Electron app for Mac arm64 (Apple Silicon)...`);
      pkg.build.mac.artifactName = "${productName}-${version}-Apple-Silicon-(newer-arm64)-Installer.${ext}";
      pkg.build.dmg.artifactName = "${productName}-${version}-Apple-Silicon-(newer-arm64)-Installer.${ext}";
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      execSync(`npx electron-builder --mac --arm64 ${publishFlag}`, {
        stdio: 'inherit',
        env: { ...process.env }
      });
      backupReleaseAssets();
    } else if (process.platform === 'win32') {
      console.log(`Packaging Electron app for Windows...`);
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      execSync(`npx electron-builder --win --x64 ${publishFlag}`, {
        stdio: 'inherit',
        env: { ...process.env }
      });
      backupReleaseAssets();
    } else {
      console.log(`Packaging Electron app for default platform...`);
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

      execSync(`npx electron-builder --publish never`, {
        stdio: 'inherit',
        env: { ...process.env }
      });
      backupReleaseAssets();
    }
    console.log(`Successfully completed packaging for mode: ${mode}!`);
  };

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

  // Restore all accumulated release assets back inside the release/ target folder
  if (fs.existsSync(globalReleaseBackupDir)) {
    console.log('\nRestoring all accumulated package assets to the final release folder...');
    if (!fs.existsSync('release')) {
      fs.mkdirSync('release', { recursive: true });
    }
    fs.readdirSync(globalReleaseBackupDir).forEach(file => {
      const src = path.join(globalReleaseBackupDir, file);
      const dest = path.join('release', file);
      try {
        fs.copyFileSync(src, dest);
        console.log(`[Restore] Restored and consolidated ${file} into final release directory.`);
      } catch (e) {
        console.error(`Failed to restore backup asset: ${file}`, e);
      }
    });
    // Clean up temporary backup folder
    fs.rmSync(globalReleaseBackupDir, { recursive: true, force: true });
  }

  console.log('\nDouble-build packaged successfully!');

} catch (err) {
  console.error('\nAn error occurred during build/packaging:', err);
  process.exitCode = 1;
} finally {
  restorePkg();
}
