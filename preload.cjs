const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  spawnLiveRead: (data) => ipcRenderer.invoke('spawn-live-read', data),
  getLiveReadData: () => ipcRenderer.invoke('get-live-read-data'),
  logLiveReadCommit: (logEntry) => ipcRenderer.invoke('log-live-read-commit', logEntry),
  onLiveReadLogged: (callback) => {
    // Remove existing listeners first to avoid double registration
    ipcRenderer.removeAllListeners('live-read-logged');
    ipcRenderer.on('live-read-logged', (event, logEntry) => callback(logEntry));
  },
  closeLiveReadWindow: () => ipcRenderer.invoke('close-live-read-window'),
});
