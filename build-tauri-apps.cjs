const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const tauriConfPath = path.join(__dirname, 'src-tauri', 'tauri.conf.json');
const tauriConfBakPath = path.join(__dirname, 'src-tauri', 'tauri.conf.json.bak');

console.log('Starting custom double-build process for Tauri (Player/Admin)...');

// 1. Back up tauri.conf.json
try {
  if (fs.existsSync(tauriConfPath)) {
    fs.copyFileSync(tauriConfPath, tauriConfBakPath);
    console.log('Successfully backed up tauri.conf.json.');
  } else {
    console.error('Tauri conf file not found at:', tauriConfPath);
    process.exit(1);
  }
} catch (err) {
  console.error('Failed to back up tauri.conf.json', err);
  process.exit(1);
}

function restoreTauriConf() {
  try {
    if (fs.existsSync(tauriConfBakPath)) {
      fs.copyFileSync(tauriConfBakPath, tauriConfPath);
      fs.unlinkSync(tauriConfBakPath);
      console.log('Successfully restored original tauri.conf.json.');
    }
  } catch (err) {
    console.error('Critical: Failed to restore tauri.conf.json!', err);
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
    // --- Step 0: Sync Remote Icons from assets branch ---
    await syncRemoteIcons();

    // Ensure the local icons directory exists inside src-tauri
    const tauriIconsDir = path.join(__dirname, 'src-tauri', 'icons');
    if (!fs.existsSync(tauriIconsDir)) {
      fs.mkdirSync(tauriIconsDir, { recursive: true });
    }

    // Copy Electron-builder assets dynamically into the tauri/icons bundle if they exist
    const sourceMacIcon = path.join(__dirname, 'src', 'assets', 'images', 'mac', 'icon.icns');
    const sourceWinIcon = path.join(__dirname, 'src', 'assets', 'images', 'win', 'icon.ico');
    const sourceUserPng = path.join(__dirname, 'src', 'assets', 'images', 'user-icon.png');
    const defaultPng = path.join(__dirname, 'src', 'assets', 'images', 'interstitialer_icon_1779637727966.png');

    const fileMap = [
      { src: sourceMacIcon, dest: path.join(tauriIconsDir, 'icon.icns') },
      { src: sourceWinIcon, dest: path.join(tauriIconsDir, 'icon.ico') },
      { src: sourceUserPng, dest: path.join(tauriIconsDir, '128x128.png') },
      { src: sourceUserPng, dest: path.join(tauriIconsDir, '128x128@2x.png') },
      { src: sourceUserPng, dest: path.join(tauriIconsDir, '32x32.png') }
    ];

    fileMap.forEach((m) => {
      try {
        let finalSrc = m.src;
        // Fall back to default placeholder PNG if user-icon.png is not found
        if (!fs.existsSync(finalSrc) && finalSrc.endsWith('.png') && fs.existsSync(defaultPng)) {
          finalSrc = defaultPng;
        }
        if (fs.existsSync(finalSrc)) {
          fs.copyFileSync(finalSrc, m.dest);
          console.log(`Copied ${path.basename(finalSrc)} to Tauri icons destination: ${path.basename(m.dest)}`);
        }
      } catch (err) {
        console.log(`[INFO] Could not sync icon asset to Tauri during script start: ${err.message}`);
      }
    });

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

      // Write app-config.json configuration
      const configPath = path.join(__dirname, 'dist', 'app-config.json');
      fs.writeFileSync(configPath, JSON.stringify({ mode }, null, 2));
      console.log(`Wrote dist/app-config.json for mode: ${mode}.`);
    };

    const packageAppTauri = (mode) => {
      console.log(`Updating tauri.conf.json for packaging mode: ${mode}...`);
      const tConf = JSON.parse(fs.readFileSync(tauriConfBakPath, 'utf8'));

      // Inject App names & IDs
      tConf.package.productName = `Interstitial-er ${mode}`;
      tConf.tauri.bundle.identifier = `com.minutesync.scheduler.${mode.toLowerCase()}`;
      
      // Save revised tauri.conf.json
      fs.writeFileSync(tauriConfPath, JSON.stringify(tConf, null, 2));

      // Determine targets to build
      let targets = [];
      if (process.platform === 'darwin') {
        console.log(`Packaging Tauri app for Mac (both Intel and Apple Silicon)...`);
        // Ensure macOS targets are added via rustup
        try {
          console.log('Ensuring macOS compilation targets via rustup...');
          execSync('rustup target add aarch64-apple-darwin x86_64-apple-darwin', { stdio: 'inherit' });
        } catch (err) {
          console.log(`[INFO] Could not run rustup targets addition: ${err.message}`);
        }
        targets = ['aarch64-apple-darwin', 'x86_64-apple-darwin'];
      } else if (process.platform === 'win32') {
        console.log(`Packaging Tauri app for Windows...`);
        targets = [null]; // Default host target
      } else {
        targets = [null];
      }

      for (const target of targets) {
        let cmd = 'npx tauri build';
        if (target) {
          cmd += ` --target ${target}`;
          console.log(`Running Tauri build for target: ${target}`);
        }
        
        try {
          execSync(cmd, { stdio: 'inherit', env: { ...process.env } });
          console.log(`Successfully completed build for Tauri mode: ${mode} (${target || 'host'})!`);
        } catch (buildErr) {
          console.error(`[ERROR] Build failed for target ${target || 'host'}:`, buildErr.message);
          if (process.platform === 'darwin' || process.platform === 'win32') {
            throw buildErr;
          }
        }

        // Determine target directory where bundles are generated
        const targetDir = target
          ? path.join(__dirname, 'src-tauri', 'target', target, 'release', 'bundle')
          : path.join(__dirname, 'src-tauri', 'target', 'release', 'bundle');
          
        const releaseDestDir = path.join(__dirname, 'release', 'tauri');

        if (!fs.existsSync(releaseDestDir)) {
          fs.mkdirSync(releaseDestDir, { recursive: true });
        }

        console.log(`Locating and copying Tauri bundles for mode: ${mode} (${target || 'host'})...`);
        
        if (fs.existsSync(targetDir)) {
          // Recursively find .msi, .exe, .dmg, .zip files
          const filesToCopy = [];
          const scanDirectory = (dir) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
              const p = path.join(dir, file);
              const stat = fs.statSync(p);
              if (stat.isDirectory()) {
                scanDirectory(p);
              } else {
                const ext = path.extname(file).toLowerCase();
                if (['.msi', '.exe', '.dmg', '.zip', '.app'].includes(ext)) {
                  filesToCopy.push(p);
                }
              }
            }
          };

          scanDirectory(targetDir);

          for (const file of filesToCopy) {
            const ext = path.extname(file);
            
            let suffix = '';
            if (process.platform === 'darwin') {
              if (target && target.includes('x86_64')) {
                suffix = 'Mac-Intel-legacy';
              } else if (target && target.includes('aarch64')) {
                suffix = 'Mac-Silicon-new';
              } else {
                if (file.includes('x64') || file.includes('x86_64')) {
                  suffix = 'Mac-Intel-legacy';
                } else {
                  suffix = 'Mac-Silicon-new';
                }
              }
            } else {
              // Windows
              if (ext.toLowerCase() === '.msi') {
                suffix = 'Windows-Installer';
              } else if (ext.toLowerCase() === '.zip') {
                suffix = 'Windows-Portable';
              } else {
                suffix = 'Windows';
              }
            }

            const finalProductName = `Interstitial-er ${mode}`;
            const version = tConf.package.version;
            
            const tauriRenamed = `${finalProductName}-${version}-${suffix}-tauri${ext}`;
            const destFilePath = path.join(releaseDestDir, tauriRenamed);
            
            fs.copyFileSync(file, destFilePath);
            console.log(`[Tauri Output] Copied and renamed bundle: ${path.basename(file)} -> release/tauri/${tauriRenamed}`);
          }
        } else {
          console.log(`[INFO] No bundle folder found inside Tauri target build workspace at: ${targetDir}`);
        }
      }
    };

    // --- Step 1: Build & Package Admin ---
    console.log('\n======================================================');
    console.log(' BUILDING TAURI INTERSTITIAL-ER ADMIN ');
    console.log('======================================================\n');
    cleanBuild();
    compileAssets('Admin');
    packageAppTauri('Admin');

    // --- Step 2: Build & Package Player ---
    console.log('\n======================================================');
    console.log(' BUILDING TAURI INTERSTITIAL-ER PLAYER ');
    console.log('======================================================\n');
    cleanBuild();
    compileAssets('Player');
    packageAppTauri('Player');

    console.log('\n======================================================');
    console.log(' TAURI DOUBLE-BUILD COMPLETED ');
    console.log(' All bundles copied cleanly into release/tauri/ with -Tauri tags!');
    console.log('======================================================\n');

  } catch (err) {
    console.error('\nAn error occurred during Tauri build/packaging:', err);
    process.exitCode = 1;
  } finally {
    restoreTauriConf();
  }
})();
