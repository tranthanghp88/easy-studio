import React, { useEffect, useState } from "react";
import type { VideoLayoutSettings } from "../services/videoLayoutStorage";
type Props = {
  open: boolean;
  onClose: () => void;
  value: VideoLayoutSettings;
  onChange: (value: VideoLayoutSettings) => void;
  onReset: () => void;
  previewBackgroundPath?: string;
};
function updateNumber(value: VideoLayoutSettings, section: "subtitle" | "wavebar", key: string, next: number): VideoLayoutSettings {
  return { ...value, [section]: { ...value[section], [key]: next } } as VideoLayoutSettings;
}
function updateText(value: VideoLayoutSettings, section: "subtitle" | "wavebar", key: string, next: string): VideoLayoutSettings {
  return { ...value, [section]: { ...value[section], [key]: next } } as VideoLayoutSettings;
}
function SliderRow({ label, value, min, max, step = 1, onChange }: any) {
  return <label className="block"><div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600"><span>{label}</span><span>{value}</span></div><input type="range" min={min} max={max} step={step} value={value} onChange={(e)=>onChange(Number(e.target.value))} className="w-full accent-emerald-600" /></label>;
}
function ColorRow({ label, value, onChange }: any) {
  return <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"><span className="font-medium text-slate-700">{label}</span><input type="color" value={String(value).slice(0,7)} onChange={(e)=>onChange(e.target.value)} /></label>;
}

function Preview({ value, previewBackgroundPath }: { value: VideoLayoutSettings; previewBackgroundPath?: string }) {
  const sub = value.subtitle;
  const wave = value.wavebar;
  const [previewUrl, setPreviewUrl] = useState("");
  const frameRef = React.useRef<HTMLDivElement | null>(null);
  const [frameSize, setFrameSize] = useState({ width: 720, height: 405 });
  const [showSubA, setShowSubA] = useState(true);
  const [showSubR, setShowSubR] = useState(false);
  const [showSubBoth, setShowSubBoth] = useState(false);

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
        setPreviewUrl(result); // result now directly holds the dataUrl string
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
      const height = Math.round((width * 720) / 1280);
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

  const VIDEO_W = 1280;
  const VIDEO_H = 720;
  const scaleX = frameSize.width / VIDEO_W;
  const scaleY = frameSize.height / VIDEO_H;

  const renderWidth = Math.max(1, wave.width * scaleX);
  const renderHeight = Math.max(1, (wave.height + wave.maxTipHeight) * scaleY);
  const renderLeft = ((VIDEO_W - wave.width) / 2 + wave.xOffset) * scaleX;
  const renderTop = wave.y * scaleY;

  const bars = Array.from({ length: Math.min(60, Math.max(12, wave.barCount)) }, (_, i) => {
    const center = Math.abs(i - Math.floor(wave.barCount / 2));
    const peak = 1 - Math.min(1, center / Math.max(1, wave.barCount / 2));
    const random = [0.45, 0.72, 0.38, 0.88, 0.57, 0.81, 0.49][i % 7];
    return Math.max(
      4 * scaleY,
      (wave.height * 0.14 + peak * wave.maxTipHeight * random * 0.65) * scaleY
    );
  });

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 text-sm font-semibold text-slate-700">Preview</div>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showSubA} onChange={(e) => setShowSubA(e.target.checked)} />
          Sub A
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showSubR} onChange={(e) => setShowSubR(e.target.checked)} />
          Sub R
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showSubBoth} onChange={(e) => setShowSubBoth(e.target.checked)} />
          Sub BOTH
        </label>
      </div>
      <div
        ref={frameRef}
        className="relative mx-auto aspect-video w-full max-w-[720px] overflow-hidden rounded-2xl border border-slate-300 bg-slate-200"
      >
        {previewUrl ? (
          <img
            key={previewUrl}
            src={previewUrl}
            alt="Preview background"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[#4a4039] via-[#665448] to-[#8c6d52]" />
        )}

        <div
          className="absolute flex items-end justify-center"
          style={{
            left: renderLeft,
            top: renderTop,
            width: renderWidth,
            height: renderHeight
          }}
        >
          <div className="flex items-end" style={{ gap: Math.max(1, wave.gap * scaleX) }}>
            {bars.map((h, idx) => (
              <div
                key={idx}
                style={{
                  width: Math.max(1, wave.barWidth * scaleX),
                  height: h,
                  background: wave.color,
                  borderTopLeftRadius: 999,
                  borderTopRightRadius: 999
                }}
              />
            ))}
          </div>
        </div>

        <div
          className="absolute left-1/2 w-full max-w-[78%] text-center font-bold"
          style={{
            bottom: Math.max(0, sub.marginBottom * scaleY),
            transform: `translateX(calc(-50% + ${sub.offsetX * scaleX}px))`,
            fontSize: Math.max(12, sub.fontSize * scaleY),
            lineHeight: 1.18,
            textShadow: `0 0 10px rgba(0,0,0,0.55), 0 ${sub.shadowDepth}px 10px rgba(0,0,0,0.55)`,
            WebkitTextStroke: `${sub.outlineWidth}px ${sub.outlineColor}`
          } as React.CSSProperties}
        >
          <div className="inline-flex flex-col gap-1 rounded-2xl px-4 py-2" style={{ background: sub.backgroundColor }}>
            {showSubA ? (
              <div style={{ color: sub.colorA }}>A: Have you ever wondered...</div>
            ) : null}
            {showSubR ? (
              <div style={{ color: sub.colorR }}>R: How your voice sounds to others?</div>
            ) : null}
            {showSubBoth ? (
              <div style={{ color: sub.colorBoth }}>BOTH: Shared reaction subtitle</div>
            ) : null}
            {!showSubA && !showSubR && !showSubBoth ? (
              <div className="text-white/80">Chọn Sub A / R / BOTH để xem màu preview</div>
            ) : null}
          </div>
        </div>
      </div>
      {!previewUrl ? (
        <div className="mt-2 text-xs text-slate-500">Hãy chọn ảnh background trước để preview trực quan hơn.</div>
      ) : null}
    </div>
  );
}

