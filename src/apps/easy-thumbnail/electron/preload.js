
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyAPI', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  saveText: (payload) => ipcRenderer.invoke('save-text', payload),
  saveImage: (payload) => ipcRenderer.invoke('save-image', payload),
  importFont: () => ipcRenderer.invoke('font:import'),
  analyzeMedia: (payload) => ipcRenderer.invoke('media:analyze', payload),
  suggestTextStyle: (payload) => ipcRenderer.invoke('style:suggest', payload),
  checkUpdate: () => ipcRenderer.invoke('check-update')
});
