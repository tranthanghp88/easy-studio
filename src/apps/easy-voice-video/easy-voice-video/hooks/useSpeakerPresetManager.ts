import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type {
  LanguageOption,
  VoiceFormat,
  VoiceProfileOption,
  VoiceTypeOption
} from "../shared/types/voice";
import {
  DEFAULT_SPEAKER_SETTINGS,
  applyUiProfileToSpeakerSettings,
  cloneSpeakerSettings,
  getDefaultPresetMeta,
  isSameSettings,
  loadSavedPresets,
  loadUiProfile,
  savePresetsToStorage,
  saveUiProfile,
  type SavedPreset,
  type SpeakerSettings,
  BLOCK_TAGS
} from "../services/speakerPresets";
import type { BlockPreset, BlockItem } from "../shared/types/timeline"; // Import BlockPreset và BlockItem trực tiếp
import type { ScriptLine } from "../shared/types/script"; // NEW IMPORT

const USE_VOICE_DEFAULT_PRESET_KEY = "easy-english-voice-generator-use-voice-default-preset";

type UseSpeakerPresetManagerParams = {
  setVoiceType?: (value: VoiceTypeOption) => void;
  setVoiceName?: (value: string) => void;
};

// ManagedSavedPreset giờ đây mở rộng BlockPreset
export type ManagedSavedPreset = BlockPreset & {
  importedFromVoice?: boolean;
  hiddenInMainDropdown?: boolean;
};

function normalizeManagedPreset(raw: any): ManagedSavedPreset | null {
  const id = String(raw?.id || "").trim();
  const name = String(raw?.name || "").trim();
  if (!id || !name) return null;

  // Đảm bảo các thuộc tính của BlockPreset được chuẩn hóa
  const speakerSettings = cloneSpeakerSettings(raw?.speakerSettings || DEFAULT_SPEAKER_SETTINGS);
  const voiceType = raw?.voiceType || getDefaultPresetMeta().voiceType;
  const voiceName = String(raw?.voiceName || "").trim();
  const format = raw?.format || getDefaultPresetMeta().format;
  const language = raw?.language || getDefaultPresetMeta().language;
  const voiceProfile = raw?.voiceProfile || getDefaultPresetMeta().voiceProfile;
  const tags = Array.isArray(raw?.tags) ? raw.tags.map(String).filter(Boolean) : [];

  return {
    id,
    name,
    speakerSettings,
    voiceType,
    voiceName,
    format,
    language,
    voiceProfile,
    tags,
    blocks: Array.isArray(raw?.blocks) ? raw.blocks : [],
    importedFromVoice: !!raw?.importedFromVoice,
    hiddenInMainDropdown: !!raw?.hiddenInMainDropdown
  };
}

// Hàm chuyển đổi ScriptLine sang BlockItem
function scriptLineToBlockItem(scriptLine: ScriptLine): BlockItem {
  return {
    id: `block_${scriptLine.blockId || Date.now()}_${Math.random().toString(36).slice(2, 8)}`, // Tạo ID duy nhất
    text: scriptLine.text,
    role: scriptLine.role === "BOTH" ? "A" : scriptLine.role, // BlockItem role là "A" | "R"
    pauseAfterSeconds: scriptLine.pauseSeconds,
    // voice và metadata không có trong ScriptLine, có thể thêm mặc định hoặc để undefined
  };
}

function normalizePresetList(list: any[]): ManagedSavedPreset[] {
  return (Array.isArray(list) ? list : [])
    .map(normalizeManagedPreset)
    .filter(Boolean) as ManagedSavedPreset[];
}

