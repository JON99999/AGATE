const { app, BrowserWindow, screen, Menu, session, dialog, ipcMain, shell } = require('electron');
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

// ------------------------------------------------------------------------------------------
// 100% ISOLATED PORTABLE MODE CONFIGURATION
// ------------------------------------------------------------------------------------------
// When running in portable mode (NSIS portable executable or extracted folder), redirect all
// Electron/Chromium paths (userData, appData, cache, cookies, localStorage) to a subfolder
// inside the launch folder. This prevents reading or writing anything to the host AppData.
const isExplicitPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;
const isExtractedPortable = !isMac && !process.defaultApp && path.basename(process.execPath).toLowerCase().includes('portable');
const isPortableMode = isExplicitPortable || isExtractedPortable;

if (isPortableMode) {
  const portableLaunchDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  process.env.PORTABLE_EXECUTABLE_DIR = portableLaunchDir;
  
  const portableUserData = path.join(portableLaunchDir, 'userData');
  try {
    if (!fs.existsSync(portableUserData)) {
      fs.mkdirSync(portableUserData, { recursive: true });
    }
    app.setPath('userData', portableUserData);
    app.setPath('appData', portableLaunchDir);
    console.log(`[Portable Mode] Isolated userData path set to: ${portableUserData}`);
  } catch (err) {
    console.error('[Portable Mode] Failed to set custom isolated userData path:', err);
  }
}
// ------------------------------------------------------------------------------------------

// Ensure single running instance per machine
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('Another instance of Agate is already running. Exiting duplicate process.');
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Focus main window if user tries to launch another instance
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

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
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    console.log(`Windows Portable mode active. Executable directory: ${process.env.PORTABLE_EXECUTABLE_DIR}`);
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

let isLiveReadMenuLocked = false;
let currentActiveTab = 'player';
let currentCalendarSubTab = 'calendar';

