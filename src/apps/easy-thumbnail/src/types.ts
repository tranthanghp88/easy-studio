export type ThumbnailConcept = {
  title: string;
  thumbnailText: string;
  emotion: string;
  composition: string;
  imagePrompt: string;
  leonardoPrompt: string;
  geminiImagePrompt: string;
  whyItWorks: string;
};

export type ConceptResponse = {
  scoreReason: string;
  bestHook: string;
  concepts: ThumbnailConcept[];
};

export type Settings = {
  geminiApiKey: string;
  conceptModel: string;
  imageModel: string;
  updateFeedUrl: string;
  defaultChannelName: string;
};

declare global {
  interface Window {
    thumbnailAPI: {
      getSettings: () => Promise<Settings>;
      saveSettings: (settings: Partial<Settings>) => Promise<Settings>;
      generateConcepts: (payload: Record<string, string>) => Promise<ConceptResponse>;
      generateImage: (payload: { prompt: string }) => Promise<{ base64: string; mimeType: string }>;
      saveImage: (payload: { base64: string; fileName: string }) => Promise<{ canceled: boolean; filePath?: string }>;
      openExternal: (url: string) => Promise<boolean>;
      checkForUpdates: () => Promise<{ ok: boolean; reason?: string; error?: string }>;
      installUpdate: () => Promise<{ ok: boolean }>;
      onUpdateStatus: (callback: (data: { type: string; message: string; percent?: number }) => void) => () => void;
    };
  }
}
