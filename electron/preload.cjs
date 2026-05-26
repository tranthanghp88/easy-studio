const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('easyStudio', {
  selectFolder: () => ipcRenderer.invoke('easy-studio:select-folder'),
  openPath: (targetPath) => ipcRenderer.invoke('easy-studio:open-path', targetPath),
  setActiveApp: (payload) => ipcRenderer.invoke('easy-studio:set-active-app', payload),
  debugPing: () => ipcRenderer.invoke('debug:ping'),
  getIpcStatus: () => ipcRenderer.invoke('debug:ipc-status'),
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('app:quit-and-install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  }
});

// Easy Script API
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

// Easy Thumbnail API used by current src/apps/easy-thumbnail/src/App.tsx
contextBridge.exposeInMainWorld('thumbnailAPI', {
  getSettings: () => ipcRenderer.invoke('thumbnail:settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('thumbnail:settings:save', settings),
  generateConcepts: (payload) => ipcRenderer.invoke('thumbnail:concepts:generate', payload),
  generateImage: (payload) => ipcRenderer.invoke('thumbnail:image:generate', payload),
  saveImage: (payload) => ipcRenderer.invoke('thumbnail:image:save', payload),
  openExternal: (url) => ipcRenderer.invoke('thumbnail:open-external', url),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  }
});

// Legacy Easy Thumbnail API kept for old thumbnail screens.
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

// Easy Voice / Video API
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  platform: process.platform,

  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  selectAudioFile: () => ipcRenderer.invoke('dialog:select-audio-file'),
  selectAudioFiles: () => ipcRenderer.invoke('dialog:select-audio-files'),
  selectVideoFiles: () => ipcRenderer.invoke('dialog:select-video-files'),
  selectImageFile: () => ipcRenderer.invoke('dialog:select-image-file'),

  readAudioFile: (payload) => ipcRenderer.invoke('file:read-audio-file', payload),
  saveAudioFile: (payload) => ipcRenderer.invoke('file:save-audio', payload),
  openFolderPath: (payload) => ipcRenderer.invoke('file:open-folder-path', payload),
  listBgmAssets: () => ipcRenderer.invoke('file:list-bgm-assets'),
  importBgmAssets: (payload) => ipcRenderer.invoke('file:import-bgm-assets', payload),
  deleteBgmAsset: (payload) => ipcRenderer.invoke('file:delete-bgm-asset', payload),

  listLaughAssets: () => ipcRenderer.invoke('file:list-laugh-assets'),
  importLaughAssets: (payload) => ipcRenderer.invoke('file:import-laugh-assets', payload),
  deleteLaughAsset: (payload) => ipcRenderer.invoke('file:delete-laugh-asset', payload),
  openLaughAssetsFolder: () => ipcRenderer.invoke('file:open-laugh-assets-folder'),
  readFileAsBase64: (payload) => ipcRenderer.invoke('file:read-base64', payload),

  convertWaveformVideo: (payload) => ipcRenderer.invoke('file:convert-waveform-video', payload),
  composeFinalMedia: (payload) => ipcRenderer.invoke('file:compose-final-media', payload),
  mergeVideoFiles: (payload) => ipcRenderer.invoke('file:merge-video-files', payload),

  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('app:get-update-status'),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('app:quit-and-install-update'),
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  }
});


// Easy Voice Việt API
contextBridge.exposeInMainWorld('studioAPI', {
  generateVoice: (payload) => ipcRenderer.invoke('voice-viet:generate', payload),
  chooseBgm: () => ipcRenderer.invoke('voice-viet:bgm:choose'),
  importBgmAsset: () => ipcRenderer.invoke('voice-viet:bgm:importAsset'),
  openBgmFolder: () => ipcRenderer.invoke('voice-viet:bgm:openLibrary'),
  mixBgmPreview: (payload) => ipcRenderer.invoke('voice-viet:audio:mixBgmPreview', payload),
  chooseExternalAudio: () => ipcRenderer.invoke('voice-viet:audio:chooseExternal'),
  exportMp3WithMix: (payload) => ipcRenderer.invoke('voice-viet:audio:exportMp3WithMix', payload),
  chooseOutputDir: () => ipcRenderer.invoke('voice-viet:output:chooseDir'),
  openFolder: (filePath) => ipcRenderer.invoke('voice-viet:file:openFolder', filePath),
  getCacheInfo: () => ipcRenderer.invoke('voice-viet:cache:info'),
  clearCache: () => ipcRenderer.invoke('voice-viet:cache:clear'),
  exportMp3: (filePath, outputBaseName) => ipcRenderer.invoke('voice-viet:audio:exportMp3', filePath, outputBaseName),
  saveSubtitleSrt: (srtPath, outputBaseName) => ipcRenderer.invoke('voice-viet:subtitle:saveAs', srtPath, outputBaseName),
  saveSubtitleSrtContent: (srtContent, outputBaseName) => ipcRenderer.invoke('voice-viet:subtitle:saveContent', srtContent, outputBaseName),
  readAudioDataUrl: (filePath) => ipcRenderer.invoke('voice-viet:audio:readDataUrl', filePath),
  readAudioFile: (payload) => ipcRenderer.invoke('voice-viet:file:read-audio-file', payload),
  importKeysTxt: () => ipcRenderer.invoke('voice-viet:keys:importTxt'),
  exportKeysTxt: (content) => ipcRenderer.invoke('voice-viet:keys:exportTxt', content),
  exportKeyLogTxt: (content) => ipcRenderer.invoke('voice-viet:keys:exportLogTxt', content),
  importVertexJson: () => ipcRenderer.invoke('voice-viet:vertex:importJson'),
  onProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('voice-viet:progress', handler);
    return () => ipcRenderer.removeListener('voice-viet:progress', handler);
  }
});
