import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaFolderOpen } from "react-icons/fa";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions";
import KeyManagerPanel from "./components/KeyManagerPanel";
import VideoMergeManagerPanel from "./components/VideoMergeManagerPanel";
import PresetPanel from "./components/PresetPanel";
import AppActionPanels from "./components/AppActionPanels";
import AudioProgressPanel from "./components/AudioProgressPanel";
import ScriptEditorPanel from "./components/ScriptEditorPanel";
import AudioPlayerPanel from "./components/AudioPlayerPanel";
import BgmManagerDialog from "./components/BgmManagerDialog";
import WaveformDialog from "./components/WaveformDialog";
import VideoLayoutManagerDialog from "./components/VideoLayoutManagerDialog";
import LaughManagerDialog from "./components/LaughManagerDialog";
import { getSavedLaughAssetMode, saveLaughAssetMode } from "./services/laughAssetStorage";
import type { LaughAssetMode } from "./shared/types/timeline";
import { getSavedVideoLayoutSettings, resetVideoLayoutSettings, saveVideoLayoutSettings, type VideoLayoutSettings } from "./services/videoLayoutStorage";
import {
  FaCheck,
  FaPlay,
  FaSpinner
} from "react-icons/fa";
import { useKeyManager } from "./hooks/useKeyManager";
import { useTtsJob } from "./hooks/useTtsJob";
import type { ScriptLine } from "./shared/types/script";
import { useKeyManagerActions } from "./hooks/useKeyManagerActions";
import { useVoiceManager } from "./hooks/useVoiceManager";
import { useSpeakerPresetManager } from "./hooks/useSpeakerPresetManager";
import { usePresetPanelBridge } from "./hooks/usePresetPanelBridge";
import { useBgmAssets } from "./hooks/useBgmAssets";
import { useLaughAssets } from "./hooks/useLaughAssets";
import { getVoiceModeFromType } from "./services/voiceUtils";
import { getTextPlaceholder } from "./services/speakerPresets";
import { buildBgmTag } from "./services/bgmStorage";
import type { BgmAsset, TimelineBlock } from "./shared/types/timeline";
import { extractScriptControlMarkers, isControlMarkerLine } from "./services/scriptMarkers";
import { buildCompositionPlan } from "./services/mediaComposition";
import { createTimelineForExistingAudio, TimelineService } from "./services/timelineService";
import { generateSubtitleCues, processTimeline } from "./services/timelineProcessorService";
import type { SubtitleCue } from "./shared/types/timeline";

const MAX_CHARS = 12000;
const PREVIEW_COOLDOWN_MS = 3000;
const LAST_FILE_PREFIX_KEY = "english-voice-generator-last-file-prefix";
const LAST_FILE_PREFIX_LEGACY_KEYS = ["easy-english-voice-generator-last-file-prefix"];
const LAST_DIRECTORY_NAME_KEY = "english-voice-generator-last-directory-name";
const LAST_DIRECTORY_NAME_LEGACY_KEYS = ["easy-english-voice-generator-last-directory-name"];

type DialogueTimelineItem = {
  blockId?: number;
  role?: "A" | "R" | "BOTH";
  text?: string;
  start: number;
  end: number;
  pauseAfterSeconds?: number;
};

