const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function startServer() {
  // Set environment for the server
  process.env.NODE_ENV = 'production';
  process.env.PORT = '3000';

  // Import and run the compiled production server
  // Because it's bundled as CommonJS (.cjs), we can simply require it
  try {
    const serverPath = path.join(__dirname, 'dist', 'server.cjs');
    require(serverPath);
    console.log('Backend server started successfully.');
  } catch (err) {
    console.error('Failed to start backend server:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "Minute-Sync Scheduler v0.1",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Optional: add a custom icon here later
  });

  // Small delay to ensure server is bounded to port 3000
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 2000);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

app.on('ready', () => {
  startServer();
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
