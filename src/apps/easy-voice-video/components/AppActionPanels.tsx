import React from "react";
import { FaKey, FaVideo, FaFilm, FaMicrophone } from "react-icons/fa";

type AppActionPanelsProps = {
  isBusy: boolean;
  adminVisible: boolean;
  showVideoMergeManager: boolean;
  generateButtonIcon: React.ReactNode;
  generateButtonText: string;
  onToggleKeyManager: () => void;
  onToggleVideoMergeManager: () => void;
  onGenerate: () => void;
  keyManagerPanel: React.ReactNode;
  videoMergeManagerPanel: React.ReactNode;
  onOpenWaveform: () => void;
};

export default function AppActionPanels({
  isBusy,
  adminVisible,
  showVideoMergeManager,
  generateButtonIcon,
  generateButtonText,
  onToggleKeyManager,
  onToggleVideoMergeManager,
  onGenerate,
  keyManagerPanel,
  videoMergeManagerPanel,
  onOpenWaveform
}: AppActionPanelsProps) {
  return (
    <div className="space-y-3">
      <div className="voice-action-bar flex flex-wrap gap-3">
        <button
          onClick={onGenerate}
          disabled={isBusy}
          className="voice-action-btn voice-generate flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-white shadow disabled:opacity-60"
        >
          {generateButtonIcon ?? <FaMicrophone />}
          {generateButtonText}
        </button>

        <button
          type="button"
          onClick={onOpenWaveform}
          className="voice-action-btn voice-render flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow"
        >
          <FaFilm />
          Dựng Video
        </button>

        <button
          onClick={onToggleVideoMergeManager}
          type="button"
          className="voice-action-btn voice-merge flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-white shadow"
        >
          <FaVideo />
          {showVideoMergeManager ? "Ẩn ghép video" : "Ghép Video"}
        </button>

        <button
          onClick={onToggleKeyManager}
          type="button"
          className="voice-action-btn voice-key flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-white shadow"
        >
          <FaKey />
          {adminVisible ? "Ẩn Key Manager" : "Key Manager"}
        </button>
      </div>

      {showVideoMergeManager ? videoMergeManagerPanel : null}
      {adminVisible ? keyManagerPanel : null}
    </div>
  );
}
