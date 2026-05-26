export {};

declare global {
  interface Window {
    easyScriptAPI?: {
      generateStep: (payload: GenerateStepPayload) => Promise<GenerateStepResult>;
      exportText: (payload: { text: string; filename?: string }) => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
      saveProject: (payload: unknown) => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
      loadProject: () => Promise<{ ok: boolean; data?: unknown; path?: string; canceled?: boolean; error?: string }>;
      importText: () => Promise<{ ok: boolean; text?: string; path?: string; canceled?: boolean; error?: string }>;
      loadSettings: () => Promise<{ ok: boolean; settings?: ApiSettings; error?: string }>;
      saveSettings: (settings: ApiSettings) => Promise<{ ok: boolean; error?: string }>;
      testProvider: (settings: ApiSettings) => Promise<{ ok: boolean; error?: string }>;
      checkForUpdates?: () => Promise<{ ok: boolean; updateAvailable?: boolean; version?: string; url?: string; message?: string; error?: string }>;
    };
  }

  type PipelineStepId = 'structure' | 'expand' | 'natural' | 'standardize' | 'conversation' | 'translateVi';
  type AiProvider = 'gemini' | 'openai';

  type ApiSettings = {
    provider: AiProvider;
    geminiApiKey?: string;
    geminiModel?: string;
    openaiApiKey?: string;
    openaiModel?: string;
    qualityMode?: 'fast' | 'balanced' | 'highQuality';
    updateManifestUrl?: string;
    customPrompts?: Partial<Record<PipelineStepId, string>>;
    promptChainVersion?: string;
  };

  type BlockPreset = {
    tag: '#HOOK' | '#CTA_INTRO' | '#INTRO' | '#BODY' | '#CTA_MID' | '#CTA_END';
    name: string;
    pauseSeconds: number;
    aSpeed: number;
    aPitch: number;
    aPause: number;
    rSpeed: number;
    rPitch: number;
    rPause: number;
  };

  type GenerateStepPayload = {
    step: PipelineStepId;
    inputText: string;
    settings?: {
      targetLength?: string;
      level?: string;
      topic?: string;
      apiSettings?: ApiSettings;
      blockPresets?: BlockPreset[];
      scriptLengthMode?: 'short' | 'long';
      inputMode?: 'competitor' | 'idea';
      scriptFormat?: string;
      customPrompts?: Partial<Record<PipelineStepId, string>>;
    promptChainVersion?: string;
    };
  };

  type GenerateStepResult = {
    ok: boolean;
    text?: string;
    error?: string;
  };
}
