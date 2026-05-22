const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

    console.log(`Packaging Electron app for mode: ${mode}...`);
    // Only publish on GitHub Actions when GH_TOKEN/GITHUB_TOKEN is present, fallback to local packaging (publish never) otherwise
    const isCI = process.env.GITHUB_ACTIONS === 'true';
    const publishFlag = isCI ? '--publish always' : '--publish never';

    // Target current platform and define the desired architectures (macOS: arm64 + x64, Windows: x64)
    const platformFlag = process.platform === 'darwin' ? '--mac --x64 --arm64' : process.platform === 'win32' ? '--win --x64' : '';

    execSync(`npx electron-builder ${platformFlag} ${publishFlag}`, {
      stdio: 'inherit',
      env: { ...process.env }
    });
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

  console.log('\nDouble-build packaged successfully!');

} catch (err) {
  console.error('\nAn error occurred during build/packaging:', err);
  process.exitCode = 1;
} finally {
  restorePkg();
}
