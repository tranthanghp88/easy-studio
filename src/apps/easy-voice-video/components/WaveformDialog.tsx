import React from "react";
import { FaLayerGroup, FaTimes } from "react-icons/fa";
import type { TimelineBlock, SubtitleCue } from "../shared/types/timeline";

type WaveformDialogProps = {
  show: boolean;
  onClose: () => void;
  waveAudioPath: string;
  waveBackgroundImagePath: string;
  waveStatus: string;
  waveDuration: number;
  waveError: string;
  waveAudioPreviewRef: React.RefObject<HTMLAudioElement | null>;
  waveContainerRef: React.RefObject<HTMLDivElement | null>;
  isExportingFinalMedia: boolean;
  isWaveReady: boolean;
  videoRenderProgress: number;
  onSelectAudio: () => void;
  onSelectBackgroundImage: () => void;
  onOpenFolder: () => void;
  onExportFinalMedia: () => void;
  onOpenVideoLayoutManager?: () => void;
  waveformTimeline: TimelineBlock[];
  subtitleCues: SubtitleCue[];
};

export default function WaveformDialog({
  show,
  onClose,
  waveAudioPath,
  waveBackgroundImagePath,
  waveStatus,
  waveDuration,
  waveError,
  waveAudioPreviewRef,
  waveContainerRef,
  isExportingFinalMedia,
  isWaveReady,
  videoRenderProgress,
  onSelectAudio,
  onSelectBackgroundImage,
  onOpenFolder,
  onExportFinalMedia,
  onOpenVideoLayoutManager,
  waveformTimeline,
  subtitleCues
}: WaveformDialogProps) {
  if (!show) return null;

  const canOpenVideoLayout = !!waveBackgroundImagePath && !isExportingFinalMedia;

  return (
    <div className="waveform-dialog fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-lg font-semibold text-slate-900">Dựng Video</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <FaTimes />
          </button>
        </div>

        <div className="waveform-dialog-body space-y-4 overflow-auto p-5">
          <div className="waveform-toolbar flex flex-col gap-2 md:flex-row md:flex-wrap">
            <button
              type="button"
              onClick={onSelectAudio}
              disabled={isExportingFinalMedia}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800 disabled:opacity-60"
            >
              Chọn audio
            </button>

            <button
              type="button"
              onClick={onSelectBackgroundImage}
              disabled={isExportingFinalMedia}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-indigo-700 disabled:opacity-60"
            >
              Chọn ảnh nền
            </button>

            <button
              type="button"
              onClick={onOpenFolder}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
            >
              Mở thư mục
            </button>

            {onOpenVideoLayoutManager ? (
              <button
                type="button"
                onClick={onOpenVideoLayoutManager}
                disabled={!canOpenVideoLayout}
                className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                title={canOpenVideoLayout ? "Mở tùy chỉnh layout video" : "Hãy chọn ảnh background trước"}
              >
                <FaLayerGroup />
                Video Layout
              </button>
            ) : null}

            <button
              type="button"
              onClick={onExportFinalMedia}
              disabled={!waveAudioPath || !waveBackgroundImagePath || !isWaveReady || isExportingFinalMedia}
              className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-purple-700 disabled:opacity-60"
            >
              {isExportingFinalMedia ? "Đang xuất media cuối..." : "Xuất audio + SRT + video"}
            </button>
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700 break-all">
            {waveAudioPath || "Chưa chọn file audio"}
          </div>

          <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700 break-all">
            {waveBackgroundImagePath || "Chưa chọn ảnh nền"}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <div className="text-xs uppercase tracking-wide text-slate-500">Trạng thái</div>
              <div className="mt-1 font-medium text-slate-800">{waveStatus || "Sẵn sàng"}</div>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <div className="text-xs uppercase tracking-wide text-slate-500">Thời lượng</div>
              <div className="mt-1 font-medium text-slate-800">
                {waveDuration > 0 ? `${waveDuration.toFixed(1)} giây` : "--"}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
              <div className="text-xs uppercase tracking-wide text-slate-500">Output</div>
              <div className="mt-1 font-medium text-slate-800">*_final.wav / *_final.srt / *_final.mp4</div>
            </div>
          </div>

          {isExportingFinalMedia || videoRenderProgress > 0 ? (() => {
            const safeVideoProgress = Math.max(0, Math.min(100, Number(videoRenderProgress || 0)));
            return (
              <div className="rounded-2xl border bg-white p-4 shadow-sm video-export-progress-card">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm font-medium text-slate-700">Tiến trình dựng video</div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
                    {Math.round(safeVideoProgress)}%
                  </div>
                </div>
                <div className="relative h-5 overflow-hidden rounded-full bg-slate-200 shadow-inner">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 shadow-lg"
                    style={{
                      width: `${safeVideoProgress}%`,
                      background: "linear-gradient(90deg, #d946ef 0%, #0ea5e9 50%, #34d399 100%)"
                    }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{
                      width: `${safeVideoProgress}%`,
                      opacity: 0.38,
                      background: "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)",
                      backgroundSize: "200% 100%",
                      animation: "shine 1.8s linear infinite"
                    }}
                  />
                </div>
              </div>
            );
          })() : null}

          {waveError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {waveError}
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4">
            <div ref={waveContainerRef} className="min-h-[160px] w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