export function useSpeakerPresetManager({
  setVoiceType: syncVoiceType,
  setVoiceName: syncVoiceName
}: UseSpeakerPresetManagerParams = {}) {
  const [showPresetPanel, setShowPresetPanel] = useState(true);

  const [format, setFormatState] = useState<VoiceFormat>("podcast");
  const [language, setLanguageState] = useState<LanguageOption>("en");
  const [voiceProfile, setVoiceProfileState] = useState<VoiceProfileOption>("default");
  const [uiProfileDirty, setUiProfileDirty] = useState(false);

  const [speakerSettings, setSpeakerSettings] = useState<SpeakerSettings>(
    cloneSpeakerSettings(DEFAULT_SPEAKER_SETTINGS)
  );
  const [savedPresets, setSavedPresets] = useState<ManagedSavedPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetMessage, setPresetMessage] = useState("");

  const [voiceType, setVoiceTypeState] = useState<VoiceTypeOption>("podcast");
  const [voiceName, setVoiceNameState] = useState("");
  const [useVoiceDefaultPreset, setUseVoiceDefaultPreset] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = window.localStorage.getItem(USE_VOICE_DEFAULT_PRESET_KEY);
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const initializedRef = useRef(false);

  const setVoiceType = (value: VoiceTypeOption) => {
    setVoiceTypeState((prev: VoiceTypeOption) => (prev === value ? prev : value));
    syncVoiceType?.(value);
  };

  const setVoiceName = (value: string) => {
    setVoiceNameState((prev: string) => (prev === value ? prev : value));
    syncVoiceName?.(value);
  };

  const applyPresetToState = (preset: ManagedSavedPreset) => {
    setSelectedPresetId((prev: string) => (prev === preset.id ? prev : preset.id));
    setSpeakerSettings((prev: SpeakerSettings) =>
      isSameSettings(prev, preset.speakerSettings) ? prev : cloneSpeakerSettings(preset.speakerSettings)
    );

    if (preset.format) {
      setFormatState((prev: VoiceFormat) => (prev === preset.format ? prev : preset.format));
    }
    if (preset.language) {
      setLanguageState((prev: LanguageOption) => (prev === preset.language ? prev : preset.language));
    }
    if (preset.voiceProfile) {
      setVoiceProfileState((prev: VoiceProfileOption) => (prev === preset.voiceProfile ? prev : preset.voiceProfile));
    }
    if (preset.voiceType) {
      setVoiceType(preset.voiceType);
    }
    if (preset.voiceName) {
      setVoiceName(preset.voiceName);
    }
  };

  const applyDefaultMetaToState = () => {
    const fallback = getDefaultPresetMeta();

    setSelectedPresetId("");
    setSpeakerSettings((prev: SpeakerSettings) =>
      isSameSettings(prev, DEFAULT_SPEAKER_SETTINGS)
        ? prev
        : cloneSpeakerSettings(DEFAULT_SPEAKER_SETTINGS)
    );
    setFormatState((prev: VoiceFormat) => (prev === fallback.format ? prev : fallback.format));
    setLanguageState((prev: LanguageOption) => (prev === fallback.language ? prev : fallback.language));
    setVoiceProfileState((prev: VoiceProfileOption) => (prev === fallback.voiceProfile ? prev : fallback.voiceProfile));
    setVoiceType(fallback.voiceType);
    setVoiceName(fallback.voiceName);
  };

  const selectedPreset = useMemo(
    () => savedPresets.find((item) => item.id === selectedPresetId) || null,
    [savedPresets, selectedPresetId]
  );

  const visibleMainDropdownPresets = useMemo(
    () =>
      savedPresets.filter(
        (item) => !item.importedFromVoice && !item.hiddenInMainDropdown && item.format === format
      ),
    [savedPresets, format]
  );

  useEffect(() => {
    if (!selectedPresetId) return;

    const stillVisible = visibleMainDropdownPresets.some((item) => item.id === selectedPresetId);
    if (!stillVisible) {
      setSelectedPresetId("");
    }
  }, [visibleMainDropdownPresets, selectedPresetId]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const presets = normalizePresetList(loadSavedPresets() as any[]);
    console.log("UI PRESETS (after loadSavedPresets and normalizePresetList):", presets);
    setSavedPresets(presets);

    const profile = loadUiProfile();

    if (presets.length) {
      const firstVisible =
        presets.find(
          (item) => !item.importedFromVoice && !item.hiddenInMainDropdown && item.format === profile.format
        ) ||
        presets.find((item) => !item.importedFromVoice && !item.hiddenInMainDropdown) ||
        null;

      if (firstVisible) {
        applyPresetToState(firstVisible);
      } else {
        const fallback = getDefaultPresetMeta();
        setFormatState(profile.format);
        setLanguageState(profile.language);
        setVoiceProfileState(profile.voiceProfile);
        setVoiceType(fallback.voiceType);
        setVoiceName(fallback.voiceName);
      }
    } else {
      const fallback = getDefaultPresetMeta();
      setFormatState(profile.format);
      setLanguageState(profile.language);
      setVoiceProfileState(profile.voiceProfile);
      setVoiceType(fallback.voiceType);
      setVoiceName(fallback.voiceName);
    }
  }, []);

  useEffect(() => {
    if (!presetMessage) return;
    const t = window.setTimeout(() => setPresetMessage(""), 2500);
    return () => window.clearTimeout(t);
  }, [presetMessage]);


  useEffect(() => {
    saveUiProfile({ format, language, voiceProfile });
  }, [format, language, voiceProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        USE_VOICE_DEFAULT_PRESET_KEY,
        JSON.stringify(!!useVoiceDefaultPreset)
      );
    } catch {}
  }, [useVoiceDefaultPreset]);

  const setFormat = (value: VoiceFormat) => {
    setFormatState((prev: VoiceFormat) => (prev === value ? prev : value));
    setUiProfileDirty(true);
  };

  const setLanguage = (value: LanguageOption) => {
    setLanguageState((prev: LanguageOption) => (prev === value ? prev : value));
    setUiProfileDirty(true);
  };

  const setVoiceProfile = (value: VoiceProfileOption) => {
    setVoiceProfileState((prev: VoiceProfileOption) => (prev === value ? prev : value));
    setUiProfileDirty(true);
  };

  const buildPresetPayload = (
    id: string,
    name: string,
    nextVoiceType: VoiceTypeOption,
    nextVoiceName: string,
    tags: string[] = [], // Thêm tags vào payload
    currentScriptBlocks: ScriptLine[] = [] // NEW PARAMETER
  ): ManagedSavedPreset => ({
    id,
    name,
    speakerSettings: cloneSpeakerSettings(speakerSettings),
    voiceType: nextVoiceType,
    voiceName: nextVoiceName,
    format,
    language,
    voiceProfile,
    tags,
    blocks: currentScriptBlocks.map(scriptLineToBlockItem), // USE currentScriptBlocks
    importedFromVoice: false,
    hiddenInMainDropdown: false
  });

  const getPresetModified = (
    nextVoiceType: VoiceTypeOption = voiceType,
    nextVoiceName: string = voiceName,
    nextTags: string[] = [] // Thêm nextTags để kiểm tra sự thay đổi
  ) => {
    if (!selectedPreset) return false;

    // So sánh tags
    const currentTags = selectedPreset.tags || [];
    const tagsModified = currentTags.length !== nextTags.length || !currentTags.every(tag => nextTags.includes(tag));

    return !(
      isSameSettings(selectedPreset.speakerSettings, speakerSettings) &&
      selectedPreset.voiceType === nextVoiceType &&
      selectedPreset.voiceName === nextVoiceName &&
      selectedPreset.format === format &&
      selectedPreset.language === language &&
      selectedPreset.voiceProfile === voiceProfile &&
      !tagsModified
    );
  };

  const handleSavePreset = (
    name: string,
    nextVoiceType: VoiceTypeOption = voiceType,
    nextVoiceName: string = voiceName,
    nextTags: string[] = [], // Thêm nextTags để lưu
    currentScriptBlocks: ScriptLine[] = [] // NEW PARAMETER
  ) => {
    const existing = savedPresets.find((item) => item.name.toLowerCase() === name.toLowerCase());

    let nextPresets: ManagedSavedPreset[] = [];

    if (existing) {
      nextPresets = savedPresets.map((item) =>
        item.id === existing.id
          ? {
              ...buildPresetPayload(existing.id, name, nextVoiceType, nextVoiceName, nextTags, currentScriptBlocks),
              importedFromVoice: false,
              hiddenInMainDropdown: false
            }
          : item
      );
      setSelectedPresetId(existing.id);
      setPresetMessage(`Đã cập nhật preset "${name}"`);
    } else {
      const newPreset = buildPresetPayload(
        `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        nextVoiceType,
        nextVoiceName,
        nextTags,
        currentScriptBlocks
      );
      nextPresets = [newPreset, ...savedPresets];
      setSelectedPresetId(newPreset.id);
      setPresetMessage(`Đã lưu preset "${name}"`);
    }

    setSavedPresets((prev: ManagedSavedPreset[]) => nextPresets);
    savePresetsToStorage(nextPresets);
  };

  const handleImportPresets = (
    incomingPresets: SavedPreset[],
    options?: {
      importedFromVoice?: boolean;
      hiddenInMainDropdown?: boolean;
    }
  ) => {
    if (!incomingPresets.length) {
      setPresetMessage("Không có preset mới để import.");
      return;
    }

    const existingIds = new Set(savedPresets.map((item) => item.id));
    const existingNames = new Set(savedPresets.map((item) => item.name.toLowerCase()));

    const dedupedIncoming: ManagedSavedPreset[] = [];
    const seenIncomingIds = new Set<string>();
    const seenIncomingNames = new Set<string>();

    for (const rawPreset of incomingPresets) {
      const preset = normalizeManagedPreset(rawPreset);
      if (!preset) continue;

      const id = preset.id;
      const name = preset.name;
      const lowerName = preset.name.toLowerCase(); // Sử dụng preset.name thay vì name

      if (existingIds.has(id)) continue;
      if (existingNames.has(lowerName)) continue;
      if (seenIncomingIds.has(id)) continue;
      if (seenIncomingNames.has(lowerName)) continue;

      dedupedIncoming.push({
        ...preset,
        importedFromVoice: !!options?.importedFromVoice,
        hiddenInMainDropdown: !!options?.hiddenInMainDropdown,
        tags: Array.isArray(preset.tags) ? preset.tags : [] // Đảm bảo tags được giữ nguyên
      });

      seenIncomingIds.add(id);
      seenIncomingNames.add(lowerName);
    }

    if (!dedupedIncoming.length) {
      setPresetMessage("Preset trong file đã tồn tại hết.");
      return;
    }

    const nextPresets = [...dedupedIncoming, ...savedPresets];
    setSavedPresets((prev: ManagedSavedPreset[]) => nextPresets);
    savePresetsToStorage(nextPresets);

    const firstVisibleImported =
      dedupedIncoming.find((item) => !item.importedFromVoice && !item.hiddenInMainDropdown) ||
      dedupedIncoming[0];

    applyPresetToState(firstVisibleImported);
    setUiProfileDirty(false);
    setPresetMessage(`Đã import ${dedupedIncoming.length} preset.`);
  };

  const handleLoadPreset = (presetId: string) => {
    const preset = savedPresets.find((item) => item.id === presetId);
    if (!preset) return;

    applyPresetToState(preset);
    setUiProfileDirty(false);
    setPresetMessage(`Đã nạp preset "${preset.name}"`);
  };

  const applyPresetAfterDelete = (nextPresets: ManagedSavedPreset[]) => {
    const next =
      nextPresets.find(
        (item) => !item.importedFromVoice && !item.hiddenInMainDropdown && item.format === format
      ) ||
      nextPresets.find((item) => !item.importedFromVoice && !item.hiddenInMainDropdown) ||
      null;

    if (next) {
      applyPresetToState(next);
    } else {
      applyDefaultMetaToState();
    }
  };

  const handleDeleteSelectedPresets = (presetIds: string[]) => {
    const normalizedIds = Array.from(
      new Set((Array.isArray(presetIds) ? presetIds : []).map((item) => String(item || "").trim()))
    ).filter(Boolean);

    if (!normalizedIds.length) return;

    const deletedPresets = savedPresets.filter((item) => normalizedIds.includes(item.id));
    if (!deletedPresets.length) return;

    const nextPresets = savedPresets.filter((item) => !normalizedIds.includes(item.id));

    setSavedPresets((prev: ManagedSavedPreset[]) => nextPresets);
    savePresetsToStorage(nextPresets);
    applyPresetAfterDelete(nextPresets);
    setUiProfileDirty(false);

    if (deletedPresets.length === 1) {
      setPresetMessage(`Đã xóa preset "${deletedPresets[0].name}"`);
      return;
    }

    setPresetMessage(`Đã xóa ${deletedPresets.length} preset`);
  };

  const handleDeletePreset = () => {
    if (!selectedPreset) return;

    const ok = window.confirm(`Xóa preset "${selectedPreset.name}"?`);
    if (!ok) return;

    handleDeleteSelectedPresets([selectedPreset.id]);
  };

  const handleApplyUiProfile = () => {
    const next = applyUiProfileToSpeakerSettings(speakerSettings, {
      format,
      language,
      voiceProfile
    });
    setSpeakerSettings((prev) => (isSameSettings(prev, next) ? prev : next));
    setUiProfileDirty(false);
    setPresetMessage("Đã áp dụng Voice UI vào Speaker Preset");
  };

  return {
    showPresetPanel,
    setShowPresetPanel,

    format,
    setFormat,
    language,
    setLanguage,
    voiceProfile,
    setVoiceProfile,
    uiProfileDirty,
    setUiProfileDirty,

    speakerSettings,
    setSpeakerSettings,

    voiceType,
    setVoiceType,
    voiceName,
    setVoiceName,
    useVoiceDefaultPreset,
    setUseVoiceDefaultPreset,

    savedPresets,
    visibleMainDropdownPresets,
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

    defaultSpeakerSettings: cloneSpeakerSettings(DEFAULT_SPEAKER_SETTINGS)
  };
}
