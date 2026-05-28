
import type {
  LaughRoleFilter,
  LaughAssetMode,
  LaughAssetType,
  LaughAssetItem
} from "../shared/types/timeline";

const MODE_KEY = "voice-laugh-asset-mode";

export function getSavedLaughAssetMode(): LaughAssetMode {
  try {
    const v = String(window.localStorage.getItem(MODE_KEY) || "auto").trim().toLowerCase();
    return v === "off" || v === "force" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function saveLaughAssetMode(mode: LaughAssetMode) {
  try { window.localStorage.setItem(MODE_KEY, mode); } catch {}
}

export function normalizeLaughAsset(raw: any): LaughAssetItem {
  return {
    id: String(raw?.id || '').trim(),
    role: raw?.role === 'A' || raw?.role === 'R' || raw?.role === 'BOTH' ? raw.role : 'BOTH',
    type: raw?.type === 'short' || raw?.type === 'giggle' || raw?.type === 'long' ? raw.type : 'misc',
    label: String(raw?.label || raw?.fileName || '').trim(), // Thêm label
    fileName: String(raw?.fileName || '').trim(),
    filePath: String(raw?.filePath || '').trim(),
  };
}
