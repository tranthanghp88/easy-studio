export type VideoLayoutSettings = {
  subtitle: {
    offsetX: number;
    marginBottom: number;
    fontSize: number;
    outlineWidth: number;
    shadowDepth: number;
    maxLineChars: number;
    colorA: string;
    colorR: string;
    colorBoth: string;
    outlineColor: string;
    backgroundColor: string;
  };
  wavebar: {
    xOffset: number;
    y: number;
    width: number;
    height: number;
    barCount: number;
    barWidth: number;
    gap: number;
    maxTipHeight: number;
    speakingBoost: number;
    smoothingUp: number;
    smoothingDown: number;
    activeSpan: number;
    spreadBias: number;
    reactiveSpread: number;
    glowStrength: number;
    peakMarker: boolean;
    mirrorMode: boolean;
    waveStyle: "calm" | "podcast" | "energetic";
    color: string;
    colorA: string;
    colorR: string;
    colorBoth: string;
  };
};

const STORAGE_KEY = "video-layout-settings-v5";
export const DEFAULT_VIDEO_LAYOUT_SETTINGS: VideoLayoutSettings = {
  subtitle: {
    offsetX: 0, marginBottom: 110, fontSize: 40, outlineWidth: 1.2, shadowDepth: 3.0, maxLineChars: 32,
    colorA: "#37A5B4", colorR: "#BE6E55", colorBoth: "#C8AA5A", outlineColor: "#353535", backgroundColor: "rgba(0,0,0,0.18)"
  },
  wavebar: {
    xOffset: 0, y: 430, width: 720, height: 110, barCount: 56, barWidth: 8, gap: 4, maxTipHeight: 78,
    speakingBoost: 8.2, smoothingUp: 0.64, smoothingDown: 0.18, activeSpan: 5.8, spreadBias: 0.78, reactiveSpread: 1.0,
    glowStrength: 0.75, peakMarker: true, mirrorMode: false, waveStyle: "podcast",
    color: "#FFFFFF", colorA: "#22D3EE", colorR: "#FB7185", colorBoth: "#A78BFA"
  }
};

function clampNumber(value: any, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function mergeSettings(raw: any): VideoLayoutSettings {
  const s = raw || {};
  return {
    subtitle: {
      offsetX: clampNumber(s?.subtitle?.offsetX, DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.offsetX),
      marginBottom: clampNumber(s?.subtitle?.marginBottom, DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.marginBottom),
      fontSize: clampNumber(s?.subtitle?.fontSize, DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.fontSize),
      outlineWidth: clampNumber(s?.subtitle?.outlineWidth, DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.outlineWidth),
      shadowDepth: clampNumber(s?.subtitle?.shadowDepth, DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.shadowDepth),
      maxLineChars: clampNumber(s?.subtitle?.maxLineChars, DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.maxLineChars),
      colorA: String(s?.subtitle?.colorA || DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.colorA),
      colorR: String(s?.subtitle?.colorR || DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.colorR),
      colorBoth: String(s?.subtitle?.colorBoth || DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.colorBoth),
      outlineColor: String(s?.subtitle?.outlineColor || DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.outlineColor),
      backgroundColor: String(s?.subtitle?.backgroundColor || DEFAULT_VIDEO_LAYOUT_SETTINGS.subtitle.backgroundColor)
    },
    wavebar: {
      xOffset: clampNumber(s?.wavebar?.xOffset, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.xOffset),
      y: clampNumber(s?.wavebar?.y, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.y),
      width: clampNumber(s?.wavebar?.width, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.width),
      height: clampNumber(s?.wavebar?.height, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.height),
      barCount: clampNumber(s?.wavebar?.barCount, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.barCount),
      barWidth: clampNumber(s?.wavebar?.barWidth, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.barWidth),
      gap: clampNumber(s?.wavebar?.gap, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.gap),
      maxTipHeight: clampNumber(s?.wavebar?.maxTipHeight, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.maxTipHeight),
      speakingBoost: clampNumber(s?.wavebar?.speakingBoost, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.speakingBoost),
      smoothingUp: clampNumber(s?.wavebar?.smoothingUp, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.smoothingUp),
      smoothingDown: clampNumber(s?.wavebar?.smoothingDown, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.smoothingDown),
      activeSpan: clampNumber(s?.wavebar?.activeSpan, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.activeSpan),
      spreadBias: clampNumber(s?.wavebar?.spreadBias, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.spreadBias),
      reactiveSpread: clampNumber(s?.wavebar?.reactiveSpread, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.reactiveSpread),
      glowStrength: clampNumber(s?.wavebar?.glowStrength, DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.glowStrength),
      peakMarker: typeof s?.wavebar?.peakMarker === "boolean" ? s.wavebar.peakMarker : DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.peakMarker,
      mirrorMode: typeof s?.wavebar?.mirrorMode === "boolean" ? s.wavebar.mirrorMode : DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.mirrorMode,
      waveStyle: (["calm", "podcast", "energetic"].includes(String(s?.wavebar?.waveStyle)) ? String(s.wavebar.waveStyle) : DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.waveStyle) as "calm" | "podcast" | "energetic",
      color: String(s?.wavebar?.color || DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.color),
      colorA: String(s?.wavebar?.colorA || DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.colorA),
      colorR: String(s?.wavebar?.colorR || DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.colorR),
      colorBoth: String(s?.wavebar?.colorBoth || DEFAULT_VIDEO_LAYOUT_SETTINGS.wavebar.colorBoth)
    }
  };
}
export function getSavedVideoLayoutSettings(): VideoLayoutSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIDEO_LAYOUT_SETTINGS;
    return mergeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_VIDEO_LAYOUT_SETTINGS;
  }
}
export function saveVideoLayoutSettings(settings: VideoLayoutSettings) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}
export function resetVideoLayoutSettings(): VideoLayoutSettings {
  saveVideoLayoutSettings(DEFAULT_VIDEO_LAYOUT_SETTINGS);
  return DEFAULT_VIDEO_LAYOUT_SETTINGS;
}
