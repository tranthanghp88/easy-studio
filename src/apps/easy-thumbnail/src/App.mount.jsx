
import React, { useEffect, useMemo, useRef, useState } from 'react';

const FLOW_URL = 'https://labs.google/fx/tools/flow';

const phongCachList = [
  'YouTube sáng nổi bật',
  'Podcast sạch và chuyên nghiệp',
  'Điện ảnh chân thực',
  'Hoạt hình thân thiện',
  'Tối giản cao cấp',
  'Giáo dục không lộ mặt'
];

const boCucList = [
  'Nữ bên trái / Nam bên phải / Chữ lớn ở giữa',
  'Một nhân vật chính + cảm xúc mạnh',
  'Chia đôi màn hình trước-sau',
  'Phòng podcast + tên kênh',
  'Vật thể ở giữa + chữ ngắn',
  'Không nhân vật, biểu tượng sạch'
];

const textModeList = [
  { id: 'ai', name: 'AI tự render text' },
  { id: 'empty', name: 'Chỉ chừa khoảng trống' },
  { id: 'composer', name: 'Composer render text' }
];

const defaultProfiles = [
  {
    id: 'easy-english-main',
    name: 'Easy English Channel',
    characterProfile: `Adam: Vietnamese male podcast host, 28 years old, short black textured hair, warm expressive eyes, friendly smile, clean casual outfit, modern minimal style, funny and confident English teacher vibe.

Raychel: Vietnamese female podcast host, 26 years old, long soft brown-black hair, natural makeup, bright expressive eyes, cheerful smile, modern casual outfit, warm playful English coach vibe.

Keep the same faces, hairstyles, age, outfit vibe, skin tone, and friendly podcast identity across episodes. Change only pose, expression, camera angle, and episode emotion.`,
    brandProfile: `Bright YouTube thumbnail style, clean modern podcast studio, premium but friendly atmosphere, warm cinematic lighting, strong facial emotions, clear readable title area, warm orange and blue contrast, colorful but not messy, recognizable Easy Studio identity.`
  }
];

const builtInFonts = ['Arial Black', 'Impact', 'Arial', 'Verdana', 'Tahoma', 'Segoe UI'];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      resolve({ dataUrl, base64: String(dataUrl).split(',')[1], mimeType: file.type, fileName: file.name });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}


function extractVideoFrames(file, count = 3) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const frames = [];

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration || 1;
        const times = count === 1
          ? [duration * 0.5]
          : [duration * 0.15, duration * 0.5, duration * 0.85].slice(0, count);

        for (const t of times) {
          await new Promise((res, rej) => {
            video.currentTime = Math.min(Math.max(t, 0.1), Math.max(duration - 0.1, 0.1));
            video.onseeked = () => res();
            video.onerror = () => rej(new Error('Không đọc được frame video.'));
          });

          const maxW = 1280;
          const ratio = video.videoWidth ? Math.min(1, maxW / video.videoWidth) : 1;
          canvas.width = Math.round((video.videoWidth || 1280) * ratio);
          canvas.height = Math.round((video.videoHeight || 720) * ratio);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
          frames.push({
            dataUrl,
            base64: dataUrl.split(',')[1],
            mimeType: 'image/jpeg',
            mediaType: 'image',
            time: Math.round(t)
          });
        }

        URL.revokeObjectURL(url);
        resolve(frames);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được video. Hãy thử file mp4/webm ngắn hơn.'));
    };
  });
}


function cleanScript(raw) {
  if (!raw) return '';
  return raw.split('\n').filter(line => {
    const t = line.trim();
    if (/models\/gemini|not found|generateContent|ListModels|API version|Quota|RESOURCE_EXHAUSTED|Error invoking/i.test(t)) return false;
    if (/^Lỗi:/i.test(t)) return false;
    return true;
  }).join('\n').slice(0, 2500);
}

function inferStrategy({chuDe, script}) {
  const lower = `${chuDe || ''}\n${cleanScript(script)}`.toLowerCase();
  let angle = 'friendly English learning podcast';
  let emotion = 'happy, surprised, relatable';
  let text = 'SPEAK NATURALLY';
  if (lower.includes('tell me about yourself') || lower.includes('about yourself') || lower.includes('talk about your self')) {
    angle = 'how to answer “Tell me about yourself” without freezing';
    emotion = 'funny panic turning into confidence';
    text = 'ABOUT YOURSELF?';
  } else if (lower.includes('coffee')) text = 'ORDER COFFEE';
  else if (lower.includes('small talk')) text = 'SMALL TALK';
  else if (lower.includes('job')) text = 'TALK ABOUT JOB';
  return { angle, emotion, text };
}

function profileBlock(selectedProfile) {
  if (!selectedProfile) return '';
  return `
Recurring character consistency:
${selectedProfile.characterProfile || ''}

Brand style:
${selectedProfile.brandProfile || ''}

Important consistency instruction:
Use the selected recurring character/brand profile if a reference image is provided in Flow. Keep the same identity, face, hairstyle, age, outfit vibe, lighting mood, and overall brand style. Change only pose, emotion, camera angle, and episode-specific details.`;
}

