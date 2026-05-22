const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

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
  let windowOptions = {
    width: 1280,
    height: 800,
    title: appMode === 'Player' ? "Interstitial-er Player" : "Interstitial-er Admin",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  };

  if (appMode === 'Player') {
    try {
      const primaryDisplay = screen.getPrimaryDisplay();
      const { height } = primaryDisplay.workAreaSize;
      windowOptions.width = 200;
      windowOptions.height = height;
      windowOptions.x = 0;
      windowOptions.y = 0;
      windowOptions.minWidth = 200;
      windowOptions.maxWidth = 200;
    } catch (e) {
      windowOptions.width = 200;
      windowOptions.height = 800;
      windowOptions.minWidth = 200;
      windowOptions.maxWidth = 200;
    }
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Small delay to ensure server is bounded to the resolved port
  setTimeout(() => {
    mainWindow.loadURL(`http://localhost:${serverPort}`);
  }, 2000);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  await startServer();
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
