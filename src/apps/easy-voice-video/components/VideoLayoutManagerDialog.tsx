import React, { useEffect, useRef, useState } from "react";
import type { VideoLayoutSettings } from "../services/videoLayoutStorage";

type Props = {
  open: boolean;
  onClose: () => void;
  value: VideoLayoutSettings;
  onChange: (value: VideoLayoutSettings) => void;
  onReset: () => void;
  previewBackgroundPath?: string;
};

type DragTarget = "subtitle" | "wavebar" | null;

const VIDEO_W = 1280;
const VIDEO_H = 720;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function updateNumber(
  value: VideoLayoutSettings,
  section: "subtitle" | "wavebar",
  key: string,
  next: number
): VideoLayoutSettings {
  return { ...value, [section]: { ...value[section], [key]: next } } as VideoLayoutSettings;
}

function updateText(
  value: VideoLayoutSettings,
  section: "subtitle" | "wavebar",
  key: string,
  next: string
): VideoLayoutSettings {
  return { ...value, [section]: { ...value[section], [key]: next } } as VideoLayoutSettings;
}

function SliderRow({ label, value, min, max, step = 1, onChange }: any) {
  return (
    <label className="vlm-slider-row">
      <div className="vlm-slider-head">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function ColorRow({ label, value, onChange }: any) {
  return (
    <label className="vlm-color-row">
      <span>{label}</span>
      <input type="color" value={String(value || "#ffffff").slice(0, 7)} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function updateBool(
  value: VideoLayoutSettings,
  section: "subtitle" | "wavebar",
  key: string,
  next: boolean
): VideoLayoutSettings {
  return { ...value, [section]: { ...value[section], [key]: next } } as VideoLayoutSettings;
}

function SelectRow({ label, value, options, onChange }: any) {
  return (
    <label className="vlm-text-row">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((item: any) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  );
}

function CheckRow({ label, checked, onChange }: any) {
  return (
    <label className="vlm-check-row">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function applySmartSubtitleColors(value: VideoLayoutSettings): VideoLayoutSettings {
  // Smart default palette for YouTube/podcast thumbnails: readable on most bright/dark backgrounds.
  return {
    ...value,
    subtitle: {
      ...value.subtitle,
      colorA: "#22D3EE",
      colorR: "#FB7185",
      colorBoth: "#FACC15",
      outlineColor: "#0F172A",
      backgroundColor: "rgba(0,0,0,0.34)",
      karaokeMode: "speakerToWhite" as any,
      outlineWidth: Math.max(1.4, Number(value.subtitle.outlineWidth || 1.2)),
      shadowDepth: Math.max(3.2, Number(value.subtitle.shadowDepth || 3))
    },
    wavebar: {
      ...value.wavebar,
      color: "#FFFFFF",
      colorA: "#22D3EE",
      colorR: "#FB7185",
      colorBoth: "#A78BFA",
      glowStrength: Math.max(0.75, Number((value.wavebar as any).glowStrength || 0.6)),
      waveStyle: "podcast" as any
    }
  };
}

function Preview({
  value,
  previewBackgroundPath,
  onChange
}: {
  value: VideoLayoutSettings;
  previewBackgroundPath?: string;
  onChange: (value: VideoLayoutSettings) => void;
}) {
  const sub = value.subtitle;
  const wave = value.wavebar;
  const [previewUrl, setPreviewUrl] = useState("");
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 720, height: 405 });
  const [showSubA, setShowSubA] = useState(true);
  const [showSubR, setShowSubR] = useState(false);
  const [showSubBoth, setShowSubBoth] = useState(false);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);

  useEffect(() => {
    let mounted = true;
    const filePath = String(previewBackgroundPath || "").trim();
    if (!filePath || !window.electronAPI?.readFileAsBase64) {
      setPreviewUrl("");
      return;
    }
    window.electronAPI
      .readFileAsBase64({ filePath })
      .then((result: string) => {
        if (!mounted) return;
        setPreviewUrl(result);
      })
      .catch(() => {
        if (mounted) setPreviewUrl("");
      });
    return () => {
      mounted = false;
    };
  }, [previewBackgroundPath]);

  useEffect(() => {
    const updateSize = () => {
      const node = frameRef.current;
      if (!node) return;
      const width = Math.max(320, Math.round(node.clientWidth || 720));
      const height = Math.round((width * VIDEO_H) / VIDEO_W);
      setFrameSize({ width, height });
    };
    updateSize();
    const node = frameRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const ro = new ResizeObserver(updateSize);
    ro.observe(node);
    window.addEventListener("resize", updateSize);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, []);

  useEffect(() => {
    if (!dragTarget) return;
    const onMove = (event: PointerEvent) => {
      const node = frameRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const x = clamp(((event.clientX - rect.left) / rect.width) * VIDEO_W, 0, VIDEO_W);
      const y = clamp(((event.clientY - rect.top) / rect.height) * VIDEO_H, 0, VIDEO_H);

      if (dragTarget === "subtitle") {
        const nextOffsetX = Math.round(clamp(x - VIDEO_W / 2, -520, 520));
        const nextMarginBottom = Math.round(clamp(VIDEO_H - y, 20, 680));
        onChange({
          ...value,
          subtitle: {
            ...value.subtitle,
            offsetX: nextOffsetX,
            marginBottom: nextMarginBottom
          }
        });
      }

      if (dragTarget === "wavebar") {
        const maxWaveY = Math.max(0, VIDEO_H - (Number(wave.height || 48) + Number(wave.maxTipHeight || 42)) - 12);
        const nextOffsetX = Math.round(clamp(x - VIDEO_W / 2, -560, 560));
        const nextY = Math.round(clamp(y - Number(wave.height || 48) / 2, 0, maxWaveY));
        onChange({
          ...value,
          wavebar: {
            ...value.wavebar,
            xOffset: nextOffsetX,
            y: nextY
          }
        });
      }
    };
    const onUp = () => setDragTarget(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragTarget, onChange, value, wave.height, wave.maxTipHeight]);

  const scaleX = frameSize.width / VIDEO_W;
  const scaleY = frameSize.height / VIDEO_H;
  const renderWidth = Math.max(1, wave.width * scaleX);
  const renderHeight = Math.max(1, Number(wave.height || 58) * scaleY);
  const renderLeft = ((VIDEO_W - wave.width) / 2 + wave.xOffset) * scaleX;
  const renderTop = wave.y * scaleY;
  const subtitleBottom = Math.max(0, sub.marginBottom * scaleY);

  const bars = Array.from({ length: Math.min(72, Math.max(12, wave.barCount)) }, (_, i) => {
    const center = Math.abs(i - Math.floor(wave.barCount / 2));
    const peak = 1 - Math.min(1, center / Math.max(1, wave.barCount / 2));
    const random = [0.62, 0.94, 0.58, 1.0, 0.76, 0.91, 0.67, 0.84][i % 8];
    const spreadMotion = 0.74 + Math.sin(i * 0.62) * 0.12 + Math.cos(i * 1.13) * 0.10;
    return Math.max(5 * scaleY, (wave.height * 0.16 + peak * wave.maxTipHeight * random * spreadMotion * 0.74) * scaleY);
  });

  return (
    <div className="vlm-preview-card">
      <div className="vlm-preview-title-row">
        <div>
          <div className="vlm-preview-title">Live Preview</div>
          
        </div>
        <div className="vlm-drag-chip">{dragTarget ? "Đang kéo..." : "Drag & Drop"}</div>
      </div>

      <div className="vlm-preview-toggle-row vlm-preview-toggle-row-horizontal">
        <label className="vlm-sub-toggle"><input type="checkbox" checked={showSubA} onChange={(e) => setShowSubA(e.target.checked)} /><span>Sub A</span></label>
        <label className="vlm-sub-toggle"><input type="checkbox" checked={showSubR} onChange={(e) => setShowSubR(e.target.checked)} /><span>Sub R</span></label>
        <label className="vlm-sub-toggle"><input type="checkbox" checked={showSubBoth} onChange={(e) => setShowSubBoth(e.target.checked)} /><span>BOTH</span></label>
      </div>

      <div ref={frameRef} className="vlm-frame">
        {previewUrl ? <img key={previewUrl} src={previewUrl} alt="Preview background" /> : <div className="vlm-fake-bg" />}

        <div
          className={`vlm-wavebar ${dragTarget === "wavebar" ? "is-dragging" : ""}`}
          style={{ left: renderLeft, top: renderTop, width: renderWidth, height: renderHeight }}
          onPointerDown={(event) => {
            event.preventDefault();
            setDragTarget("wavebar");
          }}
          title="Kéo để đặt vị trí wavebar"
        >
          <div className="vlm-bars" style={{ gap: Math.max(1, wave.gap * scaleX) }}>
            {bars.map((h, idx) => (
              <span key={idx} style={{ width: Math.max(1, wave.barWidth * scaleX), height: h, background: wave.color }} />
            ))}
          </div>
          <div className="vlm-drag-label">Wavebar</div>
        </div>

        <div
          className={`vlm-subtitle ${dragTarget === "subtitle" ? "is-dragging" : ""}`}
          style={{
            bottom: subtitleBottom,
            transform: `translateX(calc(-50% + ${sub.offsetX * scaleX}px))`,
            fontSize: Math.max(12, sub.fontSize * scaleY),
            textShadow: `0 0 10px rgba(0,0,0,0.55), 0 ${sub.shadowDepth}px 10px rgba(0,0,0,0.55)`,
            WebkitTextStroke: `${sub.outlineWidth}px ${sub.outlineColor}`
          } as React.CSSProperties}
          onPointerDown={(event) => {
            event.preventDefault();
            setDragTarget("subtitle");
          }}
          title="Kéo để đặt vị trí subtitle"
        >
          <div className="vlm-subtitle-box" style={{ background: sub.backgroundColor, width: Math.max(220, Number((sub as any).boxWidth || 760) * scaleX), maxWidth: "92%", textAlign: "center" }}>
            {showSubA ? <div style={{ color: (sub as any).karaokeMode === "whiteToSpeaker" ? "#FFFFFF" : sub.colorA }}>A: Have you <span className="vlm-karaoke-word" style={{ color: (sub as any).karaokeMode === "whiteToSpeaker" ? sub.colorA : "#FFFFFF" }}>ever</span> wondered...</div> : null}
            {showSubR ? <div style={{ color: (sub as any).karaokeMode === "whiteToSpeaker" ? "#FFFFFF" : sub.colorR }}>R: How your voice <span className="vlm-karaoke-word" style={{ color: (sub as any).karaokeMode === "whiteToSpeaker" ? sub.colorR : "#FFFFFF" }}>sounds</span> to others?</div> : null}
            {showSubBoth ? <div style={{ color: (sub as any).karaokeMode === "whiteToSpeaker" ? "#FFFFFF" : sub.colorBoth }}>BOTH: Shared <span className="vlm-karaoke-word" style={{ color: (sub as any).karaokeMode === "whiteToSpeaker" ? sub.colorBoth : "#FFFFFF" }}>reaction</span> subtitle</div> : null}
            {!showSubA && !showSubR && !showSubBoth ? <div className="vlm-empty-sub">Chọn Sub A / R / BOTH để xem màu preview</div> : null}
          </div>
          <div className="vlm-drag-label">Subtitle</div>
        </div>
      </div>

      {!previewUrl ? <div className="vlm-preview-hint">Hãy chọn ảnh background trước để preview trực quan hơn.</div> : null}
    </div>
  );
}

export default function VideoLayoutManagerDialog({ open, onClose, value, onChange, onReset, previewBackgroundPath }: Props) {
  if (!open) return null;
  const sub = value.subtitle;
  const wave = value.wavebar;

  return (
    <div className="video-layout-dialog vlm-dialog">
      <div className="vlm-panel">
        <div className="vlm-header">
          <div>
            <div className="vlm-title">Video Layout Manager</div>
            
          </div>
          <div className="vlm-header-actions">
            <button type="button" onClick={() => onChange(applySmartSubtitleColors(value))} className="vlm-btn vlm-btn-smart">AI chọn màu sub</button>
            <button type="button" onClick={onReset} className="vlm-btn vlm-btn-secondary">Reset</button>
            <button type="button" onClick={onClose} className="vlm-btn vlm-btn-dark">Đóng</button>
          </div>
        </div>

        <div className="vlm-body">
          <div className="vlm-preview-col">
            <Preview value={value} previewBackgroundPath={previewBackgroundPath} onChange={onChange} />
          </div>

          <div className="vlm-controls-col">
            <section className="vlm-section">
              <div className="vlm-section-title">Subtitle</div>
              <div className="vlm-control-grid">
                <SliderRow label="Vị trí ngang" value={sub.offsetX} min={-520} max={520} onChange={(v: number) => onChange(updateNumber(value, "subtitle", "offsetX", v))} />
                <SliderRow label="Vị trí dọc" value={sub.marginBottom} min={20} max={680} onChange={(v: number) => onChange(updateNumber(value, "subtitle", "marginBottom", v))} />
                <SliderRow label="Cỡ chữ" value={sub.fontSize} min={24} max={76} onChange={(v: number) => onChange(updateNumber(value, "subtitle", "fontSize", v))} />
                <SliderRow label="Độ dày viền" value={sub.outlineWidth} min={0} max={5} step={0.1} onChange={(v: number) => onChange(updateNumber(value, "subtitle", "outlineWidth", v))} />
                <SliderRow label="Độ đậm bóng" value={sub.shadowDepth} min={0} max={10} step={0.1} onChange={(v: number) => onChange(updateNumber(value, "subtitle", "shadowDepth", v))} />
                <SliderRow label="Giới hạn ký tự / dòng" value={sub.maxLineChars} min={20} max={60} onChange={(v: number) => onChange(updateNumber(value, "subtitle", "maxLineChars", v))} />
                <SliderRow label="Chiều rộng box sub" value={(sub as any).boxWidth || 760} min={360} max={1100} onChange={(v: number) => onChange(updateNumber(value, "subtitle", "boxWidth", v))} />
                <SelectRow label="Karaoke Style" value={(sub as any).karaokeMode || "speakerToWhite"} options={[{value:"off",label:"Tắt karaoke"},{value:"speakerToWhite",label:"Màu speaker → chữ đang đọc trắng"},{value:"whiteToSpeaker",label:"Nền trắng → chữ đang đọc theo màu speaker"}]} onChange={(v: string) => onChange(updateText(value, "subtitle", "karaokeMode", v))} />
                <ColorRow label="Màu voice A" value={sub.colorA} onChange={(v: string) => onChange(updateText(value, "subtitle", "colorA", v))} />
                <ColorRow label="Màu voice R" value={sub.colorR} onChange={(v: string) => onChange(updateText(value, "subtitle", "colorR", v))} />
                <ColorRow label="Màu BOTH" value={sub.colorBoth} onChange={(v: string) => onChange(updateText(value, "subtitle", "colorBoth", v))} />
                <ColorRow label="Màu viền chữ" value={sub.outlineColor} onChange={(v: string) => onChange(updateText(value, "subtitle", "outlineColor", v))} />
                <label className="vlm-text-row">
                  <span>Màu nền subtitle rgba</span>
                  <input value={sub.backgroundColor} onChange={(e) => onChange(updateText(value, "subtitle", "backgroundColor", e.target.value))} />
                </label>
              </div>
            </section>

            <section className="vlm-section">
              <div className="vlm-section-title">Wavebar</div>
              <div className="vlm-wave-preset-row">
                <button type="button" className={`vlm-preset-btn ${wave.waveStyle === "calm" ? "active" : ""}`} onClick={() => onChange({ ...value, wavebar: { ...value.wavebar, waveStyle: "calm", speakingBoost: 5.5, maxTipHeight: 54, smoothingUp: 0.46, smoothingDown: 0.22, glowStrength: 0.45, reactiveSpread: 0.82 } })}>Calm</button>
                <button type="button" className={`vlm-preset-btn ${wave.waveStyle === "podcast" ? "active" : ""}`} onClick={() => onChange({ ...value, wavebar: { ...value.wavebar, waveStyle: "podcast", speakingBoost: 8.2, maxTipHeight: 78, smoothingUp: 0.64, smoothingDown: 0.18, glowStrength: 0.75, reactiveSpread: 1.0 } })}>Podcast</button>
                <button type="button" className={`vlm-preset-btn ${wave.waveStyle === "energetic" ? "active" : ""}`} onClick={() => onChange({ ...value, wavebar: { ...value.wavebar, waveStyle: "energetic", speakingBoost: 10.8, maxTipHeight: 105, smoothingUp: 0.78, smoothingDown: 0.14, glowStrength: 1.05, reactiveSpread: 1.35 } })}>Energetic</button>
              </div>
              <div className="vlm-control-grid">
                <SelectRow label="Wave Style" value={wave.waveStyle || "podcast"} options={[{value:"calm",label:"Calm"},{value:"podcast",label:"Podcast"},{value:"energetic",label:"Energetic"}]} onChange={(v: string) => onChange(updateText(value, "wavebar", "waveStyle", v))} />
                <CheckRow label="Mirror Mode" checked={(wave as any).mirrorMode} onChange={(v: boolean) => onChange(updateBool(value, "wavebar", "mirrorMode", v))} />
                <SliderRow label="Vị trí ngang" value={wave.xOffset} min={-560} max={560} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "xOffset", v))} />
                <SliderRow label="Vị trí dọc" value={wave.y} min={0} max={660} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "y", v))} />
                <SliderRow label="Chiều rộng" value={wave.width} min={180} max={920} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "width", v))} />
                <SliderRow label="Chiều cao wavebar" value={wave.height} min={24} max={160} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "height", v))} />
                <SliderRow label="Số lượng bar" value={wave.barCount} min={12} max={96} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "barCount", v))} />
                <SliderRow label="Độ rộng bar" value={wave.barWidth} min={1} max={14} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "barWidth", v))} />
                <SliderRow label="Khoảng cách bar" value={wave.gap} min={0} max={14} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "gap", v))} />
                <SliderRow label="Độ cao khi nhảy" value={wave.maxTipHeight} min={12} max={140} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "maxTipHeight", v))} />
                <SliderRow label="Độ nhạy" value={wave.speakingBoost} min={1} max={12} step={0.1} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "speakingBoost", v))} />
                <SliderRow label="Tốc độ lên" value={wave.smoothingUp} min={0.05} max={0.95} step={0.01} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "smoothingUp", v))} />
                <SliderRow label="Tốc độ xuống" value={wave.smoothingDown} min={0.05} max={0.95} step={0.01} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "smoothingDown", v))} />
                <SliderRow label="Độ lan sóng" value={(wave as any).reactiveSpread || 1} min={0.3} max={2.2} step={0.05} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "reactiveSpread", v))} />
                <SliderRow label="Độ glow" value={(wave as any).glowStrength ?? 0.75} min={0} max={1.6} step={0.05} onChange={(v: number) => onChange(updateNumber(value, "wavebar", "glowStrength", v))} />
                <ColorRow label="Màu mặc định" value={wave.color} onChange={(v: string) => onChange(updateText(value, "wavebar", "color", v))} />
                <ColorRow label="Màu voice A" value={(wave as any).colorA || "#22D3EE"} onChange={(v: string) => onChange(updateText(value, "wavebar", "colorA", v))} />
                <ColorRow label="Màu voice R" value={(wave as any).colorR || "#FB7185"} onChange={(v: string) => onChange(updateText(value, "wavebar", "colorR", v))} />
                <ColorRow label="Màu BOTH" value={(wave as any).colorBoth || "#A78BFA"} onChange={(v: string) => onChange(updateText(value, "wavebar", "colorBoth", v))} />
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
