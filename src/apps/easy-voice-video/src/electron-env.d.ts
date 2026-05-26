// src/electron-env.d.ts

// Định nghĩa kiểu trả về cho các hàm liên quan đến cập nhật ứng dụng
interface AppUpdateStatus {
  supported: boolean;
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  percent: number;
  error: string;
  message: string;
}

// Định nghĩa kiểu dữ liệu cho các file audio
interface AudioFile {
  name: string;
  path: string;
}

// Định nghĩa kiểu dữ liệu cho tài sản BGM
interface BgmAsset {
  id: string;
  label: string;
  fileName: string;
  filePath: string;
  category: string;
  defaultVolume: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// Định nghĩa kiểu dữ liệu cho tài sản Laugh
interface LaughAsset {
  id: string;
  role: string;
  type: string;
  label: string;
  fileName: string;
  filePath: string;
}


interface ElectronAPI {
  // App related
  getVersion(): Promise<string>;
  getUpdateStatus(): Promise<AppUpdateStatus>;
  checkForUpdates(): Promise<{ ok: boolean; error: string }>;
  downloadUpdate(): Promise<{ ok: boolean; error: string }>;
  quitAndInstallUpdate(): Promise<{ ok: boolean; error: string }>;

  // Dialogs
  selectFolder(): Promise<{ canceled: boolean; path: string } | undefined>;
  selectAudioFile(): Promise<{ canceled: boolean; path: string } | undefined>;
  selectAudioFiles(): Promise<{ canceled: boolean; paths: string[] } | undefined>;
  selectImageFile(): Promise<{ canceled: boolean; path: string } | undefined>;

  // File operations
  readAudioFile(payload: { filePath: string }): Promise<{ ok: boolean; data?: string; arrayBuffer?: ArrayBuffer; mimeType?: string; error?: string }>;
  saveAudioFile(payload: { folderPath: string; fileName: string; arrayBuffer: ArrayBuffer }): Promise<{ ok: boolean; path?: string; error?: string }>;
  listAudioFiles(payload: { folderPath: string }): Promise<{ ok: boolean; files: AudioFile[]; error?: string }>;
  openFolderPath(payload: { path: string }): Promise<{ ok: boolean; path?: string; revealed?: boolean; error?: string }>;
  readBase64(payload: { filePath: string }): Promise<{ ok: boolean; dataUrl?: string; error?: string }>;

  // Media processing
  convertWaveformVideo(payload: { sourceFilePath: string }): Promise<{ ok: boolean; path?: string; error?: string }>;
  // Consider defining a more specific type for composeFinalMedia payload and return
  composeFinalMedia(payload: any): Promise<{ ok: boolean; error?: string; finalAudioPath?: string; finalSrtPath?: string; finalVideoPath?: string }>;

  // BGM Assets
  listBgmAssets(): Promise<{ ok: boolean; assets?: BgmAsset[]; libraryDir?: string; error?: string }>;
  importBgmAssets(payload: { files: string[] }): Promise<{ ok: boolean; assets?: BgmAsset[]; importedCount?: number; libraryDir?: string; error?: string }>;
  deleteBgmAsset(payload: { assetId: string }): Promise<{ ok: boolean; assets?: BgmAsset[]; error?: string }>;

  // Laugh Assets
  listLaughAssets(): Promise<{ ok: boolean; assets?: LaughAsset[]; libraryDir?: string; error?: string }>;
  importLaughAssets(payload: { files: string[]; role?: string; type?: string }): Promise<{ ok: boolean; assets?: LaughAsset[]; importedCount?: number; libraryDir?: string; error?: string }>;
  deleteLaughAsset(payload: { assetId: string }): Promise<{ ok: boolean; assets?: LaughAsset[]; libraryDir?: string; error?: string }>;
  openLaughAssetsFolder(): Promise<{ ok: boolean; path?: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