function buildAppMenu(activeTab = 'player', calendarSubTab = 'calendar') {
  currentActiveTab = activeTab;
  currentCalendarSubTab = calendarSubTab;

  if (appMode !== 'Admin') {
    Menu.setApplicationMenu(null);
    return;
  }

  const sendNavigate = (tab, subTab) => {
    if (isLiveReadMenuLocked) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('navigate-tab', { tab, subTab });
    }
  };

  const openSourceLicensesDetail = `Agate (A Gated Announcement Tracking Engine) is licensed under the GNU General Public License v3.0 (GPLv3).

Key Open Source Libraries & Components:
• Electron (Chromium & Node.js runtime) - MIT License
• React & React DOM - MIT License
• Express - MIT License
• Vite - MIT License
• Tailwind CSS - MIT License
• Lucide Icons - ISC License
• Motion (motion/react) - MIT License
• electron-builder - MIT License
• Google GenAI & Google APIs - Apache 2.0
• node-cron - ISC License
• dotenv - BSD-2-Clause

For full component listings and complete license texts, see OPEN_SOURCE_LICENSES.md and LICENSE in the application directory.`;

  const macAppMenu = isMac ? {
    label: app.name || 'Agate',
    submenu: [
      { role: 'about' },
      {
        label: 'Open Source Licenses',
        enabled: !isLiveReadMenuLocked,
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Open Source Licenses',
            message: 'Open Source Licenses and Third-Party Notices',
            detail: openSourceLicensesDetail
          });
        }
      },
      { type: 'separator' },
      { role: 'hide', enabled: !isLiveReadMenuLocked },
      { role: 'hideOthers', enabled: !isLiveReadMenuLocked },
      { role: 'unhide', label: 'Show All', enabled: !isLiveReadMenuLocked },
      { type: 'separator' },
      { role: 'quit' }
    ]
  } : null;

  const fileMenu = {
    label: 'File',
    submenu: [
      ...(isMac ? [
        { role: 'close', label: 'Close Window', accelerator: 'Cmd+W', enabled: !isLiveReadMenuLocked }
      ] : [
        { role: 'quit', label: 'Exit', accelerator: 'Alt+F4' }
      ])
    ]
  };

  const viewMenu = {
    label: 'View',
    submenu: [
      {
        label: 'Player',
        type: 'radio',
        checked: activeTab === 'player',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('player')
      },
      {
        label: 'Calendar',
        type: activeTab === 'calendar' ? 'submenu' : 'radio',
        checked: activeTab === 'calendar',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('calendar', calendarSubTab || 'calendar'),
        ...(activeTab === 'calendar' ? {
          submenu: [
            {
              label: 'Calendar Grid',
              type: 'radio',
              checked: calendarSubTab === 'calendar',
              enabled: !isLiveReadMenuLocked,
              click: () => sendNavigate('calendar', 'calendar')
            },
            {
              label: 'Interstitials',
              type: 'radio',
              checked: calendarSubTab === 'list',
              enabled: !isLiveReadMenuLocked,
              click: () => sendNavigate('calendar', 'list')
            },
            {
              label: 'Shows',
              type: 'radio',
              checked: calendarSubTab === 'shows',
              enabled: !isLiveReadMenuLocked,
              click: () => sendNavigate('calendar', 'shows')
            }
          ]
        } : {})
      },
      {
        label: 'Log',
        type: 'radio',
        checked: activeTab === 'log',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('log')
      },
      { type: 'separator' },
      {
        label: 'Folders',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('folders')
      },
      { type: 'separator' },
      {
        label: 'Reload',
        enabled: !isLiveReadMenuLocked,
        accelerator: isMac ? 'Cmd+R' : 'Ctrl+R',
        click: (item, focusedWindow) => {
          if (focusedWindow) focusedWindow.reload();
        }
      }
    ]
  };

  const windowMenu = {
    label: 'Window',
    submenu: [
      { role: 'minimize', accelerator: isMac ? 'Cmd+M' : undefined, enabled: !isLiveReadMenuLocked },
      ...(isMac ? [
        { role: 'zoom', enabled: !isLiveReadMenuLocked }
      ] : [
        {
          label: 'Maximize',
          enabled: !isLiveReadMenuLocked,
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
        { role: 'close', enabled: !isLiveReadMenuLocked }
      ])
    ]
  };

  const helpMenu = {
    label: 'Help',
    submenu: [
      {
        label: 'Local Help / User Manual',
        enabled: !isLiveReadMenuLocked,
        click: () => sendNavigate('help')
      },
      ...(!isMac ? [
        {
          label: 'Open Source Licenses',
          enabled: !isLiveReadMenuLocked,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Open Source Licenses',
              message: 'Open Source Licenses and Third-Party Notices',
              detail: openSourceLicensesDetail
            });
          }
        },
        {
          label: 'About Agate',
          enabled: !isLiveReadMenuLocked,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Agate',
              message: 'Agate - A Gated Announcement Tracking Engine',
              detail: `Version 0.14.2\nCross-platform Desktop MP3 Scheduler optimized for MacOS and Windows.`
            });
          }
        }
      ] : [])
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
  currentActiveTab = tab;
  currentCalendarSubTab = subTab;
  buildAppMenu(tab, subTab);
});

ipcMain.on('set-live-read-active', (event, active) => {
  isLiveReadMenuLocked = !!active;
  buildAppMenu(currentActiveTab, currentCalendarSubTab);
});

