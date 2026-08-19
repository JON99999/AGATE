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
  onLiveReadClosed: (callback) => {
    ipcRenderer.removeAllListeners('live-read-closed');
    ipcRenderer.on('live-read-closed', (event) => callback());
  },
  closeLiveReadWindow: () => ipcRenderer.invoke('close-live-read-window'),
  onNavigate: (callback) => {
    ipcRenderer.removeAllListeners('navigate-tab');
    ipcRenderer.on('navigate-tab', (event, data) => callback(data));
  },
  setActiveTabMenu: (tab, subTab) => ipcRenderer.send('set-active-tab-menu', { tab, subTab }),
});
