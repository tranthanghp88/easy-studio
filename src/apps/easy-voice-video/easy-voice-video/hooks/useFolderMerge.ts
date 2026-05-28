import { useState, type Dispatch, type SetStateAction } from "react";

type UseFolderMergeArgs = {
  filePrefix: string;
  directoryHandle: any | null;
  directoryName: string;
  setDirectoryHandle: Dispatch<SetStateAction<any | null>>;
  setDirectoryName: Dispatch<SetStateAction<string>>;
  setAudioUrl: Dispatch<SetStateAction<string | null>>;
  setSequence: Dispatch<SetStateAction<number>>;
  showHistoryAudio: boolean;
  scanGeneratedAudioFiles: () => Promise<void>;
};

type StageSetter = Dispatch<SetStateAction<"idle" | "processing" | "saving" | "done" | "error">>;
type ProgressSetter = Dispatch<SetStateAction<number>>;
type ChunkSetter = Dispatch<SetStateAction<{ done: number; total: number; eta: string; elapsed: string }>>;

/**
 * Deprecated/no-op hook.
 * Old WAV Folder Merge was removed. The app now uses Video Merge Manager for final video merging.
 * This stub is kept only for TypeScript compatibility with stale imports in older local worktrees.
 */
export function useFolderMerge(_args: UseFolderMergeArgs) {
  const [showMergePanel, setShowMergePanel] = useState(false);

  return {
    mergePreview: {
      files: [],
      validFiles: [],
      warnings: [],
      missingSequences: []
    },
    scanningMerge: false,
    mergeScanMessage: "",
    showMergePanel,
    setShowMergePanel,
    chooseFolder: async () => undefined,
    handleOpenMergePanel: async () => {
      setShowMergePanel(false);
    },
    handleMergeFiles: async (
      setStage?: StageSetter,
      setProgress?: ProgressSetter,
      setChunkInfo?: ChunkSetter
    ) => {
      setStage?.("idle");
      setProgress?.(0);
      setChunkInfo?.({ done: 0, total: 0, eta: "", elapsed: "" });
    },
    refreshMergePreview: async () => undefined
  };
}