function textModeBlock(mode, text) {
  if (mode === 'ai') {
    return `
Typography instruction:
Include large bold readable thumbnail typography integrated naturally into the image.
The main thumbnail text should be: "${text}".
Use playful high-contrast YouTube typography with thick outline, shadow, and strong readability.`;
  }
  if (mode === 'empty') {
    return `
Typography instruction:
Do NOT render any text, letters, captions, words, logos, watermarks, or typography inside the generated image.
Leave a clean empty space for the title overlay later.
The title will be added manually after generation.`;
  }
  return `
Typography instruction:
Do NOT render the actual title text inside the generated image.
Reserve a clean area for app-composed text overlay later.
The title text will be added in Easy Thumbnail Studio Composer.`;
}

function buildPrompt({chuDe, script, phongCach, boCuc, chuThumbnail, selectedProfile, textMode}) {
  const clean = cleanScript(script);
  const s = inferStrategy({chuDe, script});
  const finalText = chuThumbnail || s.text;
  return `YouTube thumbnail, 16:9, for an English learning podcast channel named "Easy Studio".

Core idea:
${chuDe || s.angle}

Viewer emotion:
${s.emotion}

Visual layout:
${boCuc}

Visual style:
${phongCach}
${profileBlock(selectedProfile)}

${textModeBlock(textMode, finalText)}

Scene:
Two friendly podcast hosts in a clean modern studio, expressive faces, warm bright lighting, clear microphone setup, simple colorful background, strong YouTube educational thumbnail vibe.

Design rules:
high CTR, bright YouTube style, professional creator thumbnail, clean composition, big faces, strong contrast, sharp focus, premium but friendly, not cluttered.

Negative:
watermark, random logo, blurry, distorted face, extra fingers, messy background, dark low contrast, cheap stock photo look.

Script context:
${clean.slice(0, 900)}`;
}

function buildConcepts({chuDe, script}) {
  const s = inferStrategy({chuDe, script});
  return [
    `1) Hai host podcast phản ứng với câu hỏi. Cảm xúc: ${s.emotion}.`,
    `2) Chia đôi màn hình: người học bối rối vs người nói tự tin.`,
    `3) Phòng podcast sạch, micro, ánh sáng ấm, chừa vùng lớn cho text.`,
    `4) Một host biểu cảm mạnh, chỉ vào các cụm tiếng Anh đơn giản.`,
    `5) Nền tối giản cao cấp, một biểu tượng chính và chữ ngắn thật lớn.`
  ].join('\n\n');
}

