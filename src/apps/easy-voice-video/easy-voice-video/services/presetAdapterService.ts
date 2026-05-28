import type { SavedPreset } from "./speakerPresets";
import type { BlockPreset } from "../shared/types/timeline";

/**
 * Chuyển đổi SavedPreset hiện có sang định dạng BlockPreset mới.
 * Điều này đóng vai trò như một compatibility adapter trong Phase 0.
 */
export function adaptSavedPresetToBlockPreset(savedPreset: SavedPreset): BlockPreset {
  return {
    id: savedPreset.id,
    name: savedPreset.name,
    speakerSettings: savedPreset.speakerSettings,
    voiceType: savedPreset.voiceType,
    voiceName: savedPreset.voiceName,
    format: savedPreset.format,
    language: savedPreset.language,
    voiceProfile: savedPreset.voiceProfile,
  };
}
