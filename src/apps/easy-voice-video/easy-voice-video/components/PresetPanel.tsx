import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FaChevronDown,
  FaChevronUp,
  FaCog,
  FaFileExport,
  FaFileImport,
  FaPlay,
  FaSave,
  FaTimes,
  FaTrash
} from "react-icons/fa";
import { fixMojibake } from "../utils/textEncoding";
import type {
  LanguageOption,
  VoiceFormat,
  VoiceProfileOption,
  VoiceTypeOption,
  VoiceCatalogItem,
  VoiceCatalog
} from "../shared/types/voice";
import type { SpeakerSettings, SpeakerPreset, SavedPreset } from "../services/speakerPresets"; // Sử dụng SpeakerSettings, SpeakerPreset, SavedPreset từ speakerPresets
import type { BlockPreset } from "../shared/types/timeline"; // Sử dụng BlockPreset từ shared/types/timeline
import type { ManagedSavedPreset } from "../hooks/useSpeakerPresetManager"; // Sử dụng ManagedSavedPreset từ hook
import { BLOCK_TAGS } from "../services/speakerPresets"; // Import BLOCK_TAGS

// Các type cục bộ này đã được di chuyển sang shared/types/voice.ts
// type VoiceCatalogItem = { ... };
// type VoiceCatalog = { ... };

type FormatItem = {
  id: string;
  label: string;
};

// Cập nhật PresetPanelProps để sử dụng các type mới
type PresetPanelProps = {
  showPresetPanel: boolean;
  setShowPresetPanel: React.Dispatch<React.SetStateAction<boolean>>;
  speakerSettings: SpeakerSettings;
  setSpeakerSettings: React.Dispatch<React.SetStateAction<SpeakerSettings>>;
  selectedPreset: ManagedSavedPreset | null; // Sử dụng ManagedSavedPreset
  selectedPresetId: string;
  savedPresets: ManagedSavedPreset[]; // Sử dụng ManagedSavedPreset
  presetModified: boolean;
  presetMessage: string;
  defaultSpeakerSettings: SpeakerSettings;
  onSavePreset: (name: string, tags: string[]) => void; // Thêm tags vào onSavePreset
  onLoadPreset: (presetId: string) => void;
  onDeletePreset: () => void;
  onDeleteSelectedPresets?: (presetIds: string[]) => void;
  format: VoiceFormat;
  setFormat:
    | React.Dispatch<React.SetStateAction<VoiceFormat>>
    | ((value: VoiceFormat) => void);
  language: LanguageOption;
  setLanguage:
    | React.Dispatch<React.SetStateAction<LanguageOption>>
    | ((value: LanguageOption) => void);
  voiceProfile: VoiceProfileOption;
  setVoiceProfile:
    | React.Dispatch<React.SetStateAction<VoiceProfileOption>>
    | ((value: VoiceProfileOption) => void);
  uiProfileDirty: boolean;
  onApplyUiProfile: () => void;
  voiceType?: VoiceTypeOption;
  setVoiceType?:
    | React.Dispatch<React.SetStateAction<VoiceTypeOption>>
    | ((value: VoiceTypeOption) => void);
  voiceName?: string;
  setVoiceName?:
    | React.Dispatch<React.SetStateAction<string>>
    | ((value: string) => void);
  voiceCatalog?: VoiceCatalog;
  formatOptions?: FormatItem[];
  onOpenAddVoice?: () => void;
  onPreviewVoice?: () => void;
  useVoiceDefaultPreset?: boolean;
  onToggleUseVoiceDefaultPreset?: (checked: boolean) => void;
};

type AutoPauseRule = {
  id: string;
  text: string;
  pause: string;
  checked?: boolean;
};

const PRESET_STORAGE_KEY = "easy-english-voice-generator-presets";

const VOICE_TYPE_OPTIONS: Array<{ value: VoiceTypeOption; label: string }> = [
  { value: "podcast", label: "Podcast" },
  { value: "englishMale", label: "Nam" },
  { value: "englishFemale", label: "Nữ" }
];