function createWindow() {
  const disableShadows = DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC && isIntelMac;

  const appTitle = appMode === 'Live'
    ? "Agate Live"
    : appMode === 'Studio'
      ? "Agate Studio"
      : "Agate Admin";

  let windowOptions = {
    height: 800,
    title: appTitle,
    fullscreenable: false,
    hasShadow: !disableShadows, // OPTION 3: Disable window shadows on Intel Macs to bypass expensive WindowServer calculations
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: appMode === 'Admin',
      preload: path.join(__dirname, 'preload.cjs'),
    },
  };

  if (appMode !== 'Admin') {
    // Disable dev tools and remove menus for Live and Studio versions
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

  mainWindow.on('close', function () {
    // When the main window is closed on non-macOS platforms, destroy child popout windows and quit
    if (process.platform !== 'darwin') {
      if (liveReadWindow && !liveReadWindow.isDestroyed()) {
        try {
          liveReadWindow.destroy();
        } catch (_) {}
        liveReadWindow = null;
      }
      app.quit();
    }
  });

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

app.on('before-quit', () => {
  // Ensure any secondary popouts are destroyed during application shutdown
  if (liveReadWindow && !liveReadWindow.isDestroyed()) {
    try {
      liveReadWindow.destroy();
    } catch (_) {}
    liveReadWindow = null;
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// Ensure backend server sockets and background Node threads terminate cleanly
app.on('will-quit', () => {
  try {
    process.exit(0);
  } catch (_) {}
});

// ==========================================================================================
// ELECTRON IPC HANDLERS FOR LIVE READ POP-OUT WINDOW (PHASE 2)
// ==========================================================================================
let liveReadWindow = null;
let currentLiveReadData = null; // Holds { name, path, content, isScript, text }

global.spawnLiveRead = async (data) => {
  currentLiveReadData = data;

  if (liveReadWindow && !liveReadWindow.isDestroyed()) {
    try {
      liveReadWindow.close();
    } catch (e) {}
  }

  const disableShadows = DISABLE_WINDOW_SHADOWS_FOR_INTEL_MAC && isIntelMac;

  liveReadWindow = new BrowserWindow({
    width: 720,
    height: 620,
    minWidth: 480,
    minHeight: 380,
    title: "Live Read Script - " + (data.name || data.interstitialName || "Script"),
    alwaysOnTop: true, // Floats over other apps for the broadcaster
    resizable: true,
    fullscreenable: false,
    hasShadow: !disableShadows,
    titleBarStyle: isMac ? 'hiddenInset' : 'default', // Minimally bordered / modern standard title bar
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: appMode === 'Admin',
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  liveReadWindow.setMenu(null);

  // Load the web app with a special query parameter indicating it is a popout
  const popoutUrl = `http://127.0.0.1:${serverPort}/?popout=true`;
  liveReadWindow.loadURL(popoutUrl);

  liveReadWindow.once('ready-to-show', () => {
    if (liveReadWindow && !liveReadWindow.isDestroyed()) {
      liveReadWindow.show();
      liveReadWindow.focus();
    }
  });

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('live-read-opened', data);
  }

  isLiveReadMenuLocked = true;
  buildAppMenu(currentActiveTab, currentCalendarSubTab);

  liveReadWindow.on('closed', () => {
    liveReadWindow = null;
    isLiveReadMenuLocked = false;
    buildAppMenu(currentActiveTab, currentCalendarSubTab);
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

ipcMain.handle('focus-live-read-window', async () => {
  if (liveReadWindow && !liveReadWindow.isDestroyed()) {
    liveReadWindow.show();
    liveReadWindow.focus();
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

ipcMain.handle('browse-folder', async (event, defaultPath) => {
  try {
    const focusedWin = BrowserWindow.getFocusedWindow() || mainWindow;
    if (focusedWin && !focusedWin.isDestroyed()) {
      focusedWin.focus();
    }
    
    // Ensure default directory exists or fallback safely
    const dialogOptions = {
      title: 'Select Folder Destination',
      properties: ['openDirectory', 'createDirectory']
    };
    if (defaultPath && fs.existsSync(defaultPath)) {
      dialogOptions.defaultPath = defaultPath;
    } else if (isPortableMode && process.env.PORTABLE_EXECUTABLE_DIR && fs.existsSync(process.env.PORTABLE_EXECUTABLE_DIR)) {
      dialogOptions.defaultPath = process.env.PORTABLE_EXECUTABLE_DIR;
    } else {
      dialogOptions.defaultPath = app.getPath('documents') || app.getPath('home');
    }
    
    // Asynchronous showOpenDialog attached directly to focused window ensures proper z-order and foreground display on macOS
    const result = focusedWin && !focusedWin.isDestroyed()
      ? await dialog.showOpenDialog(focusedWin, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);
      
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: true, cancelled: true };
  } catch (err) {
    console.error('Failed to open native directory browse dialog:', err);
    return { success: false, error: err.message || 'Failed to open directory selection dialog.' };
  }
});

ipcMain.handle('open-path', async (event, targetPath) => {
  try {
    if (!targetPath || typeof targetPath !== 'string') {
      return { success: false, error: 'Valid directory path is required' };
    }
    const trimmedPath = targetPath.trim();
    if (!fs.existsSync(trimmedPath)) {
      // Attempt to auto-create directory if user manually typed a valid new path
      try {
        fs.mkdirSync(trimmedPath, { recursive: true });
      } catch (mkdirErr) {
        return { success: false, error: `Directory does not exist and could not be created: ${trimmedPath}` };
      }
    }
    
    // On macOS, try showItemInFolder or openPath natively
    if (process.platform === 'darwin') {
      shell.showItemInFolder(trimmedPath);
      return { success: true };
    }
    
    // Default native open
    const errMsg = await shell.openPath(targetPath);
    if (errMsg) {
      console.warn('shell.openPath returned warning/error:', errMsg);
      return { success: false, error: errMsg };
    }
    return { success: true };
  } catch (err) {
    console.error('Failed to open path natively via shell:', err);
    return { success: false, error: err.message || 'Failed to open path' };
  }
});


