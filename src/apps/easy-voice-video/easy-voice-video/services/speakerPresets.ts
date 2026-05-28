import type {
  LanguageOption,
  VoiceFormat,
  VoiceProfileOption,
  VoiceTypeOption
} from "../shared/types/voice";
import { BlockPreset } from "../shared/types/timeline";
import type { BlockItem } from "../shared/types/timeline";

export const PRESET_STORAGE_KEY = "english-voice-generator-presets";
const LEGACY_PRESET_STORAGE_KEYS = ["easy-english-voice-generator-presets"];
export const UI_PROFILE_STORAGE_KEY = "english-voice-generator-ui-profile";
const LEGACY_UI_PROFILE_STORAGE_KEYS = ["easy-english-voice-generator-ui-profile"];

export const BLOCK_TAGS = ["#HOOK", "#CTA", "#INTRO", "#OUTRO"]; // Định nghĩa các block tags

export type SpeakerPreset = {
  speed: number;
  pitch: number;
  pause: number;
  style: string;
};

export type SpeakerSettings = {
  A: SpeakerPreset;
  R: SpeakerPreset;
  blockPause: number;
  autoBlockPause?: boolean; // Thêm autoBlockPause
  autoBlockPauseRules?: Array<{
    id: string;
    text: string;
    pause: string;
  }>; // Thêm autoBlockPauseRules
};

// Đổi tên SavedPreset cũ thành LegacySavedPreset
export type LegacySavedPreset = {
  id: string;
  name: string;
  speakerSettings: SpeakerSettings; // Đổi tên settings thành speakerSettings
  voiceType: VoiceTypeOption;
  voiceName: string;
  format: VoiceFormat;
  language: LanguageOption;
  voiceProfile: VoiceProfileOption;
  tags?: string[];
  blocks?: BlockItem[];
};

// Export SavedPreset mới (chính là BlockPreset)
export type SavedPreset = BlockPreset;

export type UiProfile = {
  format: VoiceFormat;
  language: LanguageOption;
  voiceProfile: VoiceProfileOption;
};

export const DEFAULT_SPEAKER_SETTINGS: SpeakerSettings = {
  A: {
    speed: 0.96,
    pitch: 0,
    pause: 0.22,
    style: "Warm, natural, expressive English narration with clear pronunciation, smooth rhythm, and a confident YouTube-friendly tone."
  },
  R: {
    speed: 1,
    pitch: 0.1,
    pause: 0.18,
    style: "Natural conversational English response, friendly, lively, and supportive, with a smooth modern podcast tone."
  },
  blockPause: 1.1
};

export const FORMAT_OPTIONS: Array<{
  value: VoiceFormat;
  label: string;
  note: string;
}> = [
  { value: "podcast", label: "Format Podcast", note: "Format chính: podcast A/R hiện tại" },
  { value: "single", label: "Format Single", note: "Một giọng nam hoặc nữ mặc định" }
];

export const LANGUAGE_OPTIONS: Array<{
  value: LanguageOption;
  label: string;
}> = [
  { value: "en", label: "English" }
];

export const VOICE_PROFILE_OPTIONS: Array<{
  value: VoiceProfileOption;
  label: string;
  note: string;
}> = [
  { value: "default", label: "Default", note: "Balanced and safe" },
  { value: "warm", label: "Warm", note: "Warmer and more natural" },
  { value: "clear", label: "Clear", note: "Clean and easy to hear" },
  { value: "story", label: "Story", note: "Softer and better for storytelling" }
];

export function cloneSpeakerSettings(settings: SpeakerSettings): SpeakerSettings {
  return {
    A: { ...settings.A },
    R: { ...settings.R },
    blockPause: settings.blockPause
  };
}

export function isSameSettings(a: SpeakerSettings, b: SpeakerSettings) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function getDefaultPresetMeta() {
  return {
    voiceType: "podcast" as VoiceTypeOption,
    voiceName: "podcast-default",
    format: "podcast" as VoiceFormat,
    language: "en" as LanguageOption,
    voiceProfile: "default" as VoiceProfileOption
  };
}

export function loadSavedPresets(): BlockPreset[] { // Thay đổi kiểu trả về thành BlockPreset[]
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY) || LEGACY_PRESET_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    console.log("RAW STORAGE PRESETS:", raw);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as LegacySavedPreset[]; // Ép kiểu sang LegacySavedPreset[]
    console.log("PARSED STORAGE PRESETS (before adapt):", parsed);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: LegacySavedPreset) => {
        const fallback = getDefaultPresetMeta();

        const voiceType: VoiceTypeOption =
          item?.voiceType === "podcast" ||
          item?.voiceType === "englishMale" ||
          item?.voiceType === "englishFemale"
            ? item.voiceType
            : fallback.voiceType;

        const format: VoiceFormat = FORMAT_OPTIONS.some((x) => x.value === item?.format)
          ? item.format
          : fallback.format;

        const language: LanguageOption = item?.language === "en" ? "en" : fallback.language;

        const voiceProfile: VoiceProfileOption = VOICE_PROFILE_OPTIONS.some(
          (x) => x.value === item?.voiceProfile
        )
          ? item.voiceProfile
          : fallback.voiceProfile;

        // Chuyển đổi từ LegacySavedPreset sang BlockPreset
        return {
          id: String(item?.id || ""),
          name: String(item?.name || "").trim(),
          speakerSettings: {
            A: {
              speed: Number(item?.speakerSettings?.A?.speed ?? DEFAULT_SPEAKER_SETTINGS.A.speed),
              pitch: Number(item?.speakerSettings?.A?.pitch ?? DEFAULT_SPEAKER_SETTINGS.A.pitch),
              pause: Number(item?.speakerSettings?.A?.pause ?? DEFAULT_SPEAKER_SETTINGS.A.pause),
              style: String(item?.speakerSettings?.A?.style ?? DEFAULT_SPEAKER_SETTINGS.A.style)
            },
            R: {
              speed: Number(item?.speakerSettings?.R?.speed ?? DEFAULT_SPEAKER_SETTINGS.R.speed),
              pitch: Number(item?.speakerSettings?.R?.pitch ?? DEFAULT_SPEAKER_SETTINGS.R.pitch),
              pause: Number(item?.speakerSettings?.R?.pause ?? DEFAULT_SPEAKER_SETTINGS.R.pause),
              style: String(item?.speakerSettings?.R?.style ?? DEFAULT_SPEAKER_SETTINGS.R.style)
            },
            blockPause: Number(
              item?.speakerSettings?.blockPause ?? DEFAULT_SPEAKER_SETTINGS.blockPause
            )
          },
          voiceType,
          voiceName: String(item?.voiceName || "").trim(),
          format,
          language,
          voiceProfile,
          tags: Array.isArray(item.tags) ? item.tags : [],
          blocks: Array.isArray(item?.blocks) ? item.blocks : []
        } as BlockPreset;
      })
      .filter((item: BlockPreset) => item.id && item.name);
  } catch {
    return [];
  }
}