function normalizeBlockTagInput(value: string) {
  return value.replace(/#/g, "").replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase();
}

function toBlockTag(value?: string) {
  const cleaned = normalizeBlockTagInput(String(value || ""));
  return cleaned ? `#${cleaned}` : "";
}

function getPresetPrimaryTag(preset: Pick<ManagedSavedPreset, "tags" | "name">) {
  const tag = (preset.tags || []).map(toBlockTag).find(Boolean);
  return tag || toBlockTag(preset.name) || "#PRESET";
}

function voiceTypeLabel(value?: string) {
  if (value === "podcast") return "Podcast";
  if (value === "englishMale") return "Nam";
  if (value === "englishFemale") return "Nữ";
  return value || "-";
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob(["\uFEFF", JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function setValue<T>(
  setter: React.Dispatch<React.SetStateAction<T>> | ((value: T) => void) | undefined,
  value: T
) {
  if (!setter) return;
  setter(value);
}

function normalizeImportedPreset(raw: any): ManagedSavedPreset | null {
  const id = String(raw?.id || "").trim();
  const name = fixMojibake(raw?.name || "");
  if (!id || !name) return null;

  return {
    id,
    name,
    speakerSettings: {
      A: {
        speed: Number(raw?.speakerSettings?.A?.speed ?? 1),
        pitch: Number(raw?.speakerSettings?.A?.pitch ?? 0),
        pause: Number(raw?.speakerSettings?.A?.pause ?? 0),
        style: fixMojibake(raw?.speakerSettings?.A?.style || "")
      },
      R: {
        speed: Number(raw?.speakerSettings?.R?.speed ?? 1),
        pitch: Number(raw?.speakerSettings?.R?.pitch ?? 0),
        pause: Number(raw?.speakerSettings?.R?.pause ?? 0),
        style: fixMojibake(raw?.speakerSettings?.R?.style || "")
      },
      blockPause: Number(raw?.speakerSettings?.blockPause ?? 0),
      autoBlockPause: !!raw?.speakerSettings?.autoBlockPause, // Ánh xạ thuộc tính mới
      autoBlockPauseRules: Array.isArray(raw?.speakerSettings?.autoBlockPauseRules) // Ánh xạ thuộc tính mới
        ? raw.speakerSettings.autoBlockPauseRules
        : []
    },
    voiceType:
      raw?.voiceType === "podcast" ||
      raw?.voiceType === "englishMale" ||
      raw?.voiceType === "englishFemale"
        ? raw.voiceType
        : "podcast",
    voiceName: String(raw?.voiceName || "").trim(),
    format: raw?.format || "podcast",
    language: raw?.language || "en",
    voiceProfile:
      raw?.voiceProfile === "warm" || raw?.voiceProfile === "clear" || raw?.voiceProfile === "story"
        ? raw.voiceProfile
        : "default",
    tags: Array.isArray(raw?.tags) ? raw.tags.map(String).filter(Boolean) : [] // Xử lý tags khi import
  };
}

function PresetField({
  label,
  children,
  compact = false
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <label className="block space-y-1">
      <div className={`font-medium text-slate-600 ${compact ? "text-[11px]" : "text-xs"}`}>
        {label}
      </div>
      {children}
    </label>
  );
}

function getVoiceTypeOptionsForLanguage(
  _language: LanguageOption,
  format: VoiceFormat
): Array<{ value: VoiceTypeOption; label: string }> {
  if (format === "podcast") {
    return VOICE_TYPE_OPTIONS.filter((item) => item.value === "podcast");
  }

  return VOICE_TYPE_OPTIONS.filter(
    (item) => item.value === "englishMale" || item.value === "englishFemale"
  );
}

function ensureVoiceTypeMatches(
  language: LanguageOption,
  format: VoiceFormat,
  current: VoiceTypeOption
): VoiceTypeOption {
  const options = getVoiceTypeOptionsForLanguage(language, format);
  const exists = options.some((item) => item.value === current);
  return exists ? current : (options[0]?.value ?? "podcast");
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function makeRule(): AutoPauseRule {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    text: "",
    pause: "",
    checked: false
  };
}

function AutoPauseDialog({
  initialRules,
  onClose,
  onSave
}: {
  initialRules: AutoPauseRule[];
  onClose: () => void;
  onSave: (rules: AutoPauseRule[]) => void;
}) {
  const [rules, setRules] = useState<AutoPauseRule[]>(
    initialRules.length ? initialRules : [makeRule()]
  );

  const updateRule = (id: string, patch: Partial<AutoPauseRule>) => {
    setRules((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addRule = () => setRules((prev) => [...prev, makeRule()]);

  const deleteChecked = () => {
    const next = rules.filter((item) => !item.checked);
    setRules(next.length ? next : [makeRule()]);
  };

  const handleSave = () => {
    const cleanedRules = rules
      .map(({ checked, ...rest }) => ({
        ...rest,
        text: rest.text.trim(),
        pause: rest.pause.trim()
      }))
      .filter((item) => item.text && item.pause);

    onSave(cleanedRules);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="border-b px-5 py-4">
          <div className="text-lg font-semibold text-slate-800">Thiết lập Pause giữa block</div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {rules.map((rule, index) => (
              <div
                key={rule.id}
                className="grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[110px_minmax(0,1fr)_180px_50px]"
              >
                <div className="flex items-center text-sm font-medium text-slate-700">
                  Block {index + 1}
                </div>

                <input
                  type="text"
                  value={rule.text}
                  onChange={(e) => updateRule(rule.id, { text: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2"
                  placeholder="Ví dụ: #Hook"
                />

                <input
                  type="text"
                  value={rule.pause}
                  onChange={(e) => updateRule(rule.id, { pause: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2"
                  placeholder="Ví dụ: 2"
                />

                <label className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={!!rule.checked}
                    onChange={(e) => updateRule(rule.id, { checked: e.target.checked })}
                  />
                </label>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={addRule}
              className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Thêm dòng
            </button>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-4">
          <button
            type="button"
            onClick={handleSave}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
          >
            Save
          </button>

          <button
            type="button"
            onClick={deleteChecked}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white"
          >
            Xóa
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PresetPanel({
  showPresetPanel,
  setShowPresetPanel,
  speakerSettings,
  setSpeakerSettings,
  selectedPreset,
  selectedPresetId,
  savedPresets,
  presetModified,
  presetMessage,
  defaultSpeakerSettings,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onDeleteSelectedPresets,
  format,
  setFormat,
  language,
  setLanguage,
  voiceProfile,
  setVoiceProfile,
  uiProfileDirty,
  onApplyUiProfile,
  voiceType = "podcast",
  setVoiceType,
  voiceName = "",
  setVoiceName,
  voiceCatalog,
  formatOptions = [],
  onOpenAddVoice,
  onPreviewVoice,
  useVoiceDefaultPreset = true,
  onToggleUseVoiceDefaultPreset
}: PresetPanelProps) {
  void defaultSpeakerSettings;
  void setLanguage;
  void setVoiceProfile;
  void onOpenAddVoice;

  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showAutoPauseDialog, setShowAutoPauseDialog] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const [presetTagsInput, setPresetTagsInput] = useState<string>("");
  const saveInputRef = useRef<HTMLInputElement | null>(null);
  const presetImportRef = useRef<HTMLInputElement | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedDeletePresetIds, setSelectedDeletePresetIds] = useState<string[]>([]);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedExportPresetIds, setSelectedExportPresetIds] = useState<string[]>([]);
  const [expandedPresetIds, setExpandedPresetIds] = useState<string[]>([]);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [blockNameInput, setBlockNameInput] = useState("");

  useEffect(() => {
    if (speakerSettings.autoBlockPause === undefined) {
      setSpeakerSettings((prev) => ({
        ...prev,
        autoBlockPause: true
      }));
    }
  }, [speakerSettings.autoBlockPause, setSpeakerSettings]);

  const mergedVoiceCatalog = useMemo<VoiceCatalog>(() => voiceCatalog ?? {}, [voiceCatalog]);

  const effectiveFormatOptions: FormatItem[] =
    formatOptions.length > 0
      ? formatOptions
      : [
          { id: "podcast", label: "Format Podcast" },
          { id: "single", label: "Format Single" }
        ];

  const normalizedFormat = format as VoiceFormat;

  const voiceTypeOptions = useMemo<Array<{ value: VoiceTypeOption; label: string }>>(
    () => getVoiceTypeOptionsForLanguage(language, normalizedFormat),
    [language, normalizedFormat]
  );

  const normalizedVoiceType = useMemo<VoiceTypeOption>(
    () => ensureVoiceTypeMatches(language, normalizedFormat, voiceType),
    [language, normalizedFormat, voiceType]
  );

  const voiceNameOptions = useMemo<VoiceCatalogItem[]>(
    () => mergedVoiceCatalog[normalizedVoiceType] ?? [],
    [mergedVoiceCatalog, normalizedVoiceType]
  );

  const displayedVoiceType = normalizedVoiceType;

  const displayedVoiceName = useMemo(() => {
    if (voiceNameOptions.length === 0) return "";
    const exists = voiceNameOptions.some((item) => item.id === voiceName);
    return exists ? voiceName : (voiceNameOptions[0]?.id ?? "");
  }, [voiceName, voiceNameOptions]);

  useEffect(() => {
    if (voiceType !== displayedVoiceType) {
      setValue(setVoiceType, displayedVoiceType);
    }
  }, [displayedVoiceType, setVoiceType, voiceType]);

  useEffect(() => {
    if (!displayedVoiceName) return;
    if (voiceName !== displayedVoiceName) {
      setValue(setVoiceName, displayedVoiceName);
    }
  }, [displayedVoiceName, setVoiceName, voiceName]);

  useEffect(() => {
    if (!showSaveDialog) return;
    const t = window.setTimeout(() => {
      saveInputRef.current?.focus();
      saveInputRef.current?.select();
    }, 30);
    return () => window.clearTimeout(t);
  }, [showSaveDialog]);

  const isPodcast = normalizedFormat === "podcast";
  const autoBlockPause = speakerSettings.autoBlockPause !== false;
  const autoPauseRules = speakerSettings.autoBlockPauseRules ?? [];

  const summaryLines = isPodcast
    ? [
        `A: Speed ${formatNumber(speakerSettings.A.speed)} / Pitch ${formatNumber(
          speakerSettings.A.pitch
        )} / Pause ${formatNumber(speakerSettings.A.pause)}`,
        `R: Speed ${formatNumber(speakerSettings.R.speed)} / Pitch ${formatNumber(
          speakerSettings.R.pitch
        )} / Pause ${formatNumber(speakerSettings.R.pause)}`,
        `Block Pause: ${formatNumber(speakerSettings.blockPause)}`
      ]
    : [
        `Speed ${formatNumber(speakerSettings.A.speed)} / Pitch ${formatNumber(
          speakerSettings.A.pitch
        )} / Pause ${formatNumber(speakerSettings.A.pause)}`,
        `Block Pause: ${formatNumber(speakerSettings.blockPause)}`
      ];

  const handleSpeakerChange = (role: "A" | "R", field: keyof SpeakerPreset, value: string) => {
    setSpeakerSettings((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [field]: field === "style" ? value : Number(value)
      }
    }));
  };

  const handleSaveDialogOpen = () => {
    setPresetNameInput(selectedPreset?.name || "Preset mới");
    setPresetTagsInput(selectedPreset?.tags?.join(", ") || ""); // Initialize tags input
    setShowSaveDialog(true);
  };

  const handleSaveDialogClose = () => {
    setShowSaveDialog(false);
    setPresetNameInput("");
    setPresetTagsInput(""); // Clear tags input
  };

  const handleSavePreset = () => {
    const name = presetNameInput.trim();
    if (!name) return;
    const tags = presetTagsInput.split(",").map(tag => tag.trim()).filter(Boolean);
    onSavePreset(name, tags);
    handleSaveDialogClose();
  };

  const openCreatePreset = () => {
    setEditingPresetId(null);
    setBlockNameInput("");
    setShowConfigDialog(true);
  };

  const openEditPreset = (preset: ManagedSavedPreset) => {
    onLoadPreset(preset.id);
    setEditingPresetId(preset.id);
    setBlockNameInput(normalizeBlockTagInput(getPresetPrimaryTag(preset)));
    setShowConfigDialog(true);
  };

  const togglePresetExpanded = (presetId: string) => {
    setExpandedPresetIds((prev) =>
      prev.includes(presetId) ? prev.filter((id) => id !== presetId) : [...prev, presetId]
    );
  };

  const handleSaveBlockPreset = () => {
    const tag = toBlockTag(blockNameInput);
    if (!tag) {
      alert("Vui lòng nhập Tên Block, ví dụ: HOOK");
      return;
    }
    onSavePreset(tag, [tag]);
    setShowConfigDialog(false);
  };

  const visibleManualPresets = useMemo(
    () =>
      savedPresets.filter(
        (preset) =>
          !preset.hiddenInMainDropdown &&
          !preset.importedFromVoice &&
          (preset.format || format) === format
      ),
    [savedPresets, format]
  );

  const blockPresets = useMemo(
    () =>
      visibleManualPresets
        .map((preset) => ({ ...preset, primaryTag: getPresetPrimaryTag(preset) }))
        .sort((a, b) => a.primaryTag.localeCompare(b.primaryTag)),
    [visibleManualPresets]
  );

  const exportablePresets = useMemo(
    () => savedPresets.filter((preset) => !preset.hiddenInMainDropdown && !preset.importedFromVoice),
    [savedPresets]
  );

  useEffect(() => {
    setSelectedExportPresetIds((prev) => {
      const allowed = new Set(exportablePresets.map((item) => item.id));
      const next = prev.filter((id) => allowed.has(id));
      return next.length ? next : exportablePresets.map((item) => item.id);
    });
  }, [exportablePresets]);

  const displayedSelectedPresetId = useMemo(() => {
    const exists = visibleManualPresets.some((preset) => preset.id === selectedPresetId);
    return exists ? selectedPresetId : "";
  }, [visibleManualPresets, selectedPresetId]);

  const deleteablePresets = useMemo(
    () =>
      savedPresets
        .filter((preset) => !preset.importedFromVoice)
        .slice()
        .sort((a, b) => fixMojibake(a.name).localeCompare(fixMojibake(b.name), "vi")),
    [savedPresets]
  );

  const selectedDeleteCount = selectedDeletePresetIds.length;
  const allDeleteSelected =
    deleteablePresets.length > 0 && selectedDeleteCount === deleteablePresets.length;

  const handleOpenDeleteDialog = () => {
    setSelectedDeletePresetIds([]);
    setShowDeleteDialog(true);
  };

  const handleCloseDeleteDialog = () => {
    setShowDeleteDialog(false);
    setSelectedDeletePresetIds([]);
  };

  const handleToggleDeletePreset = (presetId: string, checked: boolean) => {
    setSelectedDeletePresetIds((prev) => {
      if (checked) {
        if (prev.includes(presetId)) return prev;
        return [...prev, presetId];
      }
      return prev.filter((id) => id !== presetId);
    });
  };

  const handleToggleDeleteAll = (checked: boolean) => {
    setSelectedDeletePresetIds(checked ? deleteablePresets.map((preset) => preset.id) : []);
  };

  const handleConfirmDeleteSelected = () => {
    if (!selectedDeletePresetIds.length) return;
    if (onDeleteSelectedPresets) {
      onDeleteSelectedPresets(selectedDeletePresetIds);
      handleCloseDeleteDialog();
      return;
    }
    onDeletePreset();
    handleCloseDeleteDialog();
  };

  return (
    <>
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-slate-800">Preset Manager</div>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={!!useVoiceDefaultPreset}
                onChange={(e) => onToggleUseVoiceDefaultPreset?.(e.target.checked)}
              />
              <span
                className={`rounded-md px-2 py-1 text-sm font-medium ${
                  useVoiceDefaultPreset
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-600"
                }`}
              >
                Dùng Preset mặc định của Voice
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowPresetPanel((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-base text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label={showPresetPanel ? "Thu gọn" : "Mở rộng"}
          >
            {showPresetPanel ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>

        {showPresetPanel ? (
          <div className="mt-4 space-y-4">
            <div className="space-y-3">
              {blockPresets.length ? (
                blockPresets.map((preset) => {
                  const isExpanded = expandedPresetIds.includes(preset.id);
                  return (
                    <div key={preset.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <button
                          type="button"
                          onClick={() => togglePresetExpanded(preset.id)}
                          className="inline-flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="text-slate-500">{isExpanded ? <FaChevronUp /> : <FaChevronDown />}</span>
                          <span className="truncate text-base font-semibold text-slate-900">{preset.primaryTag}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => openEditPreset(preset)}
                          className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100"
                        >
                          Sửa
                        </button>
                      </div>

                      {isExpanded ? (
                        <div className="border-t border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div><span className="font-medium text-slate-800">Voice:</span> {preset.voiceName || "Podcast mặc định"}</div>
                            <div><span className="font-medium text-slate-800">Pause:</span> {formatNumber(preset.speakerSettings?.blockPause ?? 0)}s giữa block</div>
                            <div><span className="font-medium text-slate-800">Format:</span> {preset.format || "podcast"}</div>
                            <div><span className="font-medium text-slate-800">Loại giọng:</span> {voiceTypeLabel(preset.voiceType)}</div>
                            <div className="md:col-span-2"><span className="font-medium text-slate-800">Voice style:</span> {preset.speakerSettings?.A?.style || "-"}</div>
                            <div className="md:col-span-2"><span className="font-medium text-slate-800">Speaker setup:</span> A speed {formatNumber(preset.speakerSettings?.A?.speed ?? 1)} / R speed {formatNumber(preset.speakerSettings?.R?.speed ?? 1)}</div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Chưa có preset block. Bấm "Tạo Preset" để tạo preset mới.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openCreatePreset}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-800"
                >
                  <FaCog />
                  Tạo Preset
                </button>

                <button
                  type="button"
                  onClick={() => onPreviewVoice?.()}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-emerald-700"
                >
                  <FaPlay />
                  Nghe thử
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {presetMessage ? <div className="text-sm font-medium text-emerald-700">{presetMessage}</div> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {showDeleteDialog ? (
        <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-800">Xóa preset</div>
                <div className="mt-1 text-sm text-slate-500">
                  Chọn preset muốn xóa trong danh sách bên dưới.
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseDeleteDialog}
                className="text-slate-500 hover:text-slate-700"
              >
                <FaTimes />
              </button>
            </div>

            <label className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="inline-flex items-center gap-3 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={allDeleteSelected}
                  onChange={(e) => handleToggleDeleteAll(e.target.checked)}
                />
                Chọn tất cả
              </span>
              <span className="text-sm font-medium text-slate-600">
                Đã chọn: {selectedDeleteCount}/{deleteablePresets.length}
              </span>
            </label>

            <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-2xl border border-slate-200">
              {deleteablePresets.length ? (
                <div className="divide-y divide-slate-200">
                  {deleteablePresets.map((preset) => {
                    const checked = selectedDeletePresetIds.includes(preset.id);

                    return (
                      <label
                        key={preset.id}
                        className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
                      >
                        <span className="inline-flex min-w-0 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => handleToggleDeletePreset(preset.id, e.target.checked)}
                          />
                          <span className="truncate text-sm font-medium text-slate-800">
                            {fixMojibake(preset.name)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {(preset.format || "-") === "podcast"
                            ? "Podcast"
                            : (preset.format || "-") === "single"
                              ? "Single"
                              : fixMojibake(String(preset.format || "-"))}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  Chưa có preset để xóa.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseDeleteDialog}
                className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSelected}
                disabled={!selectedDeleteCount}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                <FaTrash />
                Xóa preset đã chọn ({selectedDeleteCount})
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showConfigDialog ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="relative max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-slate-800">{editingPresetId ? `Sửa Preset ${toBlockTag(blockNameInput) || ""}` : "Tạo Preset"}</div>
              </div>

              <button
                type="button"
                onClick={() => setShowConfigDialog(false)}
                className="text-slate-500 hover:text-slate-700"
              >
                <FaTimes />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[150px_150px_minmax(0,1fr)]">
                <PresetField label="Format" compact>
                  <select
                    value={normalizedFormat}
                    onChange={(e) => setValue(setFormat, e.target.value as VoiceFormat)}
                    className="w-full rounded-xl border bg-white px-3 py-2"
                  >
                    {effectiveFormatOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </PresetField>

                <PresetField label="Loại giọng" compact>
                  <select
                    value={displayedVoiceType}
                    onChange={(e) => setValue(setVoiceType, e.target.value as VoiceTypeOption)}
                    disabled={isPodcast}
                    className="w-full rounded-xl border bg-white px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {voiceTypeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </PresetField>

                <PresetField label="Tên Voice" compact>
                  <select
                    value={displayedVoiceName}
                    onChange={(e) => setValue(setVoiceName, e.target.value)}
                    disabled={voiceNameOptions.length === 0}
                    className="w-full rounded-xl border bg-white px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100"
                  >
                    {voiceNameOptions.length > 0 ? (
                      voiceNameOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))
                    ) : (
                      <option value="">Chưa có voice</option>
                    )}
                  </select>
                </PresetField>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => presetImportRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  <FaFileImport />
                  Import
                </button>

                <button
                  type="button"
                  onClick={() => setShowExportDialog(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <FaFileExport />
                  Export
                </button>
              </div>

              <input
                ref={presetImportRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (!file) return;

                  try {
                    const rawText = await file.text();
                    const parsed = JSON.parse(rawText);
                    const incoming = (Array.isArray(parsed) ? parsed : parsed?.presets || [])
                      .map(normalizeImportedPreset)
                      .filter(Boolean) as SavedPreset[];

                    if (!incoming.length) {
                      alert("Không tìm thấy preset hợp lệ trong file.");
                      return;
                    }

                    const existing = savedPresets || [];
                    const next = [...incoming, ...existing].filter(
                      (item, index, arr) =>
                        arr.findIndex(
                          (other) =>
                            other.id === item.id ||
                            other.name.toLowerCase() === item.name.toLowerCase()
                        ) === index
                    );

                    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
                    window.location.reload();
                  } catch (error) {
                    console.error(error);
                    alert("Import preset thất bại.");
                  }
                }}
              />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-800">Block & Pause</div>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <PresetField label="Tên Block" compact>
                  <div className="flex rounded-xl border bg-white shadow-sm focus-within:border-slate-400">
                    <span className="inline-flex items-center rounded-l-xl border-r bg-slate-50 px-3 text-sm font-semibold text-slate-600">#</span>
                    <input
                      type="text"
                      value={blockNameInput}
                      onChange={(e) => setBlockNameInput(normalizeBlockTagInput(e.target.value))}
                      className="min-w-0 flex-1 rounded-r-xl px-3 py-2 outline-none"
                      placeholder="Ví dụ: HOOK"
                    />
                  </div>
                </PresetField>

                <PresetField label="Pause giữa các block" compact>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={20}
                    value={speakerSettings.blockPause}
                    onChange={(e) =>
                      setSpeakerSettings((prev) => ({
                        ...prev,
                        blockPause: Number(e.target.value)
                      }))
                    }
                    className="w-full rounded-xl border px-3 py-2"
                    placeholder="Ví dụ: 2s"
                  />
                </PresetField>
              </div>
            </div>

            <div className="mt-5">
              {isPodcast ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(["A", "R"] as const).map((role) => (
                    <div key={role} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 text-sm font-semibold text-slate-800">Speaker {role}</div>

                      <div className="grid grid-cols-3 gap-3">
                        <PresetField label="Speed" compact>
                          <input
                            type="number"
                            step="0.01"
                            min={0.5}
                            max={2}
                            value={speakerSettings[role].speed}
                            onChange={(e) => handleSpeakerChange(role, "speed", e.target.value)}
                            className="w-full rounded-xl border px-3 py-2"
                          />
                        </PresetField>

                        <PresetField label="Pitch" compact>
                          <input
                            type="number"
                            step="0.1"
                            min={-20}
                            max={20}
                            value={speakerSettings[role].pitch}
                            onChange={(e) => handleSpeakerChange(role, "pitch", e.target.value)}
                            className="w-full rounded-xl border px-3 py-2"
                          />
                        </PresetField>

                        <PresetField label="Pause sau câu thoại" compact>
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            max={10}
                            value={speakerSettings[role].pause}
                            onChange={(e) => handleSpeakerChange(role, "pause", e.target.value)}
                            className="w-full rounded-xl border px-3 py-2"
                          />
                        </PresetField>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-3 gap-3">
                    <PresetField label="Speed" compact>
                      <input
                        type="number"
                        step="0.01"
                        min={0.5}
                        max={2}
                        value={speakerSettings.A.speed}
                        onChange={(e) => {
                          handleSpeakerChange("A", "speed", e.target.value);
                          handleSpeakerChange("R", "speed", e.target.value);
                        }}
                        className="w-full rounded-xl border px-3 py-2"
                      />
                    </PresetField>

                    <PresetField label="Pitch" compact>
                      <input
                        type="number"
                        step="0.1"
                        min={-20}
                        max={20}
                        value={speakerSettings.A.pitch}
                        onChange={(e) => {
                          handleSpeakerChange("A", "pitch", e.target.value);
                          handleSpeakerChange("R", "pitch", e.target.value);
                        }}
                        className="w-full rounded-xl border px-3 py-2"
                      />
                    </PresetField>

                    <PresetField label="Pause sau câu thoại" compact>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        max={10}
                        value={speakerSettings.A.pause}
                        onChange={(e) => {
                          handleSpeakerChange("A", "pause", e.target.value);
                          handleSpeakerChange("R", "pause", e.target.value);
                        }}
                        className="w-full rounded-xl border px-3 py-2"
                      />
                    </PresetField>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div className="text-sm text-slate-500">Voice Profile: {voiceProfile}</div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfigDialog(false)}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2 text-slate-800"
                >
                  <FaTimes />
                  Đóng
                </button>

                <button
                  type="button"
                  onClick={handleSaveBlockPreset}
                  disabled={!toBlockTag(blockNameInput)}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white shadow disabled:opacity-60"
                >
                  <FaSave />
                  Lưu
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showExportDialog ? (
        <div className="fixed inset-0 z-[131] flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="border-b px-5 py-4">
              <div className="text-lg font-semibold text-slate-800">Xuất Preset</div>
              <div className="mt-1 text-sm text-slate-500">Chọn preset cần xuất rồi bấm Xuất file.</div>
            </div>

            <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={
                    exportablePresets.length > 0 &&
                    selectedExportPresetIds.length === exportablePresets.length
                  }
                  onChange={(e) =>
                    setSelectedExportPresetIds(
                      e.target.checked ? exportablePresets.map((item) => item.id) : []
                    )
                  }
                />
                Chọn tất cả
              </label>
              <div className="text-sm text-slate-500">Đã chọn: {selectedExportPresetIds.length}</div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-3">
                {exportablePresets.length ? (
                  exportablePresets.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 rounded-2xl border border-slate-200 p-3"
                    >
                      <input
                        type="checkbox"
                        checked={selectedExportPresetIds.includes(item.id)}
                        onChange={(e) =>
                          setSelectedExportPresetIds((prev) =>
                            e.target.checked
                              ? [...prev, item.id]
                              : prev.filter((id) => id !== item.id)
                          )
                        }
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800">{item.name}</div>
                        <div className="text-xs text-slate-500">
                          {item.format || "podcast"} · {item.voiceName || "-"} {item.tags && item.tags.length > 0 ? `(${item.tags.join(', ')})` : ''}
                        </div>
                      </div>
                    </label>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">Không có preset để xuất.</div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                onClick={() => setShowExportDialog(false)}
                className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
              >
                Đóng
              </button>
              <button
                type="button"
                disabled={!selectedExportPresetIds.length}
                onClick={() => {
                  const payload = exportablePresets.filter((item) =>
                    selectedExportPresetIds.includes(item.id)
                  );
                  downloadJson("presets_export.json", payload);
                  setShowExportDialog(false);
                }}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                Xuất file
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAutoPauseDialog ? (
        <AutoPauseDialog
          initialRules={autoPauseRules}
          onClose={() => setShowAutoPauseDialog(false)}
          onSave={(rules) => {
            setSpeakerSettings((prev) => ({
              ...prev,
              autoBlockPauseRules: rules,
              autoBlockPause: true
            }));
          }}
        />
      ) : null}

      {showSaveDialog ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="text-lg font-semibold text-slate-800">Lưu preset</div>
            <div className="mt-1 text-sm text-slate-500">Nhập tên preset rồi bấm Save.</div>

            <input
              ref={saveInputRef}
              type="text"
              value={presetNameInput}
              onChange={(e) => setPresetNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePreset();
                if (e.key === "Escape") handleSaveDialogClose();
              }}
              className="mt-4 w-full rounded-xl border px-3 py-2"
              placeholder="Ví dụ: Podcast EN Male"
              autoFocus
            />

            <input
              type="text"
              value={presetTagsInput}
              onChange={(e) => setPresetTagsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePreset();
                if (e.key === "Escape") handleSaveDialogClose();
              }}
              className="mt-2 w-full rounded-xl border px-3 py-2"
              placeholder="Tags (ví dụ: #INTRO, #CTA)"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSaveDialogClose}
                className="rounded-xl bg-slate-200 px-4 py-2 text-slate-800"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSavePreset}
                disabled={!presetNameInput.trim()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-white disabled:opacity-60"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
