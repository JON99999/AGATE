const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const archiver = require('archiver');

const pkgPath = path.join(__dirname, 'package.json');
const pkgBakPath = path.join(__dirname, 'package.json.bak');

console.log('Starting custom triple-build process (Admin/Live/Studio)...');

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
    const tempPath = `${destPath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const file = fs.createWriteStream(tempPath);

    const cleanup = () => {
      try {
        file.close();
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
    };

    const handleStream = (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            fs.renameSync(tempPath, destPath);
            resolve();
          } catch (renErr) {
            cleanup();
            reject(renErr);
          }
        });
      });
      file.on('error', (err) => {
        cleanup();
        reject(err);
      });
    };

    const req = https.get(url, (response) => {
      // Handle HTTP redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume(); // consume to free underlying socket
        https.get(response.headers.location, (redirectResponse) => {
          if (redirectResponse.statusCode !== 200) {
            redirectResponse.resume();
            cleanup();
            reject(new Error(`Redirect response failed: status ${redirectResponse.statusCode}`));
            return;
          }
          handleStream(redirectResponse);
        }).on('error', (err) => {
          cleanup();
          reject(err);
        });
        return;
      }

      if (response.statusCode !== 200) {
        response.resume(); // consume stream so connection is released from event loop
        cleanup();
        reject(new Error(`Request failed: status ${response.statusCode}`));
        return;
      }

      handleStream(response);
    });

    req.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });
}

async function syncRemoteIcons() {
  console.log('\nSynchronizing remote builder icon assets from GitHub (branch: assets)...');
  const baseRawUrl = 'https://raw.githubusercontent.com/JON99999/AGATE/assets';

  const modes = ['admin', 'live', 'studio'];
  const macPngFiles = [
    '1024x1024.png',
    '512x512.png',
    '256x256.png',
    '128x128.png',
    '64x64.png',
    '32x32.png',
    '16x16.png',
    'icon_512x512@2x.png',
    'icon_512x512.png',
    'icon_256x256@2x.png',
    'icon_256x256.png',
    'icon_128x128@2x.png',
    'icon_128x128.png',
    'icon_32x32@2x.png',
    'icon_32x32.png',
    'icon_16x16@2x.png',
    'icon_16x16.png'
  ];

  const filesToSync = [];

  for (const mode of modes) {
    const modeDir = path.join(__dirname, 'src', 'assets', 'images', mode);
    const macDir = path.join(modeDir, 'macos');
    const winDir = path.join(modeDir, 'windows');

    // 1. Mode 1024x1024 master icon.png
    filesToSync.push({
      remote: `${baseRawUrl}/src/assets/images/${mode}/icon.png`,
      local: path.join(modeDir, 'icon.png'),
      name: `${mode}/icon.png (Primary launcher icon for AMP ${mode.toUpperCase()})`,
      requiredSpec: 'High-resolution 1024x1024 pixel PNG file.'
    });

    // 2. Mode macOS icon.icns bundle
    filesToSync.push({
      remote: `${baseRawUrl}/src/assets/images/${mode}/macos/icon.icns`,
      local: path.join(macDir, 'icon.icns'),
      name: `${mode}/macos/icon.icns (Compiled macOS icon bundle for AMP ${mode.toUpperCase()})`,
      requiredSpec: 'Multi-resolution Apple ICNS file.'
    });

    // 3. Mode macOS resolution PNGs (direct icon_ prefixed frames)
    for (const sizeFile of macPngFiles) {
      filesToSync.push({
        remote: `${baseRawUrl}/src/assets/images/${mode}/macos/${encodeURIComponent(sizeFile)}`,
        local: path.join(macDir, sizeFile),
        name: `${mode}/macos/${sizeFile} (macOS icon frame)`,
        requiredSpec: `macOS resolution frame (${sizeFile}).`
      });
    }

    // 4. Mode Windows icon.ico bundle
    filesToSync.push({
      remote: `${baseRawUrl}/src/assets/images/${mode}/windows/icon.ico`,
      local: path.join(winDir, 'icon.ico'),
      name: `${mode}/windows/icon.ico (Windows multi-resolution ICO for AMP ${mode.toUpperCase()})`,
      requiredSpec: 'Multi-resolution Windows ICO file.'
    });
  }

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

    const packageWindowsPortableZip = async (mode, version) => {
      const releaseDir = path.join(__dirname, 'release');
      if (!fs.existsSync(releaseDir)) return;

      const files = fs.readdirSync(releaseDir);
      const portableExeName = files.find(f => 
        f.toLowerCase().includes(mode.toLowerCase()) && 
        f.toLowerCase().includes('portable') && 
        f.endsWith('.exe')
      );

      if (!portableExeName) {
        console.log(`No portable executable found in release/ for mode: ${mode}`);
        return;
      }

      // 1. Folder name inside zip contains build type but NO version
      const folderName = `AMP ${mode} Windows Portable`;
      const stagingDir = path.join(releaseDir, folderName);
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
      fs.mkdirSync(stagingDir, { recursive: true });

      // 2. Move portable exe into staging folder
      const srcExe = path.join(releaseDir, portableExeName);
      const destExe = path.join(stagingDir, portableExeName);
      fs.copyFileSync(srcExe, destExe);

      // 3. Create README.txt in the staging folder
      const readmeContent = `================================================================================
  AMP ${mode.toUpperCase()} — WINDOWS PORTABLE EDITION
