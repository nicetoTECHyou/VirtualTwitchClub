const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),

  // Services
  getStatus: () => ipcRenderer.invoke('get-status'),
  startAll: () => ipcRenderer.send('start-all'),
  stopAll: () => ipcRenderer.send('stop-all'),
  startService: (key) => ipcRenderer.send('start-service', key),
  stopService: (key) => ipcRenderer.send('stop-service', key),
  restartService: (key) => ipcRenderer.send('restart-service', key),

  // Status updates (pushed from main process)
  onStatusUpdate: (callback) => ipcRenderer.on('services-status', (event, status) => callback(status)),
  onServiceReady: (callback) => ipcRenderer.on('service-ready', (event, key) => callback(key)),

  // Setup wizard
  onShowSetup: (callback) => ipcRenderer.on('show-setup-wizard', () => callback()),

  // Utilities
  openExternal: (url) => ipcRenderer.send('open-external', url),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),

  // App info & debug
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getDebugInfo: () => ipcRenderer.invoke('get-debug-info'),
  checkNode: () => ipcRenderer.invoke('check-node'),
  downloadNode: () => ipcRenderer.invoke('download-node'),
  runInstaller: (path) => ipcRenderer.send('run-installer', path),
  onInstallerComplete: (callback) => ipcRenderer.on('installer-complete', (event, result) => callback(result)),

  // OBS
  getOBSUrls: () => ipcRenderer.invoke('get-obs-urls'),

  // Setup
  showSetup: () => ipcRenderer.send('show-setup'),
});
