const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('studioAPI', {
  generateVoice: (payload) => ipcRenderer.invoke('voice:generate', payload),
  chooseBgm: () => ipcRenderer.invoke('bgm:choose'),
  importBgmAsset: () => ipcRenderer.invoke('bgm:importAsset'),
  openBgmFolder: () => ipcRenderer.invoke('bgm:openLibrary'),
  mixBgmPreview: (payload) => ipcRenderer.invoke('audio:mixBgmPreview', payload),
  chooseExternalAudio: () => ipcRenderer.invoke('audio:chooseExternal'),
  exportMp3WithMix: (payload) => ipcRenderer.invoke('audio:exportMp3WithMix', payload),
  chooseOutputDir: () => ipcRenderer.invoke('output:chooseDir'),
  openFolder: (filePath) => ipcRenderer.invoke('file:openFolder', filePath),
  getCacheInfo: () => ipcRenderer.invoke('cache:info'),
  clearCache: () => ipcRenderer.invoke('cache:clear'),
  exportMp3: (filePath, outputBaseName) => ipcRenderer.invoke('audio:exportMp3', filePath, outputBaseName),
  saveSubtitleSrt: (srtPath, outputBaseName) => ipcRenderer.invoke('subtitle:saveAs', srtPath, outputBaseName),
  saveSubtitleSrtContent: (srtContent, outputBaseName) => ipcRenderer.invoke('subtitle:saveContent', srtContent, outputBaseName),
  readAudioDataUrl: (filePath) => ipcRenderer.invoke('audio:readDataUrl', filePath),
  readAudioFile: (payload) => ipcRenderer.invoke('file:read-audio-file', payload),
  importKeysTxt: () => ipcRenderer.invoke('keys:importTxt'),
  exportKeysTxt: (content) => ipcRenderer.invoke('keys:exportTxt', content),
  exportKeyLogTxt: (content) => ipcRenderer.invoke('keys:exportLogTxt', content),
  importVertexJson: () => ipcRenderer.invoke('vertex:importJson'),
  onProgress: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('voice:progress', handler);
    return () => ipcRenderer.removeListener('voice:progress', handler);
  }
});
