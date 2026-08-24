const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  spawnLiveRead: (data) => ipcRenderer.invoke('spawn-live-read', data),
  getLiveReadData: () => ipcRenderer.invoke('get-live-read-data'),
  logLiveReadCommit: (logEntry) => ipcRenderer.invoke('log-live-read-commit', logEntry),
  onLiveReadLogged: (callback) => {
    const handler = (event, logEntry) => callback(logEntry);
    ipcRenderer.on('live-read-logged', handler);
    return () => {
      ipcRenderer.removeListener('live-read-logged', handler);
    };
  },
  onLiveReadClosed: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('live-read-closed', handler);
    return () => {
      ipcRenderer.removeListener('live-read-closed', handler);
    };
  },
  closeLiveReadWindow: () => ipcRenderer.invoke('close-live-read-window'),
  onNavigate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('navigate-tab', handler);
    return () => {
      ipcRenderer.removeListener('navigate-tab', handler);
    };
  },
  setActiveTabMenu: (tab, subTab) => ipcRenderer.send('set-active-tab-menu', { tab, subTab }),
});
