const { app, BrowserWindow, screen, Menu, session, dialog, ipcMain } = require('electron');
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
const DISABLE_HARDWARE_ACCELERATION_FOR_INTEL_MAC = false; // Set to false to disable this optimization
if (DISABLE_HARDWARE_ACCELERATION_FOR_INTEL_MAC && isIntelMac) {
  console.log('[Intel Mac Optimization] Option 2 Active: Disabling Hardware Acceleration to bypass GPU rendering lag.');
  app.disableHardwareAcceleration();
}

// OPTION 3: Disable App Window Shadows (Drastically reduces WindowServer compositing overhead during mouse movement)
const DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC = false; // Set to false to disable this optimization
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

function getFreePort(startingPort = 3000, attempts = 0, maxAttempts = 100) {
  return new Promise((resolve, reject) => {
    if (attempts >= maxAttempts) {
      reject(new Error(`Could not find a free port within ${maxAttempts} attempts starting from port 3000.`));
      return;
    }
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      getFreePort(startingPort + 1, attempts + 1, maxAttempts)
        .then(resolve)
        .catch(reject);
    });
    server.listen(startingPort, '0.0.0.0', () => {
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

function buildAppMenu(activeTab = 'player', calendarSubTab = 'calendar') {
  if (appMode === 'Player') {
    Menu.setApplicationMenu(null);
    return;
  }

  const sendNavigate = (tab, subTab) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('navigate-tab', { tab, subTab });
    }
  };

  const macAppMenu = isMac ? {
    label: app.name || 'Interstitial-er',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' }
      /* REMOVED ITEM: Check for Updates (Commented out per spec)
      ,
      {
        label: 'Check for Updates...',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('check-for-updates');
          }
        }
      }
      */
    ]
  } : null;

  const fileMenu = {
    label: 'File',
    submenu: [
      ...(isMac ? [
        { role: 'close' },
        { type: 'separator' },
        { role: 'quit' }
      ] : [
        /* REMOVED ITEM: Check for Updates (Commented out per spec)
        {
          label: 'Check for Updates...',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('check-for-updates');
            }
          }
        },
        { type: 'separator' },
        */
        { role: 'quit', label: 'Exit', accelerator: 'Alt+F4' }
      ])
    ]
  };

  /* REMOVED MENU: Edit Menu (Commented out per spec)
  const editMenu = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  };
  */

  const viewMenu = {
    label: 'View',
    submenu: [
      {
        label: 'Player',
        type: 'radio',
        checked: activeTab === 'player',
        click: () => sendNavigate('player')
      },
      {
        label: 'Calendar',
        type: activeTab === 'calendar' ? 'submenu' : 'radio',
        checked: activeTab === 'calendar',
        click: () => sendNavigate('calendar', calendarSubTab || 'calendar'),
        ...(activeTab === 'calendar' ? {
          submenu: [
            {
              label: 'Calendar Grid',
              type: 'radio',
              checked: calendarSubTab === 'calendar',
              click: () => sendNavigate('calendar', 'calendar')
            },
            {
              label: 'Interstitials',
              type: 'radio',
              checked: calendarSubTab === 'list',
              click: () => sendNavigate('calendar', 'list')
            },
            {
              label: 'Shows',
              type: 'radio',
              checked: calendarSubTab === 'shows',
              click: () => sendNavigate('calendar', 'shows')
            }
          ]
        } : {})
      },
      {
        label: 'Log',
        type: 'radio',
        checked: activeTab === 'log',
        click: () => sendNavigate('log')
      },
      { type: 'separator' },
      {
        label: 'Folders',
        click: () => sendNavigate('folders')
      },
      { type: 'separator' },
      {
        label: 'Reload',
        accelerator: isMac ? 'Cmd+R' : 'Ctrl+R',
        click: (item, focusedWindow) => {
          if (focusedWindow) focusedWindow.reload();
        }
      },
      {
        label: 'Toggle Full Screen',
        accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
        click: (item, focusedWindow) => {
          if (focusedWindow) focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
        }
      }
      /* REMOVED ITEMS: Sync to System Clock & View Keyboard Shortcuts (Commented out per spec)
      ,
      {
        label: 'Sync to system clock',
        click: () => sendNavigate('sync-clock')
      },
      {
        label: 'View Keyboard Shortcuts',
        click: () => sendNavigate('keyboard-shortcuts')
      }
      */
    ]
  };

  const windowMenu = {
    label: 'Window',
    submenu: [
      { role: 'minimize', accelerator: isMac ? 'Cmd+M' : undefined },
      {
        label: 'Maximize',
        click: (item, focusedWindow) => {
          if (focusedWindow) {
            if (focusedWindow.isMaximized()) {
              focusedWindow.unmaximize();
            } else {
              focusedWindow.maximize();
            }
          }
        }
      },
      ...(isMac ? [
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'close', accelerator: 'Cmd+W' }
      ] : [
        { role: 'close', accelerator: 'Alt+F4' }
      ])
      /* REMOVED ITEMS: Open Live Read Viewer & Bring All to Front (Commented out per spec)
      ,
      {
        label: 'Open Live Read Viewer',
        click: () => {
          if (global.spawnLiveRead) global.spawnLiveRead({});
        }
      },
      { role: 'front' }
      */
    ]
  };

  const helpMenu = {
    label: 'Help',
    submenu: [
      {
        label: 'Local Help / User Manual',
        click: () => sendNavigate('help')
      },
      {
        label: 'About Interstitial-er',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About Interstitial-er',
            message: 'Interstitial-er',
            detail: `Version 0.12.4\nCross-platform Desktop MP3 Scheduler optimized for MacOS and Windows.`
          });
        }
      }
    ]
  };

  const template = [
    ...(macAppMenu ? [macAppMenu] : []),
    fileMenu,
    viewMenu,
    windowMenu,
    helpMenu
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.on('set-active-tab-menu', (event, { tab, subTab }) => {
  buildAppMenu(tab, subTab);
});

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
      preload: path.join(__dirname, 'preload.cjs'),
    },
  };

  if (appMode === 'Player') {
    // Disable dev tools and remove menus for Player version
    Menu.setApplicationMenu(null);

    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { x, y, width, height } = primaryDisplay.workArea;
      windowOptions.width = 250;
      windowOptions.height = height;
      windowOptions.x = x + width - 250;
      windowOptions.y = y;
      windowOptions.minWidth = 250;
      windowOptions.maxWidth = 250;
    } catch (e) {
      windowOptions.width = 250;
      windowOptions.height = 800;
      windowOptions.minWidth = 250;
      windowOptions.maxWidth = 250;
    }
  } else {
    buildAppMenu('player', 'calendar');
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

// ==========================================================================================
// ELECTRON IPC HANDLERS FOR LIVE READ POP-OUT WINDOW (PHASE 2)
// ==========================================================================================
let liveReadWindow = null;
let currentLiveReadData = null; // Holds { name, path, content, isScript, text }

global.spawnLiveRead = async (data) => {
  currentLiveReadData = data;

  if (liveReadWindow) {
    try {
      liveReadWindow.close();
    } catch (e) {}
  }

  const disableShadows = DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC && isIntelMac;

  liveReadWindow = new BrowserWindow({
    width: 650,
    height: 550,
    title: "Live Read Script - " + (data.name || "Script"),
    alwaysOnTop: true, // Floats over other apps
    resizable: true, // Resizable
    hasShadow: !disableShadows,
    titleBarStyle: isMac ? 'hiddenInset' : 'default', // Minimally bordered / modern standard title bar
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  // Load the web app with a special query parameter indicating it is a popout
  const popoutUrl = `http://127.0.0.1:${serverPort}/?popout=true`;
  liveReadWindow.loadURL(popoutUrl);

  liveReadWindow.on('closed', () => {
    liveReadWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('live-read-closed');
    }
  });

  return { success: true };
};

ipcMain.handle('spawn-live-read', async (event, data) => {
  return global.spawnLiveRead(data);
});

ipcMain.handle('get-live-read-data', async () => {
  return currentLiveReadData;
});

ipcMain.handle('log-live-read-commit', async (event, logEntry) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-read-logged', logEntry);
  }
  return { success: true };
});

ipcMain.handle('close-live-read-window', async () => {
  if (liveReadWindow) {
    try {
      liveReadWindow.close();
    } catch (e) {}
    liveReadWindow = null;
  }
  return { success: true };
});

