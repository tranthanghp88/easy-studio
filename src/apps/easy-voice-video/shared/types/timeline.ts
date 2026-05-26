import type { ScriptLine } from "./script";
import type {
  LanguageOption,
  VoiceFormat,
  VoiceProfileOption,
  VoiceTypeOption
} from "./voice";

// ----------------------------------------------------------------------------------------------------
// Types từ services/mediaComposition.ts
// ----------------------------------------------------------------------------------------------------

export type ImportBgmAssetInput = {
  path: string;
  label?: string;
  category?: string;
  defaultVolume?: number;
  tags?: string[];
};

export type BgmAsset = {
  id: string;
  label: string;
  fileName: string;
  filePath: string;
  category?: string;
  defaultVolume?: number;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type DialogueSegment = {
  type: "dialogue";
  blockId?: string | number;
  role: "A" | "R" | "BOTH";
  text: string;
  sourceStart: number;
  sourceEnd: number;
  start: number;
  end: number;
  subtitle: string;
};

export type PauseSegment = {
  type: "pause";
  blockId?: string | number;
  duration: number;
  start: number;
  end: number;
};

export type ReactionSegment = {
  type: "reaction";
  blockId?: string | number;
  assetId: string; // ID của LaughAssetItem
  filePath: string; // Đường dẫn file audio của laugh asset
  start: number;    // Thời điểm bắt đầu chính xác của reaction
  duration: number; // Thời lượng của reaction
  end?: number;     // NEW: Thời điểm kết thúc của reaction
  volume?: number;  // Volume của reaction (tùy chọn)
};

export type CompositionSegment = DialogueSegment | PauseSegment | ReactionSegment;

export type MusicBed = {
  bgmId: string;
  filePath: string;
  start: number;
  duration?: number;
  volume: number;
  loop: boolean;
  duckVolume?: number;
  fadeOut?: number;
};

export type SubtitleCue = {
  start: number;
  end: number;
  text: string;
  role?: "A" | "R" | "BOTH";
  pauseAfterSeconds?: number;
};

// DialogueTimelineItem tương đương với TimelineBlock mới của chúng ta
export type BgmMarker = {
  id: string;
  duration?: number;
  volume?: number;
  mode?: string;
};

export type TimelineBlock = {
  blockId?: string | number; // Có thể thay đổi thành string trong tương lai
  role?: "A" | "R" | "BOTH";
  text?: string;
  start: number; // Original start time of the dialogue content
  end: number;   // Original end time of the dialogue content
  resolvedStart: number; // Final, absolute start time after all cumulative offsets
  resolvedEnd: number;   // Final, absolute end time of the dialogue content within the block
  resolvedDuration?: number; // resolvedEnd - resolvedStart
  effectiveDuration?: number; // resolvedDuration + any internal timing like laughAssets

  type?: "dialogue" | "pause" | "bgm_only" | "reaction"; // NEW
  subtitle?: string; // NEW
  resolvedSpeechEnd?: number; // NEW
  duration?: number; // NEW

  // New fields for actual dialogue content timing (used specifically for subtitles)
  dialogueContentStart?: number; // Actual start of audible dialogue within the block
  dialogueContentEnd?: number;   // Actual end of audible dialogue within the block

  pauseAfterSeconds?: number;
  laughAssets?: TimelineLaughAsset[]; // THÊM THUỘC TÍNH LAUGH ASSETS VÀO ĐÂY
  bgmMarkers?: BgmMarker[]; // THÊM THUỘC TÍNH BGM MARKERS VÀO ĐÂY
};

export type TimelineLaughAsset = {
  asset: LaughAssetItem;
  offsetSeconds: number; // Thời gian tính từ đầu block
  // Các thuộc tính khác như volume, fade... có thể thêm sau
};

export type BlockItem = {
  id: string; // ID duy nhất cho block
  text: string;
  role: "A" | "R";
  pauseAfterSeconds?: number;
  voice?: {
    voiceName: string;
    voiceType: VoiceTypeOption;
  };
  metadata?: string; // Dành cho các thông tin bổ sung nếu cần
};

export type CompositionPlan = {
  segments: CompositionSegment[];
  musicBeds: MusicBed[];
  subtitles: SubtitleCue[];
  estimatedDuration: number;
};

// ----------------------------------------------------------------------------------------------------
// Các types mới cho định nghĩa API và cấu trúc chung
// ----------------------------------------------------------------------------------------------------

// BlockPreset sẽ được định nghĩa lại hoặc mở rộng dựa trên SavedPreset trong Phase 1
export type BlockPreset = {
  id: string;
  name: string;
  speakerSettings: {
    A: {
      speed: number;
      pitch: number;
      pause: number;
      style: string;
    };
    R: {
      speed: number;
      pitch: number;
      pause: number;
      style: string;
    };
    blockPause: number;
    autoBlockPause?: boolean; // Thêm autoBlockPause
    autoBlockPauseRules?: Array<{
      id: string;
      text: string;
      pause: string;
    }>; // Thêm autoBlockPauseRules
  };
  voiceType: VoiceTypeOption;
  voiceName: string;
  format: VoiceFormat;
  language: LanguageOption;
  voiceProfile: VoiceProfileOption;
  tags?: string[]; // Thêm thuộc tính tags
  blocks?: BlockItem[]; // THÊM THUỘC TÍNH BLOCKS VÀO ĐÂY
};

export type TimelineMarker = {
  type: 'bgm' | 'pause' | 'custom';
  start: number;
  duration?: number;
  id?: string;
};

// Types liên quan đến LaughAsset
export type LaughRoleFilter = "ALL" | "A" | "R" | "BOTH";
export type LaughAssetMode = "off" | "auto" | "force";
export type LaughAssetType = "short" | "giggle" | "long" | "misc";

export type LaughAssetItem = {
  id: string;
  role: "A" | "R" | "BOTH";
  type: LaughAssetType;
  label: string; // Thêm label
  fileName: string;
  filePath: string;
  duration?: number; // Thêm thuộc tính duration
};

export type TimelineMode = "generated" | "existing"; // Thêm TimelineMode

// Params cho API buildCompositionPlan mới
export type BuildCompositionPlanParams = {
  script: ScriptLine[];
  sourceDuration: number;
  bgmAssets: BgmAsset[];
  actualTimeline?: TimelineBlock[];
};