function loadLocalText(key: string, fallback: string, legacyKeys: string[] = []) {
  if (typeof window === "undefined") return fallback;
  try {
    const candidates = [key, ...legacyKeys];
    for (const candidate of candidates) {
      const value = String(window.localStorage.getItem(candidate) || "").trim();
      if (value) {
        if (candidate !== key) {
          try { window.localStorage.setItem(key, value); } catch {}
        }
        return value;
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function parseScript(raw: string): ScriptLine[] {
  const blocks = raw
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const lines: ScriptLine[] = [];

  blocks.forEach((block, blockIndex) => {
    const blockLines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const control = extractScriptControlMarkers(blockLines.filter((line) => line.startsWith("#")));
    // Extract semantic blockId from non-control marker lines
    const semanticBlockId = blockLines.find(line =>
      line.startsWith("#") && !isControlMarkerLine(line)
    )?.substring(1).trim() || String(blockIndex + 1); // Use blockIndex + 1 as fallback
    let controlAttached = false;

    blockLines.forEach((line) => {
      if (line.startsWith("#")) {
        // Allow non-control markers to pass through, but handle control markers
        if (isControlMarkerLine(line)) {
          return;
        }
        // For actual block markers like #HOOK, #CTA, we've already extracted them
        return;
      }

      const pushLine = (role: "A" | "R" | "BOTH", textValue: string) => {
        const cleanText = String(textValue || "").trim();
        const nextLine: ScriptLine = {
          role,
          text: cleanText,
          blockId: semanticBlockId, // Assign semantic blockId
        };
        if (!controlAttached) {
          if (typeof control.pauseSeconds === "number") nextLine.pauseSeconds = control.pauseSeconds;
          if (control.bgm) nextLine.bgm = control.bgm;
          if (control.markerLines.length) nextLine.markerLines = control.markerLines;
          controlAttached = true;
        }

        lines.push(nextLine);
      };

      const bothPrefix = line.match(/^(A\+R|BOTH):\s*/i);
      if (bothPrefix) {
        pushLine("BOTH", line.slice(bothPrefix[0].length));
        return;
      }

      if (line.startsWith("A:")) {
        pushLine("A", line.slice(2));
        return;
      }

      if (line.startsWith("R:")) {
        pushLine("R", line.slice(2));
      }
    });
  });

  return lines.filter((item) => !!item.text);
}

function buildSingleVoiceScript(raw: string): ScriptLine[] {
  const blocks = raw
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  const lines: ScriptLine[] = [];

  blocks.forEach((block, blockIndex) => {
    const blockLines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const control = extractScriptControlMarkers(blockLines.filter((line) => line.startsWith("#")));
    const textParts: string[] = [];

    blockLines.forEach((line) => {
      if (line.startsWith("#")) return;

      if (/^(A\+R|BOTH):/i.test(line)) {
        const normalized = line.replace(/^(A\+R|BOTH):\s*/i, "").trim();
        if (normalized) textParts.push(normalized);
        return;
      }

      if (line.startsWith("A:") || line.startsWith("R:")) {
        const normalized = line.slice(2).trim();
        if (normalized) textParts.push(normalized);
        return;
      }

      textParts.push(line);
    });

    const mergedText = textParts.filter(Boolean).join(" ").trim();

    if (mergedText) {
      lines.push({
        role: "A",
        text: mergedText,
        blockId: blockIndex + 1,
        pauseSeconds: control.pauseSeconds,
        bgm: control.bgm,
        markerLines: control.markerLines
      });
    }
  });

  return lines;
}

export default function App() {
  const [text, setText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { laughAssets } = useLaughAssets();

  const [filePrefix, setFilePrefix] = useState(() =>
    loadLocalText(LAST_FILE_PREFIX_KEY, "Ep01", LAST_FILE_PREFIX_LEGACY_KEYS)
  );
  const [filePrefixDraft, setFilePrefixDraft] = useState(() =>
    loadLocalText(LAST_FILE_PREFIX_KEY, "Ep01", LAST_FILE_PREFIX_LEGACY_KEYS)
  );
  const [isFilePrefixSaved, setIsFilePrefixSaved] = useState(
    () => loadLocalText(LAST_FILE_PREFIX_KEY, "", LAST_FILE_PREFIX_LEGACY_KEYS) !== ""
  );
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameDraft, setRenameDraft] = useState("Ep01");

  const [sequence, setSequence] = useState(1);

  const [directoryHandle, setDirectoryHandle] = useState<any | null>(null);
  const [directoryName, setDirectoryName] = useState(() =>
    loadLocalText(LAST_DIRECTORY_NAME_KEY, "", LAST_DIRECTORY_NAME_LEGACY_KEYS)
  );

  const [adminVisible, setAdminVisible] = useState(false);
  const [showVoicePanel, setShowVoicePanel] = useState(true);
  const [showStoragePanel, setShowStoragePanel] = useState(false);
  const [showBgmManager, setShowBgmManager] = useState(false);
  const [showVideoLayoutManager, setShowVideoLayoutManager] = useState(false);
  const [showLaughManager, setShowLaughManager] = useState(false);
  const [showVideoMergeManager, setShowVideoMergeManager] = useState(false);
  const [engineMode, setEngineMode] = useState<"auto" | "tts" | "gemini">(() => {
    try {
      const v = String(window.localStorage.getItem("voice-engine-mode") || "auto").trim().toLowerCase();
      return v === "tts" || v === "gemini" ? v : "auto";
    } catch {
      return "auto";
    }
  });
  const [laughAssetMode, setLaughAssetMode] = useState<LaughAssetMode>(() => getSavedLaughAssetMode());
  const [scriptSelection, setScriptSelection] = useState({ start: 0, end: 0 });
  const [bgmInsertVolume, setBgmInsertVolume] = useState("0.25");
  const [bgmInsertDuration, setBgmInsertDuration] = useState("");
  const [bgmInsertMode, setBgmInsertMode] = useState<"once" | "loop">("once");

  useEffect(() => { try { window.localStorage.setItem("voice-engine-mode", engineMode); } catch {} }, [engineMode]);
  useEffect(() => { saveLaughAssetMode(laughAssetMode); }, [laughAssetMode]);
  const [isWavePanelOpen, setIsWavePanelOpen] = useState(false);
  const [waveAudioPath, setWaveAudioPath] = useState("");
  const [waveBackgroundImagePath, setWaveBackgroundImagePath] = useState("");
  const [waveAudioBlobUrl, setWaveAudioBlobUrl] = useState<string | null>(null);
  const [waveError, setWaveError] = useState("");
  const [waveStatus, setWaveStatus] = useState("");
  const [latestFinalVideoPath, setLatestFinalVideoPath] = useState("");
  const [isWaveReady, setIsWaveReady] = useState(false);
  const [isExportingFinalMedia, setIsExportingFinalMedia] = useState(false);
  const [videoRenderProgress, setVideoRenderProgress] = useState(0);
  const [waveDuration, setWaveDuration] = useState(0);
  const [videoLayoutSettings, setVideoLayoutSettings] = useState<VideoLayoutSettings>(() => getSavedVideoLayoutSettings());
  const [waveformTimeline, setWaveformTimeline] = useState<TimelineBlock[]>([]);
  const [subtitleCuesForWaveform, setSubtitleCuesForWaveform] = useState<SubtitleCue[]>([]);

  useEffect(() => { saveVideoLayoutSettings(videoLayoutSettings); }, [videoLayoutSettings]);

  const {
    managerTab,
    setManagerTab,
    keySummary,
    selectedKeys,
    setSelectedKeys,
    loadingStats,
    testingKeys,
    currentKey,
    setCurrentKey,
    recentLogs,
    removingBadKeys,
    clearingKeys,
    normalizingKeys,
    clearingLogs,
    keySearch,
    setKeySearch,
    cacheStats,
    clearingCache,
    statusFilter,
    setStatusFilter,
    setKeyPage,
    keyPageSize,
    setKeyPageSize,
    filteredKeys,
    totalKeyPages,
    currentKeyPage,
    pagedKeys,
    selectedKeyIdsOnPage,
    fetchDashboardData,
    handleImportKeys: importKeysFromHook,
    handleTestAllKeys: testAllKeysFromHook,
    handleRemoveBadKeys: removeBadKeysFromHook,
    handleDeleteSelectedKeys: deleteSelectedKeysFromHook,
    handleClearAllKeys: clearAllKeysFromHook,
    handleNormalizeKeys: normalizeKeysFromHook,
    handleDisableKey: disableKeyFromHook,
    handleEnableKey: enableKeyFromHook,
    handleClearLogs: clearLogsFromHook,
    handleDownloadLogs,
    handleClearCache,
    handleOpenCacheFolder
  } = useKeyManager();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveContainerRef = useRef<HTMLDivElement | null>(null);



  const waveAudioPreviewRef = useRef<HTMLAudioElement | null>(null);
  const waveSurferRef = useRef<any>(null);
  const script = useMemo(() => parseScript(text), [text]);

  const {
    bgmAssets,
    filteredBgmAssets,
    loadingBgmAssets,
    bgmMessage,
    setBgmMessage,
    bgmSearch,
    setBgmSearch,
    previewAssetId,
    previewAudioUrl,
    importBgmAssets,
    deleteBgmAsset,
    previewBgmAsset,
    revokePreviewUrl
  } = useBgmAssets();

  const refreshOutputState = async () => {};
  const scanGeneratedAudioFiles = async () => {};

  const chooseFolder = async () => {
    try {
      if (window.electronAPI?.selectFolder) {
        const result = await window.electronAPI.selectFolder();
        const folderPath = typeof result === "string" ? result : result?.path;
        if (!folderPath) return;
        setDirectoryHandle(null);
        setDirectoryName(folderPath);
        try { window.localStorage.setItem(LAST_DIRECTORY_NAME_KEY, folderPath); } catch {}
        alert("Đã chọn thư mục thành công.");
        return;
      }

      const picker = (window as any).showDirectoryPicker;
      if (!picker) {
        alert("Trình duyệt này chưa hỗ trợ chọn thư mục trực tiếp.");
        return;
      }

      const handle = await picker({
        id: "tts-output-folder",
        mode: "readwrite",
        startIn: "downloads"
      });
      setDirectoryHandle(handle);
      setDirectoryName(handle.name || "");
      alert("Đã chọn thư mục thành công.");
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error(error);
        alert("Không chọn được thư mục.");
      }
    }
  };

  const {
    stage,
    setStage,
    progress,
    chunkInfo,
    setProgress,
    setChunkInfo,
    jobStatus,
    latestDialogueTimeline,
    stageText,
    isBusy,
    stopGeneration,
    handleGenerate
  } = useTtsJob({
    filePrefix,
    sequence,
    audioUrl,
    setAudioUrl,
    directoryHandle,
    directoryName,
    showHistoryAudio: false,
    fetchDashboardData,
    setCurrentKey,
    setSequence,
    refreshMergePreview: refreshOutputState,
    scanGeneratedAudioFiles,
    allLaughAssets: laughAssets
  });

  const {
    showPresetPanel,
    setShowPresetPanel,
    format,
    setFormat,
    language,
    setLanguage,
    voiceProfile,
    setVoiceProfile,
    uiProfileDirty,
    speakerSettings,
    setSpeakerSettings,
    voiceType,
    setVoiceType,
    voiceName,
    setVoiceName,
    useVoiceDefaultPreset,
    setUseVoiceDefaultPreset,
    savedPresets,
    selectedPreset,
    selectedPresetId,
    presetMessage,
    setPresetMessage,
    handleSavePreset,
    handleImportPresets,
    handleLoadPreset,
    handleDeletePreset,
    handleDeleteSelectedPresets,
    handleApplyUiProfile,
    getPresetModified,
    defaultSpeakerSettings
  } = useSpeakerPresetManager();

  const {
    voiceCatalog,
    voiceType: vmVoiceType,
    setVoiceType: setVmVoiceType,
    voiceName: vmVoiceName,
    setVoiceName: setVmVoiceName,
    customVoiceItems,
    filteredCustomVoiceItems,
    selectedCustomVoiceIds,
    selectedCustomVoiceSet,
    selectedVoiceId,
    setSelectedVoiceId,
    selectedFormat,
    setSelectedFormat,
    selectedLanguage,
    setSelectedLanguage,
    selectedVoiceType,
    setSelectedVoiceType,
    voiceConfigDraft,
    setVoiceConfigDraft,
    isVoiceConfigDirty,
    handleSaveVoiceConfig,
    formatItems,
    activeManagedVoice,
    showAddVoiceDialog,
    addVoiceError,
    addVoiceForm,
    setAddVoiceForm,
    isPreviewingVoice,
    activeVoiceInfo,
    handleOpenAddVoiceDialog,
    handleCloseAddVoiceDialog,
    handleCreateVoice,
    handleImportVoices,
    handlePreviewVoice,
    handleToggleCustomVoiceSelected,
    handleSelectAllCustomVoices,
    handleClearSelectedCustomVoices,
    handleDeleteSelectedCustomVoices,
    handleAddFormatItem,
    handleUpdateFormatItemLabel,
    handleToggleFormatItemChecked,
    handleDeleteCheckedFormatItems,
    handleSaveFormatItems
  } = useVoiceManager({
    language,
    isBusy,
    speakerSettings,
    parseScript,
    handleGenerate: async (previewText, previewScript, previewSpeakerSettings, options) => {
      return await (handleGenerate as any)(
        previewText,
        previewScript,
        previewSpeakerSettings,
        options
      );
    },
    previewCooldownMs: PREVIEW_COOLDOWN_MS,
    setPresetMessage,
    currentPresets: savedPresets,
    onImportPresets: handleImportPresets,
    onDeleteImportedVoicePresets: (voiceIds: string[]) => {
      const presetIdsToDelete = savedPresets
        .filter(
          (item) =>
            item.importedFromVoice &&
            voiceIds.includes(String(item.voiceName || "").trim())
        )
        .map((item) => item.id);

      if (presetIdsToDelete.length) {
        handleDeleteSelectedPresets(presetIdsToDelete);
      }
    }
  });

  const effectiveFormatItems =
    (Array.isArray(formatItems) && formatItems.length
      ? formatItems
      : [
          { id: "podcast", label: "Format Podcast", checked: false },
          { id: "single", label: "Format Single", checked: false }
        ]).filter((item) => item.id === "podcast" || item.id === "single")
      .map((item) => ({
        ...item,
        label: item.id === "podcast" ? "Format Podcast" : "Format Single"
      }));

  const {
    panelVoiceType,
    panelVoiceName,
    panelPresetModified,
    handlePanelVoiceTypeChange,
    handlePanelVoiceNameChange,
    handlePanelSavePreset
  } = usePresetPanelBridge({
    voiceType,
    setVoiceType,
    voiceName,
    setVoiceName,
    vmVoiceType,
    setVmVoiceType,
    vmVoiceName,
    setVmVoiceName,
    getPresetModified,
    handleSavePreset,
    currentScriptBlocks: script // NEW PARAMETER: pass the active script blocks
  });

  const {
    handleImportKeys,
    handleTestAllKeys,
    handleRemoveBadKeys,
    handleDeleteSelectedKeys,
    handleClearAllKeys,
    handleNormalizeKeys,
    handleClearLogs
  } = useKeyManagerActions({
    selectedKeys,
    importKeysFromHook,
    testAllKeysFromHook,
    removeBadKeysFromHook,
    deleteSelectedKeysFromHook,
    clearAllKeysFromHook,
    normalizeKeysFromHook,
    clearLogsFromHook,
    fileInputRef
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAdminVisible((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    try {
      const normalized = String(filePrefix || filePrefixDraft || "Ep01").trim() || "Ep01";
      window.localStorage.setItem(LAST_FILE_PREFIX_KEY, normalized);
    } catch {}
  }, [filePrefix, filePrefixDraft]);

  useEffect(() => {
    try {
      const normalized = String(directoryName || "").trim();
      if (normalized) {
        window.localStorage.setItem(LAST_DIRECTORY_NAME_KEY, normalized);
      } else {
        window.localStorage.removeItem(LAST_DIRECTORY_NAME_KEY);
      }
    } catch {}
  }, [directoryName]);



    // Ref để giữ instance của RegionsPlugin
    const regionsPluginRef = useRef<any>(null);

    useEffect(() => {
      if (!isWavePanelOpen) return;
      if (!waveContainerRef.current) {
        return;
      }

      // Khởi tạo WaveSurfer nếu chưa có
      if (!waveSurferRef.current) {
        const ws = WaveSurfer.create({
          container: waveContainerRef.current,
          height: 180,
          waveColor: "#22c55e",
          progressColor: "#86efac",
          cursorColor: "#bbf7d0",
          barWidth: 4,
          barGap: 1.5,
          barRadius: 3,
          normalize: true,
          url: waveAudioBlobUrl ?? undefined // Tải audio ngay khi khởi tạo
        });
        waveSurferRef.current = ws;

        // Khởi tạo RegionsPlugin
        const rp = ws.registerPlugin(RegionsPlugin.create());
        regionsPluginRef.current = rp;

        ws.on("ready", () => {
          const duration = Number(ws.getDuration() || 0);
          setWaveDuration(duration);
          setIsWaveReady(true);
          setWaveError("");
          setWaveStatus(duration > 0 ? `Audio sẵn sàng (${duration.toFixed(1)}s)` : "Audio sẵn sàng");
        });

        ws.on("error", (error: any) => {
          const message = error?.message || String(error || "Không thể load waveform");
          setWaveError(message);
          setWaveStatus("");
          setIsWaveReady(false);
        });
      } else if (waveAudioBlobUrl && waveSurferRef.current.getDuration() === 0) {
        // Nếu WaveSurfer đã có nhưng chưa load audio (ví dụ đổi audio mới)
        waveSurferRef.current.load(waveAudioBlobUrl);
      }
    }, [isWavePanelOpen, waveAudioBlobUrl]); // Thêm waveAudioBlobUrl vào dependency array

    // useEffect để quản lý regions/markers
    useEffect(() => {
      const ws = waveSurferRef.current;
      const rp = regionsPluginRef.current;

      if (!ws || !rp || !isWavePanelOpen || ws.getDuration() === 0) {
        return;
      }

      // Xóa tất cả các regions hiện có
      rp.clearRegions();

      // Thêm regions cho TimelineBlocks
      waveformTimeline.forEach((block) => {
        rp.addRegion({
          id: `block-${block.blockId}`,
          start: block.resolvedStart,
          end: block.resolvedEnd,
          color: "rgba(79, 195, 247, 0.1)", // Màu xanh nhạt cho block hội thoại
          content: block.text,
          attributes: { role: block.role || "UNKNOWN" }
        });

        // Thêm regions cho Laugh Assets
        if (block.laughAssets && block.laughAssets.length > 0) {
          block.laughAssets.forEach(laugh => {
            rp.addRegion({
              id: `laugh-${block.blockId}-${laugh.asset.id}-${laugh.offsetSeconds}`,
              start: block.resolvedStart + laugh.offsetSeconds,
              end: block.resolvedStart + laugh.offsetSeconds + (laugh.asset.duration || 0.5), // Sử dụng duration của laugh asset
              color: "rgba(255, 213, 79, 0.2)", // Màu vàng cho laugh assets
              content: `LAUGH: ${laugh.asset.id}`,
              attributes: { type: "laugh" }
            });
          });
        }

        // Thêm regions cho Pause After
        if (block.pauseAfterSeconds && block.pauseAfterSeconds > 0) {
          rp.addRegion({
            id: `pause-${block.blockId}`,
            start: block.resolvedEnd,
            end: block.resolvedEnd + block.pauseAfterSeconds,
            color: "rgba(189, 189, 189, 0.15)", // Màu xám nhạt cho pause
            content: `PAUSE: ${block.pauseAfterSeconds}s`,
            attributes: { type: "pause" }
          });
        }
      });

      // Thêm regions/markers cho Subtitle Cues
      subtitleCuesForWaveform.forEach(cue => {
        // Có thể hiển thị subtitle text trên waveform, hoặc chỉ một marker cho sự xuất hiện của nó
        rp.addRegion({
          id: `subtitle-${cue.start}-${cue.end}`,
          start: cue.start,
          end: cue.end,
          color: "rgba(100, 221, 23, 0.1)", // Màu xanh lá cây cho subtitle
          content: cue.text,
          attributes: { type: "subtitle" }
        });
      });

      // Event listener cho click vào region (tùy chọn)
      // rp.on('region-clicked', (region, e) => {
      //   e.stopPropagation(); // Ngăn chặn sự kiện click lan truyền đến waveform
      //   console.log('Region clicked:', region.id, region.start, region.end);
      //   // Có thể thêm logic phát lại từ vị trí này
      //   // ws.setTime(region.start);
      //   // ws.play();
      // });

      return () => {
        // Cleanup regions khi component unmount hoặc dependencies thay đổi
        rp.clearRegions();
      };
    }, [isWavePanelOpen, waveformTimeline, subtitleCuesForWaveform, waveSurferRef.current, regionsPluginRef.current]);

    useEffect(() => {
      return () => {
        try {
          regionsPluginRef.current?.destroy();
          waveSurferRef.current?.destroy();
        } catch {}
      };
    }, []);




  useEffect(() => {
    if (!audioUrl || !audioRef.current) return;

    const playNow = async () => {
      try {
        audioRef.current!.currentTime = 0;
        await audioRef.current!.play();
      } catch (error) {
        console.warn("Autoplay blocked:", error);
      }
    };

    playNow();
  }, [audioUrl]);

  const supportsDirectoryPicker =
    typeof window !== "undefined" && "showDirectoryPicker" in window;

  const generateButtonText = isBusy ? stageText : text.trim() ? "Tạo giọng" : stageText;
  const generateButtonIcon = isBusy ? (
    <span className="animate-spin">
      <FaSpinner />
    </span>
  ) : text.trim() ? (
    <FaPlay />
  ) : stage === "done" ? (
    <FaCheck />
  ) : (
    <FaPlay />
  );

  const handleSaveFilePrefix = () => {
    const normalized = filePrefixDraft.trim();
    if (!normalized) return;
    setFilePrefix(normalized);
    setFilePrefixDraft(normalized);
    setIsFilePrefixSaved(true);
  };

  const handleOpenRenameDialog = () => {
    setRenameDraft(filePrefix);
    setShowRenameDialog(true);
  };

  const handleConfirmRename = () => {
    const normalized = renameDraft.trim();
    if (!normalized) return;
    setFilePrefix(normalized);
    setFilePrefixDraft(normalized);
    setIsFilePrefixSaved(true);
    setShowRenameDialog(false);
  };

  const handleCancelRename = () => {
    setRenameDraft(filePrefix);
    setShowRenameDialog(false);
  };

const handleSelectWaveAudio = async () => {
  try {
    setWaveError("");
    setWaveStatus("");
    // Reset states that will be set by the new useEffects
    setWaveAudioBlobUrl(null); // Clear previous blob URL
    setWaveDuration(0); // Reset duration
    setIsWaveReady(false); // Not ready yet
    setWaveformTimeline([]); // Clear previous timeline
    setSubtitleCuesForWaveform([]); // Clear previous subtitle cues

    const result = await window.electronAPI?.selectAudioFile?.();
    if (!result || result.canceled || !result.path) return;

    // Use electronAPI to read the file as a Data URL
    const dataUrl = await window.electronAPI?.readFileAsBase64?.({ filePath: result.path });
    if (!dataUrl) { // Nếu dataUrl là null/undefined, nó chỉ ra một vấn đề hoặc bị hủy bỏ.
      throw new Error("Không thể đọc file audio hoặc bị hủy bỏ.");
    }

    setWaveAudioPath(result.path); // Store path for reference/export
    setWaveAudioBlobUrl(dataUrl); // Set the Data URL for WaveSurfer
    setIsWavePanelOpen(true); // Open panel, loading will happen in useEffect

  } catch (error: any) {
    setWaveError(error?.message || "Không chọn được file audio");
    // Ensure all states are reset in case of error
    setWaveAudioBlobUrl(null);
    setIsWaveReady(false);
    setWaveDuration(0);
    setWaveAudioPath("");
    setWaveStatus("");
    setWaveformTimeline([]);
    setSubtitleCuesForWaveform([]);
  }
};

  const handleOpenCurrentFolder = async () => {
    const targetPath = String(latestFinalVideoPath || "").trim() || String(directoryName || "").trim() || waveAudioPath || waveBackgroundImagePath;

    if (!targetPath) {
      alert("Chưa có thư mục để mở.");
      return;
    }

    console.log("App.tsx: Attempting to open targetPath:", targetPath); // NEW LOG

    try {
      const result = await window.electronAPI?.openFolderPath?.({ path: targetPath });
      if (!result?.ok) {
        throw new Error(result?.error || "Không thể mở thư mục.");
      }
    } catch (error: any) {
      alert(error?.message || "Không thể mở thư mục.");
    }
  };

  const handleSelectWaveBackgroundImage = async () => {
  try {
    setWaveError("");
    const result = await window.electronAPI?.selectImageFile?.();
    if (!result || result.canceled || !result.path) return;
    setWaveBackgroundImagePath(result.path);
  } catch (error: any) {
    setWaveError(error?.message || "Không chọn được ảnh nền");
  }
};

  const handleExportFinalMedia = async () => {
    console.log(`[EXPORT BUTTON] handleExportFinalMedia triggered.`);
    console.log(`[EXPORT BUTTON] Initial validation: waveAudioPath=${!!waveAudioPath}, waveBackgroundImagePath=${!!waveBackgroundImagePath}, isWaveReady=${isWaveReady}`);

    if (!waveAudioPath) {
      alert("Hãy chọn file audio trước.");
      console.log(`[EXPORT BUTTON] Disabled reason: Missing audio file.`);
      return;
    }

    if (!waveBackgroundImagePath) {
      alert("Hãy chọn ảnh nền trước.");
      console.log(`[EXPORT BUTTON] Disabled reason: Missing background image.`);
      return;
    }

    const generationScript = buildGenerateScript();
    if (!generationScript.length) {
      alert("Script hiện tại chưa hợp lệ để dựng subtitle/BGM.");
      console.log(`[EXPORT BUTTON] Disabled reason: Invalid generation script.`);
      return;
    }

    console.log(`[EXPORT BUTTON] Setting isExportingFinalMedia=true.`);
    setIsExportingFinalMedia(true);
    setVideoRenderProgress(8);
    setProgress(8);
    setStage("saving");
    setChunkInfo((prev) => ({
      ...prev,
      eta: "Đang dựng video..."
    }));
    setWaveError("");
    setLatestFinalVideoPath("");
    setWaveStatus("Đang chuẩn bị dựng audio final + SRT + video...");

    let progressTimer: any = null;

    try {
      progressTimer = window.setInterval(() => {
        setVideoRenderProgress((prev) => {
          const next = prev < 70 ? prev + 7 : prev < 88 ? prev + 2 : prev;
          setProgress(next);
          return next;
        });
      }, 900);

      const sourceDuration = Number(waveDuration || waveSurferRef.current?.getDuration?.() || 0);
      let initialTimelineForProcessor: TimelineBlock[]; // Raw timeline before processing
      let processedTimeline: { blocks: TimelineBlock[]; totalDuration: number; }; // Fully processed timeline

      if (waveAudioPath) {
        // Existing-audio export path.
        // Prefer the real TTS dialogue timeline if it exists because it contains
        // accurate sourceStart/sourceEnd for each generated line.
        // createTimelineForExistingAudio() is only a fallback and estimates timing by text weight,
        // which can easily make subtitles drift or disappear.
        const expectedDialogueCount = generationScript.filter((line) => String(line?.text || "").trim()).length;
        const usableLatestTimeline = Array.isArray(latestDialogueTimeline)
          ? latestDialogueTimeline.filter((block) =>
              String(block?.text || "").trim() &&
              Number(block?.end || 0) > Number(block?.start || 0)
            )
          : [];

        if (usableLatestTimeline.length >= expectedDialogueCount && expectedDialogueCount > 0) {
          initialTimelineForProcessor = usableLatestTimeline.map((block, index) => {
            const scriptLine = generationScript[index];
            return {
              ...block,
              blockId: scriptLine?.blockId ?? block.blockId ?? index + 1,
              role: scriptLine?.role ?? block.role,
              text: scriptLine?.text ?? block.text,
              subtitle: (scriptLine as any)?.subtitle ?? (block as any).subtitle ?? scriptLine?.text ?? block.text,
              pauseAfterSeconds: scriptLine?.pauseSeconds ?? block.pauseAfterSeconds ?? 0
            };
          });

          console.log("[App.tsx] Existing audio export uses latestDialogueTimeline", {
            expectedDialogueCount,
            timelineCount: usableLatestTimeline.length,
            blocks: initialTimelineForProcessor
          });
        } else {
          initialTimelineForProcessor = createTimelineForExistingAudio(
            generationScript,
            sourceDuration,
            laughAssets
          );

          console.warn("[App.tsx] Existing audio export falls back to estimated timeline", {
            expectedDialogueCount,
            latestTimelineCount: usableLatestTimeline.length,
            blocks: initialTimelineForProcessor
          });
        }

        processedTimeline = {
          blocks: initialTimelineForProcessor,
          totalDuration: sourceDuration
        };
      } else {
        // Nếu là TTS mới, dùng timeline đã có từ useTtsJob
        initialTimelineForProcessor = latestDialogueTimeline;
        // Process the timeline using the new service
        processedTimeline = processTimeline(initialTimelineForProcessor, finalGenerateSpeakerSettings, laughAssets);
      }

      // Set the processed timeline to the temporary service (TimelineService no longer processes)
      const tempTimelineService = new TimelineService(processedTimeline.blocks);

      const plan = buildCompositionPlan({
        script: generationScript,
        sourceDuration,
        bgmAssets,
        allLaughAssets: laughAssets, // NEW PARAMETER
        speakerSettings: finalGenerateSpeakerSettings, // NEW PARAMETER
        actualTimeline: processedTimeline.blocks // Use the fully processed timeline
      });

      console.log("[App.tsx] Final plan sent to composeFinalMediaFiles:", JSON.stringify(plan, null, 2)); // DEBUG LOG

      setWaveStatus("Đang mix audio final và tạo subtitle...");
      setVideoRenderProgress(24);
      setProgress(24);

      const result = await window.electronAPI?.composeFinalMedia?.({
        sourceAudioPath: waveAudioPath,
        backgroundImagePath: waveBackgroundImagePath,
        plan,
        layoutConfig: videoLayoutSettings
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Xuất media cuối thất bại");
      }

      if (progressTimer) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }

      if (result?.finalVideoPath) {
        setLatestFinalVideoPath(String(result.finalVideoPath));
      }

      setWaveStatus("Đang hoàn tất file video...");
      setVideoRenderProgress(100);
      setProgress(100);
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      setWaveStatus("Đã xuất Video thành công.");
      window.setTimeout(() => {
        alert("Đã xuất Video thành công.");
      }, 60);
    } catch (error: any) {
      if (progressTimer) {
        window.clearInterval(progressTimer);
      }
      setWaveError(error?.message || "Xuất media cuối thất bại");
      setWaveStatus("");
      setVideoRenderProgress(0);
      setProgress(0);
    } finally {
      if (progressTimer) {
        window.clearInterval(progressTimer);
      }
      setIsExportingFinalMedia(false);
      setVideoRenderProgress(0);
      setChunkInfo((prev) => ({
        ...prev,
        eta: prev.total > 0 && prev.done < prev.total ? prev.eta : ""
      }));
      setWaveError("");
      setWaveStatus("");
      setLatestFinalVideoPath("");
      setWaveAudioPath(""); // Clear the audio path
      setWaveBackgroundImagePath(""); // Clear the background image path
      if (waveAudioBlobUrl) {
        URL.revokeObjectURL(waveAudioBlobUrl); // Revoke Blob URL
      }
      setWaveAudioBlobUrl(null);
      setIsWaveReady(false);
      // setIsWavePanelOpen(false); // Do not close the panel automatically
      setWaveformTimeline([]);
      setSubtitleCuesForWaveform([]);

      // Destroy WaveSurfer and RegionsPlugin instances
      try {
        regionsPluginRef.current?.destroy();
        waveSurferRef.current?.destroy();
      } catch (e) {
        console.error("Error destroying WaveSurfer/RegionsPlugin:", e);
      }
      regionsPluginRef.current = null;
      waveSurferRef.current = null;

      // Additional cleanup if needed:
      // clear/reset TimelineService cache - TBD, may be handled by garbage collection
      // setJob(null) / setStatus("idle") - These are part of useTtsJob, assume its state is managed correctly or not relevant here.

      window.setTimeout(() => {
        // setVideoRenderProgress(0); // Already set above
        setChunkInfo((prev) => ({
          ...prev,
          eta: prev.total > 0 && prev.done < prev.total ? prev.eta : ""
        }));
      }, 1200);
    }
  };

  const selectedVoiceItem = useMemo(() => {
    return (
      customVoiceItems.find((item) => item.id === selectedVoiceId) ||
      filteredCustomVoiceItems.find((item) => item.id === selectedVoiceId) ||
      activeManagedVoice ||
      null
    );
  }, [activeManagedVoice, customVoiceItems, filteredCustomVoiceItems, selectedVoiceId]);

  const handleVoicePanelFormatChange = (value: string) => {
    setSelectedFormat((prev) => (prev === value ? prev : value));
    if (
      value === "podcast" ||
      value === "single"
    ) {
      if (format !== value) {
        setFormat(value);
      }
    }

    if (value === "podcast") {
      setSelectedVoiceType("podcast");
      if (vmVoiceType !== "podcast") setVmVoiceType("podcast");
      if (voiceType !== "podcast") setVoiceType("podcast");
      return;
    }

    const defaultType = "englishFemale";
    if (selectedVoiceType === "podcast") {
      setSelectedVoiceType(defaultType);
      if (vmVoiceType !== defaultType) setVmVoiceType(defaultType);
      if (voiceType !== defaultType) setVoiceType(defaultType);
    }
  };

  useEffect(() => {
    if (showAddVoiceDialog) return;
    if (!format) return;
    if (selectedFormat === format) return;
    setSelectedFormat(format);
  }, [format, selectedFormat, setSelectedFormat, showAddVoiceDialog]);

  const handleVoicePanelLanguageChange = (value: "en" | "vi") => {
    setSelectedLanguage((prev) => (prev === "en" ? prev : "en"));

    if (selectedFormat === "podcast") {
      return;
    }

    const defaultType = "englishFemale";
    setSelectedVoiceType((prev) => (prev === defaultType ? prev : defaultType));
    if (vmVoiceType !== defaultType) setVmVoiceType(defaultType);
    if (voiceType !== defaultType) setVoiceType(defaultType);

    const nextVoice =
      customVoiceItems.find(
        (item) =>
          item.voiceType === defaultType &&
          String(item.formatId || "single") === String(selectedFormat || "single")
      ) ||
      filteredCustomVoiceItems.find((item) => item.voiceType === defaultType) ||
      null;

    if (nextVoice?.id) {
      setSelectedVoiceId(nextVoice.id);
      if (vmVoiceName !== nextVoice.id) setVmVoiceName(nextVoice.id);
      if (voiceName !== nextVoice.id) setVoiceName(nextVoice.id);
    }
  };

  const handleVoicePanelVoiceTypeChange = (value: any) => {
    setSelectedVoiceType(value);
    if (vmVoiceType !== value) setVmVoiceType(value);
    if (voiceType !== value) setVoiceType(value);

    const nextVoice =
      customVoiceItems.find(
        (item) =>
          item.voiceType === value &&
          (String(item.formatId || "single").trim() || "single") === String(selectedFormat || "single")
      ) ||
      filteredCustomVoiceItems.find((item) => item.voiceType === value) ||
      customVoiceItems.find((item) => item.voiceType === value) ||
      null;

    if (nextVoice?.id) {
      setSelectedVoiceId(nextVoice.id);
      if (vmVoiceName !== nextVoice.id) setVmVoiceName(nextVoice.id);
      if (voiceName !== nextVoice.id) setVoiceName(nextVoice.id);
    }
  };

  const handleVoicePanelVoiceChange = (voiceId: string) => {
    const nextVoice =
      customVoiceItems.find((item) => item.id === voiceId) ||
      filteredCustomVoiceItems.find((item) => item.id === voiceId) ||
      null;

    setSelectedVoiceId(voiceId);
    if (vmVoiceName !== voiceId) setVmVoiceName(voiceId);
    if (voiceName !== voiceId) setVoiceName(voiceId);

    if (nextVoice?.formatId && nextVoice.formatId !== selectedFormat) {
      setSelectedFormat(nextVoice.formatId);
      if (format !== nextVoice.formatId) setFormat(nextVoice.formatId as any);
    }

    if (nextVoice?.voiceType) {
      setSelectedVoiceType(nextVoice.voiceType);
      if (vmVoiceType !== nextVoice.voiceType) setVmVoiceType(nextVoice.voiceType);
      if (voiceType !== nextVoice.voiceType) setVoiceType(nextVoice.voiceType);

      const nextLanguage =
        nextVoice.voiceType === "podcast" ? selectedLanguage : "en";
      if (nextLanguage !== selectedLanguage) {
        setSelectedLanguage(nextLanguage);
      }
    }
  };

  const selectedVoiceTypeValue = String(selectedVoiceType || "");
  const voicePanelVoiceTypeKey =
    selectedVoiceTypeValue === "englishMale"
      ? "male"
      : selectedVoiceTypeValue === "podcast"
        ? "podcast"
        : "female";

  const voicePanelVoiceOptions = useMemo(() => {
    return customVoiceItems.filter((item) => {
      const itemFormatId = String(item.formatId || "single").trim() || "single";
      if (itemFormatId !== String(selectedFormat || "single")) return false;
      if (selectedFormat === "podcast") return item.voiceType === "podcast";
      return voicePanelVoiceTypeKey === "male"
        ? item.voiceType === "englishMale"
        : item.voiceType === "englishFemale";
    });
  }, [customVoiceItems, selectedFormat, voicePanelVoiceTypeKey]);


  const isPodcastGenerate = format === "podcast";

  const buildGenerateScript = () => {
    if (isPodcastGenerate) return script;

    const mode = getVoiceModeFromType(
      selectedVoiceItem?.voiceType || selectedVoiceType || vmVoiceType || voiceType
    );
    return mode === "single" ? buildSingleVoiceScript(text) : script;
  };

  const currentGenerateVoiceType = isPodcastGenerate
    ? "podcast"
    : selectedVoiceItem?.voiceType ||
      activeManagedVoice?.voiceType ||
      selectedVoiceType ||
      vmVoiceType ||
      voiceType ||
      "englishFemale";

  const catalogVoiceMatch =
    (voiceCatalog?.[currentGenerateVoiceType] || []).find(
      (item) => item.id === voiceName || item.apiId === voiceName
    ) || null;

  const currentGenerateVoiceApiId = isPodcastGenerate
    ? ""
    : selectedVoiceItem?.apiId ||
      activeManagedVoice?.apiId ||
      activeVoiceInfo?.apiId ||
      catalogVoiceMatch?.apiId ||
      voiceName ||
      "";

  const currentGenerateVoiceMode = isPodcastGenerate
    ? "podcast"
    : getVoiceModeFromType(currentGenerateVoiceType);

  const finalGenerateSpeakerSettings = useVoiceDefaultPreset
    ? {
        A: {
          speed: Number(voiceConfigDraft?.A?.speed ?? speakerSettings.A.speed),
          pitch: Number(voiceConfigDraft?.A?.pitch ?? speakerSettings.A.pitch),
          pause: Number(voiceConfigDraft?.A?.pause ?? speakerSettings.A.pause),
          style: String(voiceConfigDraft?.A?.style ?? speakerSettings.A.style ?? "")
        },
        R: {
          speed: Number(voiceConfigDraft?.R?.speed ?? speakerSettings.R.speed),
          pitch: Number(voiceConfigDraft?.R?.pitch ?? speakerSettings.R.pitch),
          pause: Number(voiceConfigDraft?.R?.pause ?? speakerSettings.R.pause),
          style: String(voiceConfigDraft?.R?.style ?? speakerSettings.R.style ?? "")
        },
        blockPause: speakerSettings.blockPause
      }
    : {
        A: {
          speed: Number(speakerSettings.A.speed),
          pitch: Number(speakerSettings.A.pitch),
          pause: Number(speakerSettings.A.pause),
          style: String(speakerSettings.A.style ?? "")
        },
        R: {
          speed: Number(speakerSettings.R.speed),
          pitch: Number(speakerSettings.R.pitch),
          pause: Number(speakerSettings.R.pause),
          style: String(speakerSettings.R.style ?? "")
        },
        blockPause: speakerSettings.blockPause
      };

  const currentGenerateVoiceDebug = {
    selectedVoiceId,
    selectedVoiceType,
    vmVoiceType,
    vmVoiceName,
    voiceType,
    voiceName,
    selectedVoiceItemId: selectedVoiceItem?.id || "",
    selectedVoiceItemApiId: selectedVoiceItem?.apiId || "",
    activeManagedVoiceId: activeManagedVoice?.id || "",
    activeManagedVoiceApiId: activeManagedVoice?.apiId || "",
    currentGenerateVoiceType,
    currentGenerateVoiceApiId,
    currentGenerateVoiceMode,
    isPodcastGenerate,
    format,
    selectedFormat,
    finalGenerateSpeakerSettings
  };

  const insertTextAtCursor = (snippet: string) => {
    setText((prev) => {
      const safePrev = String(prev || "");
      if (!safePrev) return `${snippet}\n`;

      const start = Math.max(0, Math.min(scriptSelection.start || 0, safePrev.length));
      const end = Math.max(start, Math.min(scriptSelection.end || start, safePrev.length));
      const before = safePrev.slice(0, start);
      const after = safePrev.slice(end);
      const needsLeadingBreak = before.length > 0 && !before.endsWith("\n");
      const needsTrailingBreak = after.length > 0 && !after.startsWith("\n");

      return `${before}${needsLeadingBreak ? "\n" : ""}${snippet}${needsTrailingBreak ? "\n" : ""}${after}`;
    });
  };

  const handleInsertBgmTag = (asset: BgmAsset) => {
    const tag = buildBgmTag(asset, {
      duration: bgmInsertDuration,
      volume: bgmInsertVolume || asset.defaultVolume,
      mode: bgmInsertMode
    });
    insertTextAtCursor(tag);
    setShowBgmManager(false);
    setBgmMessage("Đã thêm BGM vào script.");
  };

  const bgmManagerNode = (
    <BgmManagerDialog
      show={showBgmManager}
      onClose={() => {
        setShowBgmManager(false);
        revokePreviewUrl();
      }}
      assets={filteredBgmAssets}
      loading={loadingBgmAssets}
      message={bgmMessage}
      search={bgmSearch}
      setSearch={setBgmSearch}
      onImport={importBgmAssets}
      onDelete={(assetId) => {
        void deleteBgmAsset(assetId);
      }}
      onInsertTag={handleInsertBgmTag}
      insertVolume={bgmInsertVolume}
      setInsertVolume={setBgmInsertVolume}
      insertDuration={bgmInsertDuration}
      setInsertDuration={setBgmInsertDuration}
      insertMode={bgmInsertMode}
      setInsertMode={setBgmInsertMode}
      onPreview={(asset) => {
        void previewBgmAsset(asset);
      }}
      previewAssetId={previewAssetId}
      previewAudioUrl={previewAudioUrl}
    />
  );

  const keyManagerPanelNode = (
    <KeyManagerPanel
      show={adminVisible}
      onClose={() => setAdminVisible(false)}
      currentKey={currentKey}
      fileInputRef={fileInputRef}
      handleImportKeys={handleImportKeys}
      handleTestAllKeys={handleTestAllKeys}
      handleNormalizeKeys={handleNormalizeKeys}
      handleRemoveBadKeys={handleRemoveBadKeys}
      handleClearAllKeys={handleClearAllKeys}
      handleDeleteSelectedKeys={handleDeleteSelectedKeys}
      handleDownloadLogs={handleDownloadLogs}
      handleDisableKey={disableKeyFromHook}
      handleEnableKey={enableKeyFromHook}
      fetchDashboardData={fetchDashboardData}
      testingKeys={testingKeys}
      normalizingKeys={normalizingKeys}
      removingBadKeys={removingBadKeys}
      clearingKeys={clearingKeys}
      loadingStats={loadingStats}
      selectedKeys={selectedKeys}
      managerTab={managerTab}
      setManagerTab={setManagerTab}
      keySummary={keySummary}
      recentLogs={recentLogs}
      keySearch={keySearch}
      setKeySearch={setKeySearch}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      keyPageSize={keyPageSize}
      setKeyPageSize={setKeyPageSize}
      pagedKeys={pagedKeys}
      filteredKeys={filteredKeys}
      currentKeyPage={currentKeyPage}
      totalKeyPages={totalKeyPages}
      setKeyPage={setKeyPage}
      selectedKeyIdsOnPage={selectedKeyIdsOnPage}
      setSelectedKeys={setSelectedKeys}
      handleClearLogs={handleClearLogs}
      clearingLogs={clearingLogs}
      handleClearCache={handleClearCache}
      handleOpenCacheFolder={handleOpenCacheFolder}
      cacheStats={cacheStats}
      clearingCache={clearingCache}
    />
  );

  const videoMergeManagerPanelNode = (
    <VideoMergeManagerPanel
      show={showVideoMergeManager}
      onClose={() => setShowVideoMergeManager(false)}
      defaultOutputDir={directoryName}
      onOpenFolder={(folderPath) => {
        if (folderPath) {
          void window.electronAPI?.openFolderPath?.({ path: folderPath });
        } else {
          handleOpenCurrentFolder();
        }
      }}
    />
  );

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-5">
      <div className="voice-studio-title mb-4 flex justify-center">
        <div className="text-center">
          <p className="easy-studio-child-eyebrow">Easy Studio</p>
          <h1 className="select-none text-center text-2xl font-bold tracking-tight text-slate-800">Easy Voice/Video</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <aside className="space-y-4 lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">Tên file & thư mục lưu</div>
                <div className="mt-1 text-xs text-slate-500">
                  {(filePrefixDraft || filePrefix || "Ep01").trim() || "Ep01"}-
                  {String(sequence).padStart(3, "0")}.wav
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-2 text-xs font-medium text-slate-600">Tên file</div>
                  {!isFilePrefixSaved ? (
                    <>
                      <div className="flex gap-2">
                        <input
                          value={filePrefixDraft}
                          onChange={(e: React.ChangeEvent<any>) => {
                            setFilePrefixDraft(e.target.value);
                            setFilePrefix(e.target.value);
                            setIsFilePrefixSaved(false);
                          }}
                          className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
                          placeholder="Ví dụ: Ep01"
                        />
                        <button
                          type="button"
                          onClick={handleSaveFilePrefix}
                          disabled={!filePrefixDraft.trim()}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:opacity-60"
                        >
                          Save
                        </button>
                      </div>
                      <div className="mt-2 text-xs text-amber-600">Tên file chưa được lưu.</div>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-slate-500">Tên file hiện tại</div>
                        <div className="truncate font-semibold text-slate-800" title={filePrefix}>
                          {filePrefix}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenRenameDialog}
                        className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
                      >
                        Change
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-xs font-medium text-slate-600">Thư mục lưu</div>
                  <div className="rounded-xl bg-slate-50 break-all px-3 py-2 text-sm text-slate-700">
                    {directoryName ? (
                      <span title={directoryName}>{directoryName}</span>
                    ) : (
                      <span className="text-slate-500">Chưa chọn thư mục</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={chooseFolder}
                      type="button"
                      className="rounded-xl bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
                    >
                      {directoryName ? "Đổi thư mục" : "Chọn thư mục"}
                    </button>
                    <button
                      onClick={handleOpenCurrentFolder}
                      type="button"
                      disabled={!directoryName}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FaFolderOpen />
                      Mở thư mục
                    </button>
                  </div>
                </div>
              </div>
          </div>


          <PresetPanel
            showPresetPanel={showPresetPanel}
            setShowPresetPanel={setShowPresetPanel}
            speakerSettings={speakerSettings}
            setSpeakerSettings={setSpeakerSettings}
            selectedPreset={selectedPreset}
            selectedPresetId={selectedPresetId}
            savedPresets={savedPresets}
            presetModified={panelPresetModified}
            presetMessage={presetMessage}
            defaultSpeakerSettings={defaultSpeakerSettings}
            onSavePreset={handlePanelSavePreset}
            onLoadPreset={handleLoadPreset}
            onDeletePreset={handleDeletePreset}
            onDeleteSelectedPresets={handleDeleteSelectedPresets}
            format={format}
            setFormat={setFormat}
            language={language}
            setLanguage={setLanguage}
            voiceProfile={voiceProfile}
            setVoiceProfile={setVoiceProfile}
            uiProfileDirty={uiProfileDirty}
            onApplyUiProfile={handleApplyUiProfile}
            voiceType={panelVoiceType}
            setVoiceType={handlePanelVoiceTypeChange}
            voiceName={panelVoiceName}
            setVoiceName={handlePanelVoiceNameChange}
            voiceCatalog={voiceCatalog}
            formatOptions={effectiveFormatItems}
            onOpenAddVoice={handleOpenAddVoiceDialog}
            onPreviewVoice={handlePreviewVoice}
            useVoiceDefaultPreset={useVoiceDefaultPreset}
            onToggleUseVoiceDefaultPreset={setUseVoiceDefaultPreset}
          />
        </aside>

        <main className="space-y-4 lg:col-span-8">
          <ScriptEditorPanel
            text={text}
            setText={setText}
            maxChars={MAX_CHARS}
            format={format}
            language={language}
            getTextPlaceholder={getTextPlaceholder}
            onOpenBgmManager={() => setShowBgmManager(true)}
            onOpenLaughManager={() => setShowLaughManager(true)}
            onCursorChange={(start, end) => setScriptSelection({ start, end })}
            laughAssetMode={laughAssetMode}
          />

          <AppActionPanels
            isBusy={isBusy}
            adminVisible={adminVisible}
            showVideoMergeManager={showVideoMergeManager}
            generateButtonIcon={generateButtonIcon}
            generateButtonText={generateButtonText}
            onToggleKeyManager={() => setAdminVisible((prev) => !prev)}
            onToggleVideoMergeManager={() => setShowVideoMergeManager((prev) => !prev)}
            onGenerate={() => {
              if (!currentGenerateVoiceType) {
                alert("Thiếu voiceType để generate.");
                return;
              }

              if (!isPodcastGenerate && !currentGenerateVoiceApiId) {
                alert("Thiếu apiId của voice để generate.");
                return;
              }

              console.log("GENERATE DEBUG:", currentGenerateVoiceDebug);

              return (handleGenerate as any)(
                text,
                buildGenerateScript(),
                finalGenerateSpeakerSettings,
                {
                  voiceMode: currentGenerateVoiceMode,
                  voiceType: currentGenerateVoiceType,
                  voiceName: isPodcastGenerate ? "" : currentGenerateVoiceApiId,
                  engineMode,
                  laughAssetMode
                }
              );
            }}
            keyManagerPanel={keyManagerPanelNode}
            videoMergeManagerPanel={videoMergeManagerPanelNode}
            onOpenWaveform={() => setIsWavePanelOpen(true)}
          />

          {bgmManagerNode}
          <LaughManagerDialog
            open={showLaughManager}
            onClose={() => setShowLaughManager(false)}
            laughAssetMode={laughAssetMode}
            setLaughAssetMode={setLaughAssetMode}
          />

          {!supportsDirectoryPicker && (
            <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              Trình duyệt hiện tại không hỗ trợ chọn thư mục trực tiếp. App vẫn chạy bình
              thường, nhưng file sẽ tải xuống theo cách mặc định của trình duyệt.
            </div>
          )}

          <AudioPlayerPanel
            audioUrl={audioUrl}
            isPreviewingVoice={isPreviewingVoice}
            audioRef={audioRef}
          />

          <AudioProgressPanel
            stage={stage}
            progress={progress}
            chunkInfo={chunkInfo}
            jobStatus={jobStatus}
            currentKey={currentKey}
            isBusy={isBusy}
            onStopGeneration={stopGeneration}
          />


        </main>
      </div>


      <VideoLayoutManagerDialog
        open={showVideoLayoutManager}
        onClose={() => setShowVideoLayoutManager(false)}
        value={videoLayoutSettings}
        onChange={setVideoLayoutSettings}
        onReset={() => setVideoLayoutSettings(resetVideoLayoutSettings())}
        previewBackgroundPath={waveBackgroundImagePath}
      />

      <WaveformDialog
        show={isWavePanelOpen}
        onClose={() => setIsWavePanelOpen(false)}
        waveAudioPath={waveAudioPath}
        waveBackgroundImagePath={waveBackgroundImagePath}
        waveStatus={waveStatus}
        waveDuration={waveDuration}
        waveError={waveError}
        waveAudioPreviewRef={waveAudioPreviewRef}
        waveContainerRef={waveContainerRef}
        isExportingFinalMedia={isExportingFinalMedia}
        isWaveReady={isWaveReady}
        videoRenderProgress={videoRenderProgress}
        onSelectAudio={handleSelectWaveAudio}
        onSelectBackgroundImage={handleSelectWaveBackgroundImage}
        onOpenFolder={handleOpenCurrentFolder}
        onExportFinalMedia={handleExportFinalMedia}
        onOpenVideoLayoutManager={() => setShowVideoLayoutManager(true)}
        waveformTimeline={waveformTimeline}
        subtitleCues={subtitleCuesForWaveform}
      />


      {showRenameDialog ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold text-slate-800">Đổi tên file</div>
            <div className="mt-1 text-sm text-slate-500">Nhập tên mới rồi bấm Save.</div>

            <input
              type="text"
              value={renameDraft}
              onChange={(e: React.ChangeEvent<any>) => setRenameDraft(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<any>) => {
                if (e.key === "Enter") handleConfirmRename();
                if (e.key === "Escape") handleCancelRename();
              }}
              className="mt-4 w-full rounded-xl border px-3 py-2"
              placeholder="Ví dụ: Ep01"
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelRename}
                className="rounded-xl bg-slate-200 px-4 py-2 text-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmRename}
                disabled={!renameDraft.trim()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}


      <style>{`
        @keyframes shine {
          0% { transform: translateX(-30%); }
          100% { transform: translateX(130%); }
        }
      `}</style>
    </div>
  );
}