================================================================================

IMPORTANT INSTRUCTION:
--------------------------------------------------------------------------------
Please UNZIP / EXTRACT this entire folder to your computer or USB drive before
launching the application.

DO NOT run the executable from inside the compressed (.zip) archive preview.

--------------------------------------------------------------------------------
CONFIGURATION & PERSISTENCE:
--------------------------------------------------------------------------------
- When run from the extracted folder, all configuration and local folder paths
  are saved in 'amp_settings.json' directly in this same folder.
- You can move this extracted folder between drives or broadcast machines, and
  your settings will remain intact.
================================================================================
`;
      fs.writeFileSync(path.join(stagingDir, 'README.txt'), readmeContent, 'utf8');

      // 4. Create zip archive
      const zipName = `AMP ${mode}-${version}-Windows-Portable.zip`;
      const zipPath = path.join(releaseDir, zipName);
      if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
      }

      console.log(`Wrapping portable executable into ZIP archive: ${zipName}...`);
      await new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const createZipArchive = (options) => {
          if (archiver && archiver.ZipArchive) {
            return new archiver.ZipArchive(options);
          }
          if (typeof archiver === 'function') {
            return archiver('zip', options);
          }
          if (archiver && archiver.default) {
            if (typeof archiver.default === 'function') return archiver.default('zip', options);
            if (archiver.default.ZipArchive) return new archiver.default.ZipArchive(options);
          }
          throw new Error('Unsupported or missing archiver module');
        };

        const archive = createZipArchive({ zlib: { level: 9 } });

        output.on('close', () => {
          console.log(`Successfully created ${zipName} (${archive.pointer()} total bytes).`);
          try {
            fs.rmSync(stagingDir, { recursive: true, force: true });
          } catch (_) {}

          // Remove standalone loose portable executable from release/ so only the .zip remains
          try {
            if (fs.existsSync(srcExe)) {
              fs.unlinkSync(srcExe);
              console.log(`Removed loose standalone portable executable: ${portableExeName}`);
            }
            const blockmapPath = srcExe + '.blockmap';
            if (fs.existsSync(blockmapPath)) {
              fs.unlinkSync(blockmapPath);
            }
          } catch (delErr) {
            console.warn(`Could not remove loose portable executable ${portableExeName}:`, delErr);
          }

          resolve();
        });

        archive.on('error', (err) => {
          console.error(`Failed to create ZIP for mode ${mode}:`, err);
          reject(err);
        });

        archive.pipe(output);
        archive.directory(stagingDir, folderName);
        archive.finalize();
      });
    };

    const packageApp = async (mode) => {
      console.log(`Updating package.json for packaging mode: ${mode}...`);
      const pkg = JSON.parse(fs.readFileSync(pkgBakPath, 'utf8'));

      // Inject App names & IDs
      pkg.name = `amp-${mode.toLowerCase()}`;
      pkg.productName = `AMP ${mode}`;
      if (!pkg.build) pkg.build = {};
      pkg.build.productName = `AMP ${mode}`;
      pkg.build.appId = `com.amp.scheduler.${mode.toLowerCase()}`;

      // Ensure build directory exists and has our physical composite icon copied as build/icon.png
      const buildIconDir = path.join(__dirname, 'build');
      if (!fs.existsSync(buildIconDir)) {
        fs.mkdirSync(buildIconDir, { recursive: true });
      }

      const modeKey = mode.toLowerCase();
      const modeDir = path.join(__dirname, 'src', 'assets', 'images', modeKey);
      const modeIconPath = path.join(modeDir, 'icon.png');
      const placeholderPath = path.join(__dirname, 'src', 'assets', 'images', 'default', 'icon.png');
      let chosenIconSource = placeholderPath;

      if (fs.existsSync(modeIconPath)) {
        const dims = getPngDimensions(modeIconPath);
        if (dims && dims.width === 1024 && dims.height === 1024) {
          console.log(`Variant ${modeKey}/icon.png with correct 1024x1024 dimensions detected. Using as active build launcher icon for mode: ${mode}`);
          chosenIconSource = modeIconPath;
        } else if (dims) {
          console.log(`Variant ${modeKey}/icon.png detected (${dims.width}x${dims.height}). Using as active build launcher icon for mode: ${mode}`);
          chosenIconSource = modeIconPath;
        }
      }

      if (chosenIconSource === placeholderPath) {
        console.log(`No variant ${modeKey}/icon.png present. Using preseeded placeholder for mode: ${mode}`);
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
      const macIconDir = path.join(modeDir, 'macos');
      const macIconSource = path.join(macIconDir, 'icon.icns');
      const winIconDir = path.join(modeDir, 'windows');
      const winIconSource = path.join(winIconDir, 'icon.ico');

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
          console.log(`Successfully copied pre-generated ${modeKey}/macos/icon.icns to build/icon.icns for macOS.`);
        } catch (err) {
          console.error('Failed to copy pre-generated icon.icns to build/icon.icns:', err);
        }
      } else {
        console.log(`${modeKey}/macos/icon.icns not found or is placeholder at ${macIconSource}.`);
      }

      // Populate multi-resolution macOS icons in build/icons and build/icon.iconset
      const buildIconsSubdir = path.join(buildIconDir, 'icons');
      const buildIconsetSubdir = path.join(buildIconDir, 'icon.iconset');
      if (!fs.existsSync(buildIconsSubdir)) fs.mkdirSync(buildIconsSubdir, { recursive: true });
      if (!fs.existsSync(buildIconsetSubdir)) fs.mkdirSync(buildIconsetSubdir, { recursive: true });

      // Map and populate multi-resolution macOS icons in build/icons and build/icon.iconset
      const macIconFramesMapping = [
        { dest: 'icon_512x512@2x.png', candidates: ['1024x1024.png', '512x512@2x.png', '1024.png', 'icon_512x512@2x.png', 'icon_1024x1024.png', 'icon_1024.png'] },
        { dest: 'icon_512x512.png', candidates: ['512x512.png', '512.png', 'icon_512x512.png', 'icon_512.png'] },
        { dest: 'icon_256x256@2x.png', candidates: ['512x512.png', '256x256@2x.png', '512.png', 'icon_256x256@2x.png', 'icon_512x512.png', 'icon_512.png'] },
        { dest: 'icon_256x256.png', candidates: ['256x256.png', '256.png', 'icon_256x256.png', 'icon_256.png'] },
        { dest: 'icon_128x128@2x.png', candidates: ['256x256.png', '128x128@2x.png', '256.png', 'icon_128x128@2x.png', 'icon_256x256.png', 'icon_256.png'] },
        { dest: 'icon_128x128.png', candidates: ['128x128.png', '128.png', 'icon_128x128.png', 'icon_128.png'] },
        { dest: 'icon_32x32@2x.png', candidates: ['64x64.png', '32x32@2x.png', '64.png', 'icon_32x32@2x.png', 'icon_64x64.png', 'icon_64.png'] },
        { dest: 'icon_32x32.png', candidates: ['32x32.png', '32.png', 'icon_32x32.png', 'icon_32.png'] },
        { dest: 'icon_16x16@2x.png', candidates: ['32x32.png', '16x16@2x.png', '32.png', 'icon_16x16@2x.png', 'icon_32x32.png', 'icon_32.png'] },
        { dest: 'icon_16x16.png', candidates: ['16x16.png', '16.png', 'icon_16x16.png', 'icon_16.png'] }
      ];

      if (fs.existsSync(macIconDir)) {
        try {
          const macPngs = fs.readdirSync(macIconDir).filter((f) => f.endsWith('.png') && !f.toLowerCase().includes('px.png'));
          for (const pngFile of macPngs) {
            const srcPath = path.join(macIconDir, pngFile);
            fs.copyFileSync(srcPath, path.join(buildIconsSubdir, pngFile));
          }

          for (const frame of macIconFramesMapping) {
            let foundSource = null;
            for (const cand of frame.candidates) {
              const candPath = path.join(macIconDir, cand);
              if (fs.existsSync(candPath) && fs.statSync(candPath).size > 100) {
                foundSource = candPath;
                break;
              }
            }

            // Fallback for 1024x1024 frame to master icon.png
            if (!foundSource && frame.dest === 'icon_512x512@2x.png') {
              if (fs.existsSync(modeIconPath) && fs.statSync(modeIconPath).size > 100) {
                foundSource = modeIconPath;
              }
            }

            if (foundSource) {
              fs.copyFileSync(foundSource, path.join(buildIconsetSubdir, frame.dest));
              fs.copyFileSync(foundSource, path.join(buildIconsSubdir, frame.dest));
            }
          }

          console.log(`Successfully populated macOS icons in build/icons/ and build/icon.iconset/ for ${mode}`);
        } catch (copyErr) {
          console.warn('Could not populate build/icons or build/icon.iconset:', copyErr.message);
        }
      }

      // If running on macOS host and build/icon.icns is still missing, attempt native compilation via iconutil
      if (process.platform === 'darwin' && !fs.existsSync(path.join(buildIconDir, 'icon.icns'))) {
        try {
          console.log('Compiling build/icon.icns via native macOS iconutil from build/icon.iconset...');
          execSync(`iconutil -c icns "${buildIconsetSubdir}" -o "${path.join(buildIconDir, 'icon.icns')}"`, { stdio: 'inherit' });
          console.log('Successfully generated build/icon.icns via iconutil.');
        } catch (iconutilErr) {
          console.warn('Native iconutil generation fallback skipped or failed:', iconutilErr.message);
        }
      }

      if (isRealIconFile(winIconSource)) {
        try {
          fs.copyFileSync(winIconSource, path.join(buildIconDir, 'icon.ico'));
          console.log(`Successfully copied pre-generated ${modeKey}/windows/icon.ico to build/icon.ico for Windows.`);
        } catch (err) {
          console.error('Failed to copy pre-generated icon.ico to build/icon.ico:', err);
        }
      } else {
        console.log(`${modeKey}/windows/icon.ico not found or is placeholder at ${winIconSource}.`);
      }

      // Ensure explicit icon configuration is specified inside the build config schema
      if (!pkg.build.mac) pkg.build.mac = {};
      pkg.build.mac.icon = "build/icon.icns";
      pkg.build.mac.extendInfo = {
        NSDocumentsFolderUsageDescription: "AMP requires access to local folders to schedule, read, and log announcement audio.",
        NSDownloadsFolderUsageDescription: "AMP requires access to your folders for audio and log storage.",
        NSDesktopFolderUsageDescription: "AMP requires access to your selected folders.",
        NSFileSharingEnabled: true
      };

      if (!pkg.build.win) pkg.build.win = {};
      pkg.build.win.icon = "build/icon.ico";

      // Configure Windows specific artifactNames dynamically in running package settings
      if (!pkg.build.nsis) pkg.build.nsis = {};
      pkg.build.nsis.differentialPackage = false;
      pkg.build.nsis.artifactName = "${productName}-${version}-Windows-Installer.${ext}";
      pkg.build.nsis.shortcutName = `AMP ${mode}`;
      pkg.build.nsis.uninstallDisplayName = `AMP ${mode}`;

      if (!pkg.build.dmg) pkg.build.dmg = {};

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

        await packageWindowsPortableZip(mode, pkg.version);
      } else {
        console.log(`Packaging Electron app for default platform...`);
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

        execSync(`npx electron-builder --publish never`, {
          stdio: 'inherit',
          env: { ...process.env }
        });

        await packageWindowsPortableZip(mode, pkg.version);
      }
      console.log(`Successfully completed packaging for mode: ${mode}!`);
    };

    // --- Step 0: Sync Remote Icons from assets branch ---
    await syncRemoteIcons();

    // --- Step 1: Build & Package Admin ---
    console.log('\n=========================================');
    console.log(' BUILDING ANNOUNCEMENT-ER ADMIN ');
    console.log('=========================================\n');
    cleanBuild();
    compileAssets('Admin');
    await packageApp('Admin');

    // --- Step 2: Build & Package Live ---
    console.log('\n=========================================');
    console.log(' BUILDING ANNOUNCEMENT-ER LIVE ');
    console.log('=========================================\n');
    cleanBuild();
    compileAssets('Live');
    await packageApp('Live');

    // --- Step 3: Build & Package Studio ---
    console.log('\n=========================================');
    console.log(' BUILDING ANNOUNCEMENT-ER STUDIO ');
    console.log('=========================================\n');
    cleanBuild();
    compileAssets('Studio');
    await packageApp('Studio');

    console.log('\nTriple-build packaged successfully!');

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
    process.exit(process.exitCode || 0);
  }
})();
