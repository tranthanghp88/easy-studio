import { useState, type Dispatch, type SetStateAction } from "react";

type UseAudioHistoryArgs = {
  setAudioUrl: Dispatch<SetStateAction<string | null>>;
};

/**
 * Deprecated/no-op hook.
 * Audio History UI and its native folder scanning flow were removed from the app.
 * This stub is intentionally kept so stale imports in older local worktrees do not break `tsc --noEmit`.
 */
export function useAudioHistory(_args: UseAudioHistoryArgs) {
  const [showHistoryAudio, setShowHistoryAudio] = useState(false);

  return {
    generatedAudioFiles: [],
    generatedAudioMessage: "",
    selectedHistoryFile: "",
    showHistoryAudio,
    setShowHistoryAudio,
    scanGeneratedAudioFiles: async () => undefined,
    playGeneratedAudioFile: async () => undefined
  };
}