export function savePresetsToStorage(presets: BlockPreset[]) { // Thay đổi kiểu tham số thành BlockPreset[]
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

export function loadUiProfile(): UiProfile {
  try {
    const raw = localStorage.getItem(UI_PROFILE_STORAGE_KEY) || LEGACY_UI_PROFILE_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (!raw) {
      return {
        format: "podcast",
        language: "en",
        voiceProfile: "default"
      };
    }

    const parsed = JSON.parse(raw);

    const format: VoiceFormat = FORMAT_OPTIONS.some((item) => item.value === parsed?.format)
      ? parsed.format
      : "podcast";

    const language: LanguageOption = "en";

    const voiceProfile: VoiceProfileOption = VOICE_PROFILE_OPTIONS.some(
      (item) => item.value === parsed?.voiceProfile
    )
      ? parsed.voiceProfile
      : "default";

    return { format, language, voiceProfile };
  } catch {
    return {
      format: "podcast",
      language: "en",
      voiceProfile: "default"
    };
  }
}

export function saveUiProfile(profile: UiProfile) {
  localStorage.setItem(UI_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function getTextPlaceholder(format: VoiceFormat, language: LanguageOption) {
  void language;

  if (format === "single") {
    return "A: Hello everyone. In this lesson, we will practice useful English expressions.";
  }

  return "A: Hello everyone, welcome to our show.\nR: Today we will discuss a useful topic.";
}

export function applyUiProfileToSpeakerSettings(
  current: SpeakerSettings,
  profile: UiProfile
): SpeakerSettings {
  const next = cloneSpeakerSettings(current);

  if (profile.voiceProfile === "warm") {
    next.A.style =
      "Warm, natural, expressive English voice with a smooth and confident rhythm.";
    next.R.style =
      "Warm response voice, natural, supportive, and positive.";
    next.A.speed = 0.84;
    next.R.speed = 0.9;
  } else if (profile.voiceProfile === "clear") {
    next.A.style =
      "Clear pronunciation, clean and structured delivery, good for teaching and listening practice.";
    next.R.style =
      "Clear response voice, concise, bright, and professional.";
    next.A.speed = 0.8;
    next.R.speed = 0.86;
  } else if (profile.voiceProfile === "story") {
    next.A.style =
      "Natural storytelling voice, soft, slightly emotional, and engaging.";
    next.R.style =
      "Soft response voice, natural, with a smooth rhythm.";
    next.A.speed = 0.83;
    next.R.speed = 0.88;
  } else {
    next.A.style =
      "Warm, natural, expressive English narration with clear pronunciation and smooth rhythm.";
    next.R.style =
      "Natural conversational English response, friendly, lively, and supportive.";
    next.A.speed = 0.82;
    next.R.speed = 0.9;
  }

  if (profile.format === "single") {
    next.R.pause = 0.15;
    next.blockPause = 1.1;

  } else {
    next.A.pause = 0.4;
    next.R.pause = 0.3;
    next.blockPause = 1.5;
  }

  return next;
}

/**
 * Tự động phát hiện BlockPreset dựa trên block tag trong văn bản.
 */
export function normalizeBlockPresetTag(value: string): string {
  const cleaned = String(value || "")
    .replace(/#/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .toUpperCase()
    .trim();
  return cleaned ? `#${cleaned}` : "";
}

export function extractBlockTagsFromScript(text: string): string[] {
  const tags = new Set<string>();
  String(text || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.trim().match(/^#([A-Za-z0-9_-]+)\b/);
      const tag = match ? normalizeBlockPresetTag(match[1]) : "";
      if (tag) tags.add(tag);
    });
  return Array.from(tags);
}

export function autoDetectPresetByBlockTag(text: string, presets: BlockPreset[]): BlockPreset | undefined {
  const detectedTags = extractBlockTagsFromScript(text);
  if (!detectedTags.length) return undefined;

  return presets.find((preset) => {
    const presetTags = (preset.tags || []).map(normalizeBlockPresetTag).filter(Boolean);
    return detectedTags.some((tag) => presetTags.includes(tag));
  });
}
