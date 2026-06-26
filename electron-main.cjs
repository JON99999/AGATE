const { app, BrowserWindow, screen, Menu, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const http = require('http');

// ==========================================================================================
// INTEL MAC PERFORMANCE OPTIMIZATIONS (1-3) FOR MOUSE-MOVEMENT CPU LAG
// ==========================================================================================
// Under user rule guidelines, these options are clearly grouped and notated below for easy
// toggle, adjustments, or future removal if needed.

const isMac = process.platform === 'darwin';
const isIntelMac = isMac && process.arch === 'x64';

// OPTION 1: Use Updated Electron Framework Version
// Note: Handled in package.json. The application currently targets and runs on a very modern 
// Electron version ("^42.1.0"), ensuring that the underlying Chromium engine has modern patches
// to address historical macOS Sequoia/Tahoe drawing bugs.

// OPTION 2: Disable Hardware Acceleration (Bypasses rendering bottlenecks on Intel graphics card drivers)
const DISABLE_HARDWARE_ACCELERATION_FOR_INTEL_MAC = true;
if (DISABLE_HARDWARE_ACCELERATION_FOR_INTEL_MAC && isIntelMac) {
  console.log('[Intel Mac Optimization] Option 2 Active: Disabling Hardware Acceleration to bypass GPU rendering lag.');
  app.disableHardwareAcceleration();
}

// OPTION 3: Disable App Window Shadows (Drastically reduces WindowServer compositing overhead during mouse movement)
const DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC = true;
// ==========================================================================================

let mainWindow;
let appMode = 'Admin';
let serverPort = 3000;

try {
  const configPath = path.join(__dirname, 'dist', 'app-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.mode) {
      appMode = config.mode;
    }
  }
} catch (e) {
  console.log('Using default App Mode: Admin');
}

function getFreePort(startingPort = 3000) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      resolve(getFreePort(startingPort + 1));
    });
    server.listen(startingPort, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => {
        resolve(port);
      });
    });
  });
}

async function startServer() {
  try {
    serverPort = await getFreePort(3000);
    console.log(`Resolved free port for desktop server: ${serverPort}`);
  } catch (err) {
    console.error('Error finding free port, defaulting to 3000:', err);
    serverPort = 3000;
  }

  // Set environment for the server
  process.env.NODE_ENV = 'production';
  process.env.PORT = String(serverPort);
  try {
    process.env.APP_USER_DATA_PATH = app.getPath('userData');
    console.log(`Setting user data path env: ${process.env.APP_USER_DATA_PATH}`);
  } catch (err) {
    console.error('Failed to resolve electron userData path:', err);
  }

  // Import and run the compiled production server
  // Because it's bundled as CommonJS (.cjs), we can simply require it
  try {
    const serverPath = path.join(__dirname, 'dist', 'server.cjs');
    require(serverPath);
    console.log(`Backend server started successfully on port ${serverPort}.`);
  } catch (err) {
    console.error('Failed to start backend server:', err);
  }
}

function createWindow() {
  const disableShadows = DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC && isIntelMac;

  let windowOptions = {
    height: 800,
    title: appMode === 'Player' ? "Interstitial-er Player" : "Interstitial-er Admin",
    hasShadow: !disableShadows, // OPTION 3: Disable window shadows on Intel Macs to bypass expensive WindowServer calculations
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: appMode !== 'Player',
    },
  };

  if (appMode === 'Player') {
    // Disable dev tools and remove menus for Player version
    Menu.setApplicationMenu(null);

    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { height } = primaryDisplay.workAreaSize;
      windowOptions.width = 250;
      windowOptions.height = height;
      windowOptions.x = 0;
      windowOptions.y = 0;
      windowOptions.minWidth = 250;
      windowOptions.maxWidth = 250;
    } catch (e) {
      windowOptions.width = 250;
      windowOptions.height = 800;
      windowOptions.minWidth = 250;
      windowOptions.maxWidth = 250;
    }
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Active polling inter-process status loop to load as soon as port is listening
  function loadAppWhenReady(port, url, win, attempts = 0) {
    if (attempts > 100) { // 100 * 100ms = 10s max timeout
      console.log('Timeout waiting for backend server. Loading URL anyway.');
      win.loadURL(url);
      return;
    }
    const req = http.get(`http://127.0.0.1:${port}/api/settings`, (res) => {
      if (res.statusCode === 200) {
        console.log(`Backend server is ready on port ${port}. Loading URL.`);
        win.loadURL(url);
      } else {
        setTimeout(() => loadAppWhenReady(port, url, win, attempts + 1), 100);
      }
    });
    req.on('error', () => {
      setTimeout(() => loadAppWhenReady(port, url, win, attempts + 1), 100);
    });
  }

  loadAppWhenReady(serverPort, `http://127.0.0.1:${serverPort}`, mainWindow);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  await startServer();
  createWindow();

  session.defaultSession.on('will-download', (event, item, webContents) => {
    // Set standard default path to Downloads folder
    const fileName = item.getFilename();
    const defaultPath = path.join(app.getPath('downloads'), fileName);

    // Show native save dialog synchronously
    const filePath = dialog.showSaveDialogSync(BrowserWindow.getFocusedWindow() || mainWindow, {
      title: 'Save Exported Log File',
      defaultPath: defaultPath,
      buttonLabel: 'Save'
    });

    if (filePath) {
      item.setSavePath(filePath);
    } else {
      event.preventDefault();
    }
  });
});

app.on('window-all-closed', function () {
  app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// Ensure server dies when electron exits
app.on('will-quit', () => {
  // Graceful exit is handled by electron shutting down the process
});