export default function VideoLayoutManagerDialog({ open, onClose, value, onChange, onReset, previewBackgroundPath }: Props) {
  if (!open) return null;
  const sub = value.subtitle; const wave = value.wavebar;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div><div className="text-lg font-semibold text-slate-800">Video Layout Manager</div><div className="text-sm text-slate-500">Nút này nằm trong panel dựng video và chỉ bật khi đã chọn ảnh background.</div></div>
          <div className="flex items-center gap-2"><button type="button" onClick={onReset} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">Reset</button><button type="button" onClick={onClose} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Đóng</button></div>
        </div>
        <div className="grid gap-0 lg:grid-cols-[1.2fr_1fr]">
          <div className="border-r p-5"><Preview value={value} previewBackgroundPath={previewBackgroundPath} /></div>
          <div className="max-h-[80vh] overflow-auto p-5">
            <div className="mb-6"><div className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Subtitle</div><div className="grid gap-3">
              <SliderRow label="Vị trí ngang" value={sub.offsetX} min={-200} max={200} onChange={(v:number)=>onChange(updateNumber(value,"subtitle","offsetX",v))} />
              <SliderRow label="Vị trí dọc" value={sub.marginBottom} min={20} max={260} onChange={(v:number)=>onChange(updateNumber(value,"subtitle","marginBottom",v))} />
              <SliderRow label="Cỡ chữ" value={sub.fontSize} min={24} max={64} onChange={(v:number)=>onChange(updateNumber(value,"subtitle","fontSize",v))} />
              <SliderRow label="Độ dày viền" value={sub.outlineWidth} min={0} max={4} step={0.1} onChange={(v:number)=>onChange(updateNumber(value,"subtitle","outlineWidth",v))} />
              <SliderRow label="Độ đậm bóng" value={sub.shadowDepth} min={0} max={8} step={0.1} onChange={(v:number)=>onChange(updateNumber(value,"subtitle","shadowDepth",v))} />
              <SliderRow label="Giới hạn ký tự / dòng" value={sub.maxLineChars} min={20} max={50} onChange={(v:number)=>onChange(updateNumber(value,"subtitle","maxLineChars",v))} />
              <ColorRow label="Màu voice A" value={sub.colorA} onChange={(v:string)=>onChange(updateText(value,"subtitle","colorA",v))} />
              <ColorRow label="Màu voice R" value={sub.colorR} onChange={(v:string)=>onChange(updateText(value,"subtitle","colorR",v))} />
              <ColorRow label="Màu BOTH" value={sub.colorBoth} onChange={(v:string)=>onChange(updateText(value,"subtitle","colorBoth",v))} />
              <ColorRow label="Màu viền chữ" value={sub.outlineColor} onChange={(v:string)=>onChange(updateText(value,"subtitle","outlineColor",v))} />
              <div><div className="mb-1 text-xs font-medium text-slate-600">Màu nền subtitle (rgba)</div><input value={sub.backgroundColor} onChange={(e)=>onChange(updateText(value,"subtitle","backgroundColor",e.target.value))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></div>
            </div></div>
            <div><div className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Wavebar</div><div className="grid gap-3">
              <SliderRow label="Vị trí ngang" value={wave.xOffset} min={-300} max={300} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","xOffset",v))} />
              <SliderRow label="Vị trí dọc" value={wave.y} min={120} max={620} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","y",v))} />
              <SliderRow label="Chiều rộng" value={wave.width} min={180} max={720} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","width",v))} />
              <SliderRow label="Chiều cao box" value={wave.height} min={24} max={120} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","height",v))} />
              <SliderRow label="Số lượng bar" value={wave.barCount} min={12} max={80} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","barCount",v))} />
              <SliderRow label="Độ rộng bar" value={wave.barWidth} min={1} max={12} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","barWidth",v))} />
              <SliderRow label="Khoảng cách bar" value={wave.gap} min={0} max={12} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","gap",v))} />
              <SliderRow label="Độ cao khi nhảy" value={wave.maxTipHeight} min={12} max={120} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","maxTipHeight",v))} />
              <SliderRow label="Độ nhạy" value={wave.speakingBoost} min={1} max={12} step={0.1} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","speakingBoost",v))} />
              <SliderRow label="Tốc độ lên" value={wave.smoothingUp} min={0.05} max={0.95} step={0.01} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","smoothingUp",v))} />
              <SliderRow label="Tốc độ xuống" value={wave.smoothingDown} min={0.05} max={0.95} step={0.01} onChange={(v:number)=>onChange(updateNumber(value,"wavebar","smoothingDown",v))} />
              <ColorRow label="Màu wavebar" value={wave.color} onChange={(v:string)=>onChange(updateText(value,"wavebar","color",v))} />
            </div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