export default function App() {
  const canvasRef = useRef(null);
  const bgImgRef = useRef(null);
  const analyzeInputRef = useRef(null);
  const bgInputRef = useRef(null);

  const [tab, setTab] = useState('tao-prompt');
  const [updatePopup, setUpdatePopup] = useState('');
  const [chuDe, setChuDe] = useState('');
  const [script, setScript] = useState('');
  const [phongCach, setPhongCach] = useState(phongCachList[0]);
  const [boCuc, setBoCuc] = useState(boCucList[0]);
  const [chuThumbnail, setChuThumbnail] = useState('ABOUT YOURSELF?');
  const [textMode, setTextMode] = useState('ai');
  const [concepts, setConcepts] = useState('');
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('');
  const [aiStyleSuggestion, setAiStyleSuggestion] = useState(null);

  const [geminiKey, setGeminiKey] = useState('');
  const [profiles, setProfiles] = useState(defaultProfiles);
  const [syncProfileId, setSyncProfileId] = useState('off');
  const [editingProfileId, setEditingProfileId] = useState(defaultProfiles[0].id);
  const [profileName, setProfileName] = useState(defaultProfiles[0].name);
  const [profileCharacters, setProfileCharacters] = useState(defaultProfiles[0].characterProfile);
  const [profileBrand, setProfileBrand] = useState(defaultProfiles[0].brandProfile);

  const [media, setMedia] = useState(null);
  const [mediaPreview, setMediaPreview] = useState('');
  const [videoFrames, setVideoFrames] = useState([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [ketQuaPhanTich, setKetQuaPhanTich] = useState('');
  const [dangPhanTich, setDangPhanTich] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState('fast');
  const [preferredModel, setPreferredModel] = useState('gemini-2.5-flash-lite');

  const [bgUrl, setBgUrl] = useState('');
  const [bgImageData, setBgImageData] = useState(null);
  const [textX, setTextX] = useState(640);
  const [textY, setTextY] = useState(185);
  const [fontSize, setFontSize] = useState(82);
  const [textColor, setTextColor] = useState('#ffffff');
  const [strokeColor, setStrokeColor] = useState('#0f172a');
  const [strokeWidth, setStrokeWidth] = useState(10);
  const [shadowBlur, setShadowBlur] = useState(18);
  const [bgDim, setBgDim] = useState(0.08);
  const [brand, setBrand] = useState('Easy Studio');
  const [showBrand, setShowBrand] = useState(true);
  const [fontFamily, setFontFamily] = useState('Arial Black');
  const [customFonts, setCustomFonts] = useState([]);
  const [previewScale, setPreviewScale] = useState('fit');

  useEffect(() => {
    window.easyAPI?.getConfig().then(cfg => {
      if (!cfg) return;
      if (cfg.geminiKey) setGeminiKey(cfg.geminiKey);
      if (Array.isArray(cfg.profiles) && cfg.profiles.length) {
        setProfiles(cfg.profiles);
        const first = cfg.profiles[0];
        setEditingProfileId(first.id);
        setProfileName(first.name || '');
        setProfileCharacters(first.characterProfile || '');
        setProfileBrand(first.brandProfile || '');
      }
      if (cfg.syncProfileId) setSyncProfileId(cfg.syncProfileId);
      if (Array.isArray(cfg.customFonts)) {
        setCustomFonts(cfg.customFonts);
        cfg.customFonts.forEach(registerFont);
      }
    });
  }, []);

  useEffect(() => { drawCanvas(); }, [bgUrl, textX, textY, fontSize, textColor, strokeColor, strokeWidth, shadowBlur, bgDim, brand, showBrand, fontFamily, chuThumbnail]);

  const selectedProfile = useMemo(() => {
    if (syncProfileId === 'off') return null;
    return profiles.find(p => p.id === syncProfileId) || null;
  }, [profiles, syncProfileId]);

  const livePrompt = useMemo(() => buildPrompt({
    chuDe, script, phongCach, boCuc, chuThumbnail, selectedProfile, textMode
  }), [chuDe, script, phongCach, boCuc, chuThumbnail, selectedProfile, textMode]);

  function registerFont(font) {
    if (!font?.name || !font?.url) return;
    const styleId = `font-${font.name}`;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@font-face { font-family: "${font.name}"; src: url("${font.url}"); }`;
    document.head.appendChild(style);
  }

  async function importFont() {
    const font = await window.easyAPI?.importFont();
    if (!font) return;
    registerFont(font);
    const next = [...customFonts, font];
    setCustomFonts(next);
    setFontFamily(font.name);
    await window.easyAPI?.saveConfig({ geminiKey, profiles, syncProfileId, customFonts: next });
    setStatus('Đã thêm font chữ.');
  }

  function handleFontChange(value) {
    if (value === '__add_font__') return importFont();
    setFontFamily(value);
  }

  function generate() {
    setConcepts(buildConcepts({chuDe, script}));
    setPrompt(livePrompt);
    setStatus('Đã tạo concept + prompt sạch cho Flow.');
  }

  async function copyPrompt() {
    await window.easyAPI?.copyText(prompt || livePrompt);
    setStatus('Đã copy prompt.');
  }

  async function openFlow() {
    await copyPrompt();
    await window.easyAPI?.openExternal(FLOW_URL);
  }

  async function saveSettings(extra = {}) {
    await window.easyAPI?.saveConfig({ geminiKey, profiles, syncProfileId, customFonts, ...extra });
    setStatus('Đã lưu cài đặt.');
  }

  function selectEditingProfile(id) {
    const p = profiles.find(x => x.id === id);
    if (!p) return;
    setEditingProfileId(p.id);
    setProfileName(p.name || '');
    setProfileCharacters(p.characterProfile || '');
    setProfileBrand(p.brandProfile || '');
  }

  async function saveProfile() {
    const nextProfiles = profiles.map(p => p.id === editingProfileId ? {
      ...p,
      name: profileName.trim() || 'Profile mới',
      characterProfile: profileCharacters,
      brandProfile: profileBrand
    } : p);
    setProfiles(nextProfiles);
    await window.easyAPI?.saveConfig({ geminiKey, profiles: nextProfiles, syncProfileId, customFonts });
    setStatus('Đã lưu profile nhân vật.');
  }

  async function createProfile() {
    const id = 'profile-' + Date.now();
    const newProfile = { id, name: 'Profile mới', characterProfile: 'Mô tả nhân vật ở đây...', brandProfile: 'Mô tả phong cách thương hiệu ở đây...' };
    const nextProfiles = [...profiles, newProfile];
    setProfiles(nextProfiles);
    setEditingProfileId(id);
    setProfileName(newProfile.name);
    setProfileCharacters(newProfile.characterProfile);
    setProfileBrand(newProfile.brandProfile);
    await window.easyAPI?.saveConfig({ geminiKey, profiles: nextProfiles, syncProfileId, customFonts });
    setStatus('Đã tạo profile mới.');
  }

  async function duplicateProfile() {
    const p = profiles.find(x => x.id === editingProfileId);
    if (!p) return;
    const copy = { ...p, id: 'profile-' + Date.now(), name: (p.name || 'Profile') + ' - Copy' };
    const nextProfiles = [...profiles, copy];
    setProfiles(nextProfiles);
    setEditingProfileId(copy.id);
    setProfileName(copy.name);
    setProfileCharacters(copy.characterProfile);
    setProfileBrand(copy.brandProfile);
    await window.easyAPI?.saveConfig({ geminiKey, profiles: nextProfiles, syncProfileId, customFonts });
    setStatus('Đã nhân bản profile.');
  }

  async function deleteProfile() {
    if (profiles.length <= 1) return setStatus('Cần giữ lại ít nhất 1 profile.');
    const nextProfiles = profiles.filter(p => p.id !== editingProfileId);
    const nextSync = syncProfileId === editingProfileId ? 'off' : syncProfileId;
    const first = nextProfiles[0];
    setProfiles(nextProfiles);
    setSyncProfileId(nextSync);
    setEditingProfileId(first.id);
    setProfileName(first.name || '');
    setProfileCharacters(first.characterProfile || '');
    setProfileBrand(first.brandProfile || '');
    await window.easyAPI?.saveConfig({ geminiKey, profiles: nextProfiles, syncProfileId: nextSync, customFonts });
    setStatus('Đã xóa profile.');
  }

  async function onMediaUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith('video/');

    if (isVideo) {
      setStatus('Đang trích xuất keyframe từ video...');
      const frames = await extractVideoFrames(file, 3);
      setVideoFrames(frames);
      setSelectedFrameIndex(0);
      setMedia(frames[0]);
      setMediaPreview(frames[0]?.dataUrl || '');
      setStatus('Đã trích xuất keyframe. Chọn frame đẹp nhất rồi bấm phân tích.');
      return;
    }

    const item = await fileToBase64(file);
    item.mediaType = 'image';
    setVideoFrames([]);
    setSelectedFrameIndex(0);
    setMedia(item);
    setMediaPreview(item.dataUrl);
    setStatus('Đã upload ảnh để phân tích.');
  }

  async function analyzeMedia() {
    try {
      if (!geminiKey.trim()) {
        setStatus('Bạn cần nhập Gemini API Key trong tab Nhân vật / Cài đặt trước khi phân tích.');
        setTab('settings');
        return;
      }
      if (!media) throw new Error('Bạn cần upload ảnh hoặc video trước.');
      setDangPhanTich(true);
      setStatus(videoFrames.length ? 'Đang phân tích keyframe video bằng Gemini...' : 'Đang phân tích thumbnail bằng Gemini...');
      const res = await window.easyAPI?.analyzeMedia({
        apiKey: geminiKey,
        base64: media.base64,
        mimeType: media.mimeType,
        mediaType: media.mediaType,
        analyzeMode,
        preferredModel,
      });
      setKetQuaPhanTich(res.text);
      setStatus('Đã phân tích xong. Model dùng: ' + (res?.modelUsed || preferredModel) + '.');
    } catch (err) {
      setStatus('Lỗi phân tích: ' + (err?.message || String(err)));
    } finally {
      setDangPhanTich(false);
    }
  }

  async function copyAnalysis() {
    await window.easyAPI?.copyText(ketQuaPhanTich);
    setStatus('Đã copy kết quả phân tích.');
  }

  async function useAnalysisAsPrompt() {
    const match = ketQuaPhanTich.match(/##\s*(4|7)[\s\S]*?(?=##\s*(5|8)|$)/i);
    const text = match ? match[0].replace(/^##[^\n]*\n?/i, '').trim() : ketQuaPhanTich;
    setPrompt(text);
    setTab('tao-prompt');
    setStatus('Đã đưa prompt phân tích sang tab tạo prompt.');
  }

  async function onBgUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const item = await fileToBase64(file);
    setBgImageData(item);
    setBgUrl(item.dataUrl);
    setStatus('Đã import ảnh nền vào trình ghép.');
  }

  function randomLayout() {
    const layouts = [
      { x: 640, y: 160, size: 82, stroke: 10, dim: 0.10 },
      { x: 360, y: 210, size: 76, stroke: 11, dim: 0.16 },
      { x: 900, y: 220, size: 72, stroke: 10, dim: 0.14 },
      { x: 640, y: 540, size: 70, stroke: 9, dim: 0.08 },
      { x: 640, y: 360, size: 90, stroke: 12, dim: 0.20 }
    ];
    const chosen = layouts[Math.floor(Math.random() * layouts.length)];
    setTextX(chosen.x);
    setTextY(chosen.y);
    setFontSize(chosen.size);
    setStrokeWidth(chosen.stroke);
    setBgDim(chosen.dim);
    setStatus('Đã random bố cục text theo kiểu thumbnail.');
  }

  function randomNiceStyle() {
    const combos = [
      { font: 'Arial Black', text: '#ffffff', stroke: '#07111f', shadow: 20, strokeW: 11, dim: 0.12 },
      { font: 'Impact', text: '#facc15', stroke: '#111827', shadow: 24, strokeW: 12, dim: 0.16 },
      { font: 'Arial Black', text: '#ffffff', stroke: '#1d4ed8', shadow: 18, strokeW: 10, dim: 0.10 },
      { font: 'Verdana', text: '#ffffff', stroke: '#7f1d1d', shadow: 16, strokeW: 9, dim: 0.14 },
      { font: 'Impact', text: '#38bdf8', stroke: '#020617', shadow: 22, strokeW: 12, dim: 0.18 },
      { font: 'Arial Black', text: '#fb7185', stroke: '#ffffff', shadow: 14, strokeW: 8, dim: 0.08 }
    ];
    const c = combos[Math.floor(Math.random() * combos.length)];
    setFontFamily(c.font);
    setTextColor(c.text);
    setStrokeColor(c.stroke);
    setShadowBlur(c.shadow);
    setStrokeWidth(c.strokeW);
    setBgDim(c.dim);
    randomLayout();
    setAiStyleSuggestion({
      analysis: 'Random đẹp đã chọn nhanh một combo text nổi bật, phù hợp kiểu thumbnail YouTube.',
      fontRecommendation: { primary: c.font, fallbackInApp: c.font, searchKeyword: c.font + ' font download', reason: 'Font dày, dễ đọc trên mobile.' },
      textX: textX,
      textY: textY,
      fontSize,
      textColor: c.text,
      strokeColor: c.stroke,
      strokeWidth: c.strokeW,
      shadowBlur: c.shadow,
      bgDim: c.dim,
      reason: 'Combo random đẹp: font, màu, viền, shadow và độ tối nền.'
    });
    setStatus('Đã random đẹp: font, màu, viền, shadow và vị trí.');
  }

  async function aiSuggestStyle() {
    try {
      if (!geminiKey.trim()) {
        setStatus('Bạn cần nhập Gemini API Key trong tab Nhân vật / Cài đặt trước khi dùng AI chọn style.');
        setTab('settings');
        return;
      }
      if (!bgImageData?.base64) {
        setStatus('Bạn cần import ảnh nền trước khi dùng AI chọn style.');
        return;
      }
      setStatus('AI đang phân tích ảnh nền và chọn style text...');
      const res = await window.easyAPI?.suggestTextStyle({
        apiKey: geminiKey,
        base64: bgImageData.base64,
        mimeType: bgImageData.mimeType,
        titleText: chuThumbnail,
        topic: chuDe,
        brandProfile: selectedProfile?.brandProfile || ''
      });
      if (typeof res?.textX === 'number') setTextX(Math.max(0, Math.min(1280, Math.round(res.textX))));
      if (typeof res?.textY === 'number') setTextY(Math.max(0, Math.min(720, Math.round(res.textY))));
      if (typeof res?.fontSize === 'number') setFontSize(Math.max(34, Math.min(150, Math.round(res.fontSize))));
      if (res?.textColor) setTextColor(res.textColor);
      if (res?.strokeColor) setStrokeColor(res.strokeColor);
      if (typeof res?.strokeWidth === 'number') setStrokeWidth(Math.max(0, Math.min(24, Math.round(res.strokeWidth))));
      if (typeof res?.shadowBlur === 'number') setShadowBlur(Math.max(0, Math.min(35, Math.round(res.shadowBlur))));
      if (typeof res?.bgDim === 'number') setBgDim(Math.max(0, Math.min(0.55, Number(res.bgDim))));
      const fallbackFont = res?.fontRecommendation?.fallbackInApp || res?.fontFamily;
      if (fallbackFont && builtInFonts.includes(fallbackFont)) setFontFamily(fallbackFont);
      setAiStyleSuggestion(res);
      setStatus('AI đã chọn style text. ' + (res?.reason || ''));
    } catch (err) {
      setStatus('Lỗi AI chọn style: ' + (err?.message || String(err)));
    }
  }

  function centerText() {
    setTextX(640);
    setTextY(360);
  }

  function topText() {
    setTextX(640);
    setTextY(155);
  }

  function bottomText() {
    setTextX(640);
    setTextY(555);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x+r, y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }

  function drawCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = 1280; canvas.height = 720;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0,0,1280,720);

    const img = bgImgRef.current;
    if (img && img.complete && bgUrl) {
      const scale = Math.max(1280 / img.naturalWidth, 720 / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      ctx.drawImage(img, (1280-w)/2, (720-h)/2, w, h);
    } else {
      const g = ctx.createLinearGradient(0,0,1280,720);
      g.addColorStop(0, '#0ea5e9'); g.addColorStop(.55, '#facc15'); g.addColorStop(1, '#ef4444');
      ctx.fillStyle = g; ctx.fillRect(0,0,1280,720);
    }

    if (bgDim > 0) { ctx.fillStyle = `rgba(0,0,0,${bgDim})`; ctx.fillRect(0,0,1280,720); }

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(640, 0); ctx.lineTo(640, 720);
    ctx.moveTo(0, 360); ctx.lineTo(1280, 360);
    ctx.stroke();
    ctx.restore();

    const lines = String(chuThumbnail || '').toUpperCase().split(/\n| /).reduce((arr, word) => {
      if (!arr.length) return [word];
      const last = arr[arr.length - 1];
      if ((last + ' ' + word).length <= 14) arr[arr.length - 1] = last + ' ' + word;
      else arr.push(word);
      return arr;
    }, []);

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${fontSize}px "${fontFamily}", Arial, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#000'; ctx.shadowBlur = shadowBlur; ctx.shadowOffsetY = 8;
    const lh = fontSize * .98, sy = textY - ((lines.length - 1) * lh) / 2;
    lines.forEach((line, i) => {
      const y = sy + i * lh;
      ctx.strokeStyle = strokeColor; ctx.lineWidth = strokeWidth; ctx.strokeText(line, textX, y);
      ctx.fillStyle = textColor; ctx.fillText(line, textX, y);
    });
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

    if (showBrand) {
      ctx.font = '900 34px Arial, sans-serif';
      const metrics = ctx.measureText(brand), boxW = metrics.width + 48, boxH = 54, bx = 640 - boxW/2, by = 648;
      ctx.fillStyle = 'rgba(15,23,42,.86)'; roundRect(ctx, bx, by, boxW, boxH, 28); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(brand, 640, by + boxH/2 + 1);
    }
  }

  function preview() {
    drawCanvas();
    setStatus('Đã cập nhật preview.');
  }

  async function exportPng() {
    drawCanvas();
    const dataUrl = canvasRef.current.toDataURL('image/png');
    await window.easyAPI?.saveImage({ defaultPath: 'easy-thumbnail-final.png', dataUrl });
    setStatus('Đã xuất PNG 1280x720.');
  }

  async function checkUpdate() {
    const res = await window.easyAPI?.checkUpdate();
    setUpdatePopup(res?.message || 'Bạn đang dùng bản mới nhất.');
    setTimeout(() => setUpdatePopup(''), 3500);
  }

  function registerFont(font) {
    if (!font?.name || !font?.url) return;
    const styleId = `font-${font.name}`;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `@font-face { font-family: "${font.name}"; src: url("${font.url}"); }`;
    document.head.appendChild(style);
  }

  async function importFont() {
    const font = await window.easyAPI?.importFont();
    if (!font) return;
    registerFont(font);
    const next = [...customFonts, font];
    setCustomFonts(next);
    setFontFamily(font.name);
    await window.easyAPI?.saveConfig({ geminiKey, profiles, syncProfileId, customFonts: next });
    setStatus('Đã thêm font chữ.');
  }

  function handleFontChange(value) {
    if (value === '__add_font__') return importFont();
    setFontFamily(value);
  }

  const fontOptions = [...builtInFonts, ...customFonts.map(f => f.name)];

  return (
    <div className="app">
      {updatePopup && <div className="toast">✅ {updatePopup}</div>}

      <header>
        <div>
          <p className="eyebrow">Easy Studio</p>
          <h1>Easy Thumbnail</h1>
        </div>
        <div className="headerActions">
          <button className="homeBtn" onClick={() => window.dispatchEvent(new CustomEvent('easy-studio:navigate-home'))} title="Về trang chủ Easy Studio" aria-label="Về trang chủ Easy Studio"><svg className="es-home-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 10.2V20h4.6v-5.4h3.2V20h4.6v-9.8"/></svg></button>
        </div>
      </header>

      <div className="tabs">
        <button className={tab === 'tao-prompt' ? 'active' : ''} onClick={() => setTab('tao-prompt')}>✨ Tạo Prompt</button>
        <button className={tab === 'phan-tich' ? 'active' : ''} onClick={() => setTab('phan-tich')}>🔍 Phân tích ảnh/video</button>
        <button className={tab === 'composer' ? 'active' : ''} onClick={() => setTab('composer')}>🖼️ Ghép Thumbnail</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>👥 Nhân vật / Cài đặt</button>
      </div>

      {tab === 'tao-prompt' && (
        <main>
          <section className="panel">
            <h2>✨ Nhập nội dung</h2>
            <label>Chủ đề / Tiêu đề</label>
            <input value={chuDe} onChange={e => setChuDe(e.target.value)} placeholder="Talk about yourself" />
            <label>Nội dung script</label>
            <textarea value={script} onChange={e => setScript(e.target.value)} placeholder="Paste script vào đây..." />
            <div className="grid">
              <div><label>Phong cách</label><select value={phongCach} onChange={e => setPhongCach(e.target.value)}>{phongCachList.map(x => <option key={x}>{x}</option>)}</select></div>
              <div><label>Bố cục</label><select value={boCuc} onChange={e => setBoCuc(e.target.value)}>{boCucList.map(x => <option key={x}>{x}</option>)}</select></div>
            </div>
            <label>Đồng bộ nhân vật</label>
            <select value={syncProfileId} onChange={async e => { setSyncProfileId(e.target.value); await window.easyAPI?.saveConfig({ geminiKey, profiles, syncProfileId: e.target.value, customFonts }); }}>
              <option value="off">Không bật</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <label>Chế độ text</label>
            <select value={textMode} onChange={e => setTextMode(e.target.value)}>{textModeList.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            <label>Chữ trên thumbnail</label>
            <input value={chuThumbnail} onChange={e => setChuThumbnail(e.target.value)} />
            <button className="primary wide" onClick={generate}>✨ Tạo Prompt Thumbnail</button>
          </section>

          <section className="panel">
            <h2>🧠 Concept + Prompt</h2>
            <label>Ý tưởng thumbnail</label>
            <textarea className="small" value={concepts} onChange={e => setConcepts(e.target.value)} />
            <label>Prompt cho Flow</label>
            <textarea className="prompt" value={prompt || livePrompt} onChange={e => setPrompt(e.target.value)} />
            <div className="actions threeActions">
              <button onClick={copyPrompt}>📋 Copy Prompt</button>
              <button onClick={() => window.easyAPI?.saveText({defaultPath:'flow-thumbnail-prompt.txt', content: prompt || livePrompt})}>💾 Lưu Prompt</button>
              <button className="primary" onClick={openFlow}>🚀 Copy + Mở Flow</button>
            </div>
            <p className="status">{status}</p>
          </section>
        </main>
      )}

      {tab === 'phan-tich' && (
        <main>
          <section className="panel">
            <h2>🔍 Phân tích ảnh/video mẫu</h2>
            <label>Upload thumbnail hoặc video mẫu</label>
            <input ref={analyzeInputRef} className="hiddenFile" type="file" accept="image/*,video/*" onChange={onMediaUpload} />
            <button className="fileBtn" onClick={() => analyzeInputRef.current?.click()}>📁 Chọn ảnh hoặc video</button>

            <div className="analyzeOptions">
              <div>
                <label>Chế độ phân tích</label>
                <select value={analyzeMode} onChange={e => setAnalyzeMode(e.target.value)}>
                  <option value="fast">⚡ Nhanh / nhẹ quota</option>
                  <option value="full">🧠 Sâu / chi tiết hơn</option>
                </select>
              </div>
              <div>
                <label>Model ưu tiên</label>
                <select value={preferredModel} onChange={e => setPreferredModel(e.target.value)}>
                  <option value="gemini-2.5-flash-lite">gemini-2.5-flash-lite</option>
                  <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
                  <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                  <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                </select>
              </div>
            </div>
            {videoFrames.length > 0 && (
              <div className="framePicker">
                {videoFrames.map((frame, index) => (
                  <button
                    key={index}
                    className={selectedFrameIndex === index ? 'frame activeFrame' : 'frame'}
                    onClick={() => {
                      setSelectedFrameIndex(index);
                      setMedia(frame);
                      setMediaPreview(frame.dataUrl);
                    }}
                  >
                    <img src={frame.dataUrl} />
                    <span>Frame {index + 1} · {frame.time}s</span>
                  </button>
                ))}
              </div>
            )}
            {mediaPreview && <img className="analyzePreview" src={mediaPreview} />}
            <button className="primary wide" disabled={dangPhanTich} onClick={analyzeMedia}>{dangPhanTich ? '⏳ Đang phân tích...' : '🔍 Phân tích style'}</button>
          </section>
          <section className="panel">
            <h2>📄 Kết quả phân tích</h2>
            <textarea className="analysis" value={ketQuaPhanTich} onChange={e => setKetQuaPhanTich(e.target.value)} placeholder="Kết quả phân tích sẽ hiện ở đây..." />
            <div className="actions threeActions">
              <button onClick={copyAnalysis}>📋 Copy kết quả</button>
              <button onClick={useAnalysisAsPrompt}>✨ Dùng làm Prompt</button>
              <button className="primary" onClick={openFlow}>🚀 Mở Flow</button>
            </div>
            <p className="status">{status}</p>
          </section>
        </main>
      )}

      {tab === 'composer' && (
        <main>
          <section className="panel composer full">
            <h2>🖼️ Ghép Thumbnail</h2>
            <div className="composerLayout">
              <div>
                <div className={`canvasWrap scale-${previewScale}`}>
                  {bgUrl && <img ref={bgImgRef} src={bgUrl} onLoad={preview} style={{display:'none'}} />}
                  <canvas ref={canvasRef} width="1280" height="720" />
                </div>
                <div className="previewTools"><label>Zoom preview</label><select value={previewScale} onChange={e => setPreviewScale(e.target.value)}><option value="fit">Fit</option><option value="75">75%</option><option value="50">50%</option></select></div>

                <div className="aiSuggestionPanel">
                  <h3>🤖 Gợi ý AI</h3>
                  {aiStyleSuggestion ? (
                    <div className="aiSuggestionContent">
                      <div><strong>1. Phân tích ảnh</strong><p>{aiStyleSuggestion.analysis || aiStyleSuggestion.reason || 'AI đã chọn style dựa trên ảnh nền.'}</p></div>
                      <div><strong>2. Font chữ</strong><p><b>{aiStyleSuggestion.fontRecommendation?.primary || aiStyleSuggestion.fontFamily || fontFamily}</b></p>
                        {aiStyleSuggestion.fontRecommendation?.fallbackInApp && <p>Font dùng trong app: <b>{aiStyleSuggestion.fontRecommendation.fallbackInApp}</b></p>}
                        {aiStyleSuggestion.fontRecommendation?.searchKeyword && <p>Tìm tải font: <code>{aiStyleSuggestion.fontRecommendation.searchKeyword}</code></p>}
                        {aiStyleSuggestion.fontRecommendation?.reason && <p>{aiStyleSuggestion.fontRecommendation.reason}</p>}
                      </div>
                      <div className="suggestionGrid">
                        <span>Màu chữ: <b>{aiStyleSuggestion.textColor || textColor}</b></span>
                        <span>Màu viền: <b>{aiStyleSuggestion.strokeColor || strokeColor}</b></span>
                        <span>Cỡ chữ: <b>{aiStyleSuggestion.fontSize ?? fontSize}</b></span>
                        <span>Làm tối nền: <b>{aiStyleSuggestion.bgDim ?? bgDim}</b></span>
                        <span>Độ dày viền: <b>{aiStyleSuggestion.strokeWidth ?? strokeWidth}</b></span>
                        <span>Đổ bóng: <b>{aiStyleSuggestion.shadowBlur ?? shadowBlur}</b></span>
                        <span>Vị trí X: <b>{(aiStyleSuggestion.textX ?? textX) - 640}</b></span>
                        <span>Vị trí Y: <b>{(aiStyleSuggestion.textY ?? textY) - 360}</b></span>
                      </div>
                    </div>
                  ) : (
                    <p className="emptyHint">Bấm <b>🤖 AI chọn style</b> để app phân tích ảnh nền và gợi ý font, màu sắc, vị trí, viền, shadow.</p>
                  )}
                </div>
              </div>

              <div className="controlPanel">
                <label>Import ảnh nền từ Flow</label>
                <input ref={bgInputRef} className="hiddenFile" type="file" accept="image/*" onChange={onBgUpload} />
                <button className="fileBtn" onClick={() => bgInputRef.current?.click()}>📁 Chọn ảnh nền</button>

                <label>Font chữ</label>
                <select value={fontFamily} onChange={e => handleFontChange(e.target.value)}>
                  {fontOptions.map(x => <option key={x} value={x}>{x}</option>)}
                  <option value="__add_font__">➕ Thêm font chữ...</option>
                </select>

                <label>Chữ trên thumbnail</label>
                <input value={chuThumbnail} onChange={e => setChuThumbnail(e.target.value)} />

                <div className="quickButtons">
                  <button onClick={randomNiceStyle}>🎲 Random đẹp</button>
                  <button onClick={aiSuggestStyle}>🤖 AI chọn style</button>
                  <button onClick={topText}>⬆️ Trên</button>
                  <button onClick={centerText}>🎯 Giữa</button>
                  <button onClick={bottomText}>⬇️ Dưới</button>
                </div>

                <div className="composeGrid two">
                  <div className="rangeBox"><label>Vị trí X: {textX - 640 > 0 ? '+' : ''}{textX - 640}</label><input type="range" min="0" max="1280" value={textX} onChange={e => setTextX(Number(e.target.value))} /><div className="scaleMarks"><span>-640</span><span>0</span><span>+640</span></div></div>
                  <div className="rangeBox"><label>Vị trí Y: {textY - 360 > 0 ? '+' : ''}{textY - 360}</label><input type="range" min="0" max="720" value={textY} onChange={e => setTextY(Number(e.target.value))} /><div className="scaleMarks"><span>-360</span><span>0</span><span>+360</span></div></div>
                  <div><label>Cỡ chữ: {fontSize}</label><input type="range" min="34" max="150" value={fontSize} onChange={e => setFontSize(Number(e.target.value))} /></div>
                  <div><label>Làm tối nền: {Number(bgDim).toFixed(2)}</label><input type="range" min="0" max="0.55" step="0.01" value={bgDim} onChange={e => setBgDim(Number(e.target.value))} /></div>
                  <div><label>Màu chữ</label><input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} /></div>
                  <div><label>Màu viền</label><input type="color" value={strokeColor} onChange={e => setStrokeColor(e.target.value)} /></div>
                  <div><label>Độ dày viền: {strokeWidth}</label><input type="range" min="0" max="24" value={strokeWidth} onChange={e => setStrokeWidth(Number(e.target.value))} /></div>
                  <div><label>Đổ bóng: {shadowBlur}</label><input type="range" min="0" max="35" value={shadowBlur} onChange={e => setShadowBlur(Number(e.target.value))} /></div>
                </div>

                <label>Tên thương hiệu</label>
                <input value={brand} onChange={e => setBrand(e.target.value)} />
                <label className="check"><input type="checkbox" checked={showBrand} onChange={e => setShowBrand(e.target.checked)} /> Hiện badge thương hiệu</label>
                <div className="actions twoActions"><button onClick={preview}>👁️ Xem thử</button><button className="primary" onClick={exportPng}>💾 Xuất PNG</button></div>
              </div>
            </div>
            <p className="status">{status}</p>
          </section>
        </main>
      )}

      {tab === 'settings' && (
        <main>
          <section className="panel">
            <h2>👥 Quản lý Profile nhân vật</h2>
            <label>Chọn profile</label>
            <select value={editingProfileId} onChange={e => selectEditingProfile(e.target.value)}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <label>Tên profile</label>
            <input value={profileName} onChange={e => setProfileName(e.target.value)} />
            <label>Mô tả nhân vật</label>
            <textarea className="analysis mid" value={profileCharacters} onChange={e => setProfileCharacters(e.target.value)} />
            <label>Phong cách thương hiệu</label>
            <textarea className="analysis mid" value={profileBrand} onChange={e => setProfileBrand(e.target.value)} />
            <div className="actions"><button className="primary" onClick={saveProfile}>💾 Lưu Profile</button><button onClick={createProfile}>➕ Tạo mới</button><button onClick={duplicateProfile}>📑 Nhân bản</button><button className="danger" onClick={deleteProfile}>🗑️ Xóa</button></div>
          </section>
          <section className="panel">
            <h2>⚙️ Cài đặt</h2>
            <label>Gemini API Key dùng cho phân tích ảnh/video</label>
            <input type="password" value={geminiKey} onChange={e => setGeminiKey(e.target.value)} placeholder="AIza..." />
            <button className="primary wide" onClick={() => saveSettings()}>💾 Lưu cài đặt</button>
            <h2 className="sectionTitle">📚 Profile hiện có</h2>
            <div className="profileList">{profiles.map(p => <div className="profileCard" key={p.id}><strong>{p.name}</strong><span>{p.id === syncProfileId ? 'Đang dùng để đồng bộ' : 'Có thể chọn khi tạo prompt'}</span></div>)}</div>
            <p className="status">{status}</p>
          </section>
        </main>
      )}
    </div>
  );
}

