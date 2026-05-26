const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyScriptAPI', {
  generateStep: (payload) => ipcRenderer.invoke('script:generate-step', payload),
  exportText: (payload) => ipcRenderer.invoke('script:export-text', payload),
  saveProject: (payload) => ipcRenderer.invoke('script:save-project', payload),
  loadProject: () => ipcRenderer.invoke('script:load-project'),
  importText: () => ipcRenderer.invoke('script:import-text'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  testProvider: (payload) => ipcRenderer.invoke('settings:test-provider', payload),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates')
});
