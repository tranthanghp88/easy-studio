const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (error) {
  console.warn('[auto-update] electron-updater unavailable:', error?.message || error);
}

const isDev = !app.isPackaged;

let mainWindow = null;
let updaterStatus = { status: 'idle', message: '' };
let voiceBackendProcess = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortInUse(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (value) => {
      try { socket.destroy(); } catch {}
      resolve(value);
    };
    socket.setTimeout(800);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

function getVoiceProjectRoot() {
  if (isDev) {
    return path.join(__dirname, '..', 'src', 'apps', 'easy-voice-video');
  }

  // In packaged builds, run the local Express backend from app.asar.unpacked.
  // Spawning a Node/Electron child process from inside app.asar is fragile on Windows
  // and can silently exit, leaving http://127.0.0.1:3030 unavailable.
  const unpackedRoot = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'src',
    'apps',
    'easy-voice-video'
  );
  if (fs.existsSync(path.join(unpackedRoot, 'server', 'index.mjs'))) return unpackedRoot;

  // Fallback for older builds/debug builds.
  const packagedRoot = path.join(app.getAppPath(), 'src', 'apps', 'easy-voice-video');
  if (fs.existsSync(path.join(packagedRoot, 'server', 'index.mjs'))) return packagedRoot;

  return path.join(process.resourcesPath || path.join(__dirname, '..'), 'src', 'apps', 'easy-voice-video');
}

function getVoiceServerEntry() {
  return path.join(getVoiceProjectRoot(), 'server', 'index.mjs');
}

async function startVoiceBackend() {
  if (voiceBackendProcess && !voiceBackendProcess.killed) return;

  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 3030);

  if (await isPortInUse(port, host)) {
    console.log(`[voice-backend] already running at http://${host}:${port}`);
    return;
  }

  const serverEntry = getVoiceServerEntry();
  if (!fs.existsSync(serverEntry)) {
    console.warn(`[voice-backend] server entry not found: ${serverEntry}`);
    return;
  }

  const voiceProjectRoot = getVoiceProjectRoot();
  console.log(`[voice-backend] starting serverEntry=${serverEntry}`);
  console.log(`[voice-backend] cwd=${voiceProjectRoot}`);

  voiceBackendProcess = spawn(process.execPath, [serverEntry], {
    cwd: voiceProjectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: host,
      ELECTRON_RUN_AS_NODE: '1'
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  voiceBackendProcess.stdout?.on('data', (data) => {
    const msg = String(data).trim();
    if (msg) console.log(`[voice-backend] ${msg}`);
  });

  voiceBackendProcess.stderr?.on('data', (data) => {
    const msg = String(data).trim();
    if (msg) console.warn(`[voice-backend:error] ${msg}`);
  });

  voiceBackendProcess.on('exit', (code, signal) => {
    console.log(`[voice-backend] exited code=${code} signal=${signal}`);
    voiceBackendProcess = null;
  });

  // Give the local Express server a little time to boot before the UI starts calling it.
  for (let i = 0; i < 10; i += 1) {
    if (await isPortInUse(port, host)) {
      console.log(`[voice-backend] ready at http://${host}:${port}`);
      return;
    }
    await wait(300);
  }

  console.warn(`[voice-backend] started but port ${port} is not ready yet`);
}

function stopVoiceBackend() {
  if (voiceBackendProcess && !voiceBackendProcess.killed) {
    try { voiceBackendProcess.kill(); } catch {}
  }
  voiceBackendProcess = null;
}



function sendUpdateStatus(payload = {}) {
  updaterStatus = { ...updaterStatus, ...payload };
  try {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('update-status', updaterStatus);
    });
  } catch {}
  return updaterStatus;
}


function friendlyUpdateErrorMessage(error) {
  const raw = error?.message || String(error || '');
  if (raw.includes('your-domain.com') || raw.includes('latest.yml') || raw.includes('YAMLException')) {
    return 'Cấu hình update chưa trỏ đúng GitHub Releases hoặc file latest.yml trên Release chưa hợp lệ.';
  }
  if (raw.includes('404') || raw.includes('Not Found')) {
    return 'Không tìm thấy bản cập nhật trên GitHub Releases. Hãy kiểm tra tag release và file latest.yml.';
  }
  if (raw.includes('net::ERR') || raw.includes('ENOTFOUND') || raw.includes('ECONNREFUSED')) {
    return 'Không kết nối được máy chủ cập nhật. Hãy kiểm tra mạng hoặc GitHub Releases.';
  }
  return raw.length > 220 ? raw.slice(0, 220) + '...' : raw;
}

function setupAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.autoDownload = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking', message: 'Đang kiểm tra bản cập nhật.' }));
  autoUpdater.on('update-available', (info) => sendUpdateStatus({ status: 'available', message: 'Đang tải bản cập nhật.', info }));
  autoUpdater.on('update-not-available', () => sendUpdateStatus({ status: 'none', message: 'Không có bản cập nhật mới.' }));
  autoUpdater.on('download-progress', (progress) => sendUpdateStatus({
    status: 'downloading',
    message: 'Đang tải bản cập nhật.',
    progress
  }));
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus({ status: 'installing', readyToInstall: true, message: 'Đang cài đặt bản cập nhật.', info });
    setTimeout(() => {
      try { autoUpdater.quitAndInstall(false, true); } catch (error) {
        sendUpdateStatus({ status: 'error', message: error?.message || 'Không thể tự cài bản cập nhật.' });
      }
    }, 1500);
  });
  autoUpdater.on('error', (error) => sendUpdateStatus({ status: 'error', message: friendlyUpdateErrorMessage(error) || 'Không kiểm tra được cập nhật.' }));
}

async function checkForEasyStudioUpdates() {
  if (isDev) {
    return sendUpdateStatus({ status: 'dev', message: 'Đang chạy bản dev. Auto update chỉ hoạt động sau khi build installer.' });
  }
  if (!autoUpdater) {
    return sendUpdateStatus({ status: 'unavailable', message: 'electron-updater chưa sẵn sàng.' });
  }
  const result = await autoUpdater.checkForUpdates();
  return { ok: true, ...updaterStatus, message: updaterStatus?.message || 'Đã kiểm tra cập nhật.', result: result ? { updateInfo: result.updateInfo } : null };
}

async function downloadEasyStudioUpdate() {
  if (isDev) return sendUpdateStatus({ status: 'dev', message: 'Bản dev không tải update.' });
  if (!autoUpdater) return sendUpdateStatus({ status: 'unavailable', message: 'electron-updater chưa sẵn sàng.' });
  await autoUpdater.downloadUpdate();
  return { ok: true, ...updaterStatus };
}

function installEasyStudioUpdate() {
  if (!autoUpdater) return { ok: false, message: 'electron-updater chưa sẵn sàng.' };
  autoUpdater.quitAndInstall(false, true);
  return { ok: true };
}


function getThumbnailSettingsPath() {
  return path.join(app.getPath('userData'), 'easy-studio-thumbnail-settings.json');
}

function defaultThumbnailSettings() {
  return {
    geminiApiKey: '',
    conceptModel: 'gemini-2.5-flash',
    imageModel: 'gemini-2.5-flash-image-preview',
    updateFeedUrl: '',
    defaultChannelName: 'Easy English Channel'
  };
}

function readThumbnailSettings() {
  try {
    const file = getThumbnailSettingsPath();
    if (!fs.existsSync(file)) return defaultThumbnailSettings();
    return { ...defaultThumbnailSettings(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (_) {
    return defaultThumbnailSettings();
  }
}

function saveThumbnailSettings(next) {
  const merged = { ...readThumbnailSettings(), ...(next || {}) };
  fs.mkdirSync(path.dirname(getThumbnailSettingsPath()), { recursive: true });
  fs.writeFileSync(getThumbnailSettingsPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function fallbackThumbnailConcepts(payload = {}) {
  const channelName = payload.channelName || 'Easy English Channel';
  const topic = String(payload.topic || '').split('\n')[0].replace(/^Video topic:\s*/i, '').trim() || 'Natural English Conversation';
  const basePrompt = `YouTube thumbnail, 16:9, clean modern podcast illustration, ${channelName}, topic: ${topic}, friendly English learning vibe, high contrast, clear space for large readable text, professional creator tool output, no watermark, no logo.`;
  return {
    bestHook: 'Sound More Natural',
    scoreReason: 'Bản fallback offline đã tạo concept mẫu để app không bị đứt flow. Nhập Gemini API Key trong Settings để tạo concept AI thật.',
    concepts: [
      {
        title: 'Natural Talk Hook',
        thumbnailText: 'SOUND NATURAL',
        emotion: 'Friendly, confident, curious',
        composition: 'Two podcast hosts with microphones, bold text in the center, clean dark teal background.',
        imagePrompt: basePrompt,
        geminiImagePrompt: basePrompt,
        leonardoPrompt: `${basePrompt}, vibrant YouTube thumbnail, studio lighting, sharp vector-realistic hybrid style`,
        whyItWorks: 'Text ngắn, rõ, đánh đúng mong muốn của người học tiếng Anh.'
      },
      {
        title: 'Small Talk Problem',
        thumbnailText: 'WHAT DO I SAY?',
        emotion: 'Awkward but relatable',
        composition: 'One character confused, one character helpful, speech bubbles, bright accent color.',
        imagePrompt: `${basePrompt}, awkward small talk moment, expressive faces`,
        geminiImagePrompt: `${basePrompt}, awkward small talk moment, expressive faces`,
        leonardoPrompt: `${basePrompt}, expressive characters, clean vector thumbnail`,
        whyItWorks: 'Tạo curiosity gap mạnh và dễ click.'
      },
      {
        title: 'Before After English',
        thumbnailText: 'STOP SOUNDING STIFF',
        emotion: 'Transformation, improvement',
        composition: 'Split-screen before/after, left awkward, right natural and confident.',
        imagePrompt: `${basePrompt}, split screen before after, English learner transformation`,
        geminiImagePrompt: `${basePrompt}, split screen before after, English learner transformation`,
        leonardoPrompt: `${basePrompt}, split screen before after, high CTR thumbnail`,
        whyItWorks: 'Before/after giúp viewer hiểu lợi ích ngay.'
      },
      {
        title: 'Easy Phrase Pack',
        thumbnailText: 'REAL PHRASES',
        emotion: 'Useful, simple, practical',
        composition: 'Big phrase cards floating around two friendly hosts.',
        imagePrompt: `${basePrompt}, phrase cards, practical English, clean layout`,
        geminiImagePrompt: `${basePrompt}, phrase cards, practical English, clean layout`,
        leonardoPrompt: `${basePrompt}, floating phrase cards, clean educational thumbnail`,
        whyItWorks: 'Hứa hẹn nội dung thực dụng, dễ học.'
      },
      {
        title: 'Podcast Conversation',
        thumbnailText: 'SPEAK LIKE THIS',
        emotion: 'Warm, conversational, inviting',
        composition: 'Podcast table, two hosts, neon channel sign, text area on the left.',
        imagePrompt: `${basePrompt}, cozy podcast room, neon sign, professional microphones`,
        geminiImagePrompt: `${basePrompt}, cozy podcast room, neon sign, professional microphones`,
        leonardoPrompt: `${basePrompt}, cozy podcast studio, neon Easy English Channel sign`,
        whyItWorks: 'Phù hợp brand podcast và dễ nhận diện kênh.'
      }
    ]
  };
}

async function generateThumbnailConcepts(payload = {}) {
  const settings = readThumbnailSettings();
  const apiKey = settings.geminiApiKey;
  if (!apiKey) return fallbackThumbnailConcepts(payload);

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Create 5 YouTube thumbnail concepts for an English learning channel. Return ONLY valid JSON with this shape: {"bestHook":"...","scoreReason":"...","concepts":[{"title":"...","thumbnailText":"...","emotion":"...","composition":"...","imagePrompt":"...","geminiImagePrompt":"...","leonardoPrompt":"...","whyItWorks":"..."}]}. Context: ${JSON.stringify(payload)}`;
    const response = await ai.models.generateContent({
      model: settings.conceptModel || 'gemini-2.5-flash',
      contents: prompt
    });
    const text = response?.text || response?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || '';
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.concepts?.length) throw new Error('Gemini returned empty concepts');
    return parsed;
  } catch (err) {
    const fallback = fallbackThumbnailConcepts(payload);
    fallback.scoreReason = `Gemini concept lỗi nên app dùng fallback để không đứt flow. Lỗi: ${err?.message || err}`;
    return fallback;
  }
}

function svgPlaceholderBase64(prompt) {
  const safe = String(prompt || 'Easy Thumbnail Studio').replace(/[<>&]/g, '').slice(0, 140);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#0f172a"/><stop offset="0.55" stop-color="#2563eb"/><stop offset="1" stop-color="#facc15"/></linearGradient></defs><rect width="1280" height="720" fill="url(#g)"/><circle cx="1060" cy="160" r="110" fill="rgba(255,255,255,.18)"/><rect x="80" y="80" width="1120" height="560" rx="42" fill="rgba(0,0,0,.28)" stroke="rgba(255,255,255,.35)"/><text x="110" y="220" fill="#fff" font-family="Arial, sans-serif" font-size="76" font-weight="900">Easy Thumbnail</text><text x="112" y="315" fill="#dbeafe" font-family="Arial, sans-serif" font-size="38" font-weight="700">Preview placeholder</text><foreignObject x="110" y="365" width="1000" height="170"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;color:#fff;font-size:28px;line-height:1.35;font-weight:700">${safe}</div></foreignObject></svg>`;
  return Buffer.from(svg).toString('base64');
}

async function generateThumbnailImage(payload = {}) {
  const settings = readThumbnailSettings();
  const apiKey = settings.geminiApiKey;
  const prompt = payload.prompt || 'Easy Thumbnail Studio';
  if (!apiKey) return { base64: svgPlaceholderBase64(prompt), mimeType: 'image/svg+xml' };

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: settings.imageModel || 'gemini-2.5-flash-image-preview',
      contents: prompt
    });
    const parts = response?.candidates?.[0]?.content?.parts || [];
    const img = parts.find((p) => p.inlineData?.data);
    if (img?.inlineData?.data) return { base64: img.inlineData.data, mimeType: img.inlineData.mimeType || 'image/png' };
    return { base64: svgPlaceholderBase64(prompt), mimeType: 'image/svg+xml' };
  } catch (_) {
    return { base64: svgPlaceholderBase64(prompt), mimeType: 'image/svg+xml' };
  }
}

async function saveThumbnailImage(payload = {}) {
  const base64 = payload.base64;
  if (!base64) return { canceled: true };
  const result = await dialog.showSaveDialog({
    title: 'Save thumbnail',
    defaultPath: `${payload.fileName || 'easy-thumbnail'}.png`,
    filters: [{ name: 'Image', extensions: ['png', 'svg'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
  return { canceled: false, filePath: result.filePath };
}

function getLegacyThumbnailConfigPath() {
  return path.join(app.getPath('userData'), 'easy-thumbnail-studio-config.json');
}

function readLegacyThumbnailConfig() {
  try {
    const p = getLegacyThumbnailConfigPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveLegacyThumbnailConfig(next) {
  const merged = { ...readLegacyThumbnailConfig(), ...(next || {}) };
  fs.mkdirSync(path.dirname(getLegacyThumbnailConfigPath()), { recursive: true });
  fs.writeFileSync(getLegacyThumbnailConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function getLegacyThumbnailFontsDir() {
  const dir = path.join(app.getPath('userData'), 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableGeminiError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand') || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('temporarily') || msg.includes('overloaded');
}

async function generateWithRetry(ai, requestFactory, modelList) {
  const delays = [1200, 2800, 5200];
  let lastError;
  for (const model of modelList) {
    for (let attempt = 0; attempt < delays.length; attempt++) {
      try {
        const response = await ai.models.generateContent(requestFactory(model));
        response.__modelUsed = model;
        response.__attempt = attempt + 1;
        return response;
      } catch (err) {
        lastError = err;
        if (!isRetryableGeminiError(err)) throw err;
        if (attempt < delays.length - 1) await sleep(delays[attempt]);
      }
    }
  }
  throw lastError;
}

async function analyzeMediaWithGemini(payload = {}) {
  const { apiKey, base64, mimeType, mediaType, analyzeMode, preferredModel } = payload;
  if (!apiKey) throw new Error('Bạn cần nhập Gemini API Key trong tab Nhân vật / Cài đặt trước khi phân tích.');
  if (!base64) throw new Error('Bạn cần upload ảnh hoặc video trước khi phân tích.');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const isVideo = (mediaType === 'video') || String(mimeType || '').startsWith('video/');
  const mode = analyzeMode || 'fast';

  const fastPrompt = isVideo
    ? `Bạn là chuyên gia thumbnail YouTube.\n\nPhân tích keyframe video này để tạo prompt thumbnail tương tự style.\n\nTrả lời ngắn gọn bằng tiếng Việt theo cấu trúc:\n\n## 1. Style chính\n- Màu sắc:\n- Ánh sáng:\n- Bố cục:\n- Cảm xúc:\n- Vùng đặt text tốt nhất:\n\n## 2. Công thức thumbnail\n- Chủ thể:\n- Text style:\n- Điểm hút click:\n\n## 3. Prompt Flow\nViết prompt tiếng Anh sạch, ngắn, dùng cho Google Labs Flow để tạo thumbnail 16:9 tương tự style.\n\n## 4. Negative prompt\nViết negative prompt ngắn.`
    : `Bạn là chuyên gia thumbnail YouTube.\n\nPhân tích ảnh thumbnail/keyframe này để tạo prompt tương tự style.\n\nTrả lời ngắn gọn bằng tiếng Việt theo cấu trúc:\n\n## 1. Style chính\n- Màu sắc:\n- Ánh sáng:\n- Bố cục:\n- Cảm xúc:\n- Vùng đặt text tốt nhất:\n\n## 2. Công thức thumbnail\n- Chủ thể:\n- Text style:\n- Điểm hút click:\n\n## 3. Prompt Flow\nViết prompt tiếng Anh sạch, ngắn, dùng cho Google Labs Flow để tạo thumbnail 16:9 tương tự style.\n\n## 4. Negative prompt\nViết negative prompt ngắn.`;

  const fullPrompt = isVideo
    ? `Bạn là chuyên gia thumbnail YouTube và visual branding.\n\nHãy phân tích video/keyframe mẫu này để tạo prompt thumbnail tương tự style, không copy y hệt.\n\nTrả lời bằng tiếng Việt theo cấu trúc:\n\n## 1. Style video\n- Visual style\n- Camera/framing\n- Lighting\n- Color grading\n- Character/object vibe\n- Niche/channel vibe\n\n## 2. Công thức thumbnail có thể tái dùng\n- Bố cục\n- Cảm xúc\n- Chủ thể chính\n- Text style nếu có\n- Điểm hút click\n\n## 3. Gợi ý text thumbnail\n- 5 lựa chọn ngắn, mạnh, dễ đọc\n\n## 4. Prompt Flow\nViết prompt tiếng Anh sạch để tạo thumbnail tương tự style video này bằng Google Labs Flow. Prompt phải tập trung vào thumbnail 16:9, CTR, bố cục, màu sắc, cảm xúc.\n\n## 5. Negative prompt\nViết negative prompt ngắn.\n\n## 6. Gợi ý cải thiện\n- Cách áp dụng style này cho kênh học tiếng Anh/podcast.`
    : `Bạn là chuyên gia thumbnail YouTube cho kênh học tiếng Anh.\n\nHãy phân tích ảnh thumbnail hoặc keyframe video này thật chi tiết bằng tiếng Việt.\n\nTrả lời theo đúng cấu trúc sau:\n\n## 1. Phong cách hình ảnh\n- Mô tả style tổng thể\n- Mức độ phù hợp với YouTube thumbnail\n\n## 2. Bố cục\n- Vị trí nhân vật/chủ thể\n- Vị trí text\n- Khoảng trống cho text\n- Điểm nhìn chính\n\n## 3. Ánh sáng và màu sắc\n- Lighting\n- Color palette\n- Contrast\n- Độ nổi bật trên màn hình nhỏ\n\n## 4. Cảm xúc và tâm lý click\n- Cảm xúc chính\n- Curiosity gap\n- Lý do người xem có thể click\n\n## 5. Điểm mạnh\n- Liệt kê ngắn gọn\n\n## 6. Điểm cần cải thiện\n- Liệt kê ngắn gọn\n\n## 7. Prompt tái tạo style\nViết 1 prompt tiếng Anh sạch, có thể dùng cho Google Labs Flow để tạo thumbnail tương tự style này nhưng không copy y hệt.\n\n## 8. Prompt giữ nhân vật đồng bộ\nViết thêm 1 đoạn prompt tiếng Anh để giữ nhân vật/brand consistency nếu người dùng upload ảnh reference.`;

  const prompt = mode === 'full' ? fullPrompt : fastPrompt;
  const fallbackModels = [];
  if (preferredModel) fallbackModels.push(preferredModel);
  for (const m of ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash']) {
    if (!fallbackModels.includes(m)) fallbackModels.push(m);
  }

  const response = await generateWithRetry(ai, (model) => ({
    model,
    contents: { parts: [{ inlineData: { data: base64, mimeType: mimeType || 'image/png' } }, { text: prompt }] },
  }), fallbackModels);

  const text = response?.text || response?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
  if (!text.trim()) throw new Error('Gemini không trả kết quả phân tích.');
  return { text, modelUsed: response.__modelUsed, mode };
}

async function suggestTextStyleWithGemini(payload = {}) {
  const { apiKey, base64, mimeType, titleText, topic, brandProfile } = payload;
  if (!apiKey) throw new Error('Bạn cần nhập Gemini API Key trong tab Nhân vật / Cài đặt trước khi dùng AI chọn style.');
  if (!base64) throw new Error('Bạn cần import ảnh nền trước khi dùng AI chọn style.');
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const prompt = `Bạn là chuyên gia thiết kế thumbnail YouTube.\n\nHãy phân tích ảnh nền này và chọn thông số text overlay phù hợp nhất.\n\nTrả lời CHỈ bằng JSON hợp lệ, không markdown, không giải thích.\n\nYêu cầu JSON:\n{\n  "analysis": "phân tích ảnh ngắn bằng tiếng Việt, nêu vùng nên đặt text và lý do",\n  "fontRecommendation": {\n    "primary": "tên font tốt nhất",\n    "fallbackInApp": "một trong [Arial Black, Impact, Arial, Verdana, Tahoma, Segoe UI]",\n    "searchKeyword": "từ khóa tìm tải font",\n    "reason": "vì sao font này hợp ảnh"\n  },\n  "textX": 120,\n  "textY": 160,\n  "fontSize": 88,\n  "textColor": "#ffffff",\n  "strokeColor": "#000000",\n  "strokeWidth": 10,\n  "shadowBlur": 18,\n  "bgDim": 0.12,\n  "reason": "giải thích ngắn bằng tiếng Việt"\n}\n\nContext:\n- Text thumbnail: ${titleText || ''}\n- Topic: ${topic || ''}\n- Brand/style: ${brandProfile || ''}`;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [{ inlineData: { data: base64, mimeType: mimeType || 'image/png' } }, { text: prompt }] },
  });
  const raw = response?.text || response?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || '';
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI không trả JSON hợp lệ: ' + cleaned.slice(0, 300));
  }
}

function safeHandle(channel, handler) {
  try {
    ipcMain.handle(channel, handler);
  } catch (_) {}
}

function registerTemporaryShellHandlers() {
  safeHandle('settings:load', async () => ({}));
  safeHandle('settings:save', async (_event, data) => data || {});
  safeHandle('settings:test-provider', async () => ({ ok: false, message: 'Handler thật sẽ nối sau.' }));

  safeHandle('app:get-version', async () => app.getVersion());
  safeHandle('app:get-update-status', async () => updaterStatus);
  safeHandle('app:check-for-updates', async () => checkForEasyStudioUpdates());
  safeHandle('app:download-update', async () => downloadEasyStudioUpdate());
  safeHandle('app:quit-and-install-update', async () => installEasyStudioUpdate());
  safeHandle('app:install-update', async () => installEasyStudioUpdate());

  safeHandle('file:list-laugh-assets', async () => []);
  safeHandle('file:list-bgm-assets', async () => []);
  safeHandle('file:import-laugh-assets', async () => []);
  safeHandle('file:import-bgm-assets', async () => []);
  safeHandle('file:delete-laugh-asset', async () => ({ ok: true }));
  safeHandle('file:delete-bgm-asset', async () => ({ ok: true }));
  safeHandle('file:open-laugh-assets-folder', async () => ({ ok: true }));

  safeHandle('thumbnail:settings:get', async () => readThumbnailSettings());
  safeHandle('thumbnail:settings:save', async (_event, data) => saveThumbnailSettings(data || {}));
  safeHandle('thumbnail:concepts:generate', async (_event, payload) => generateThumbnailConcepts(payload || {}));
  safeHandle('thumbnail:image:generate', async (_event, payload) => generateThumbnailImage(payload || {}));
  safeHandle('thumbnail:image:save', async (_event, payload) => saveThumbnailImage(payload || {}));
  safeHandle('thumbnail:open-external', async (_event, url) => {
    if (url) await shell.openExternal(url);
    return true;
  });



  // Legacy Easy Thumbnail app handlers from the standalone thumbnail app.
  safeHandle('config:get', async () => readLegacyThumbnailConfig());
  safeHandle('config:save', async (_event, cfg) => saveLegacyThumbnailConfig(cfg || {}));
  safeHandle('open-external', async (_event, url) => {
    if (url) await shell.openExternal(url);
    return true;
  });
  safeHandle('copy-text', async (_event, text) => {
    clipboard.writeText(text || '');
    return true;
  });
  safeHandle('save-text', async (_event, payload = {}) => {
    const result = await dialog.showSaveDialog({
      defaultPath: payload.defaultPath || 'thumbnail-prompt.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, payload.content || '', 'utf8');
    return true;
  });
  safeHandle('save-image', async (_event, payload = {}) => {
    const result = await dialog.showSaveDialog({
      defaultPath: payload.defaultPath || 'easy-thumbnail.png',
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    });
    if (result.canceled || !result.filePath) return false;
    const base64 = String(payload.dataUrl || '').replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
    return true;
  });
  safeHandle('font:import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Chọn font chữ',
      properties: ['openFile'],
      filters: [{ name: 'Font', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    const src = result.filePaths[0];
    const ext = path.extname(src);
    const baseName = path.basename(src, ext).replace(/[^a-zA-Z0-9_-]/g, '-');
    const dest = path.join(getLegacyThumbnailFontsDir(), `${Date.now()}-${baseName}${ext}`);
    fs.copyFileSync(src, dest);
    const url = `file://${dest.replace(/\\/g, '/')}`;
    return { name: baseName, path: dest, url };
  });
  safeHandle('media:analyze', async (_event, payload) => analyzeMediaWithGemini(payload || {}));
  safeHandle('style:suggest', async (_event, payload) => suggestTextStyleWithGemini(payload || {}));
  safeHandle('check-update', async () => checkForEasyStudioUpdates());

  safeHandle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled) return null;
    return result.filePaths[0];
  });
  safeHandle('dialog:select-audio-file', async () => null);
  safeHandle('dialog:select-audio-files', async () => []);
  safeHandle('dialog:select-video-files', async () => []);
  safeHandle('dialog:select-image-file', async () => null);
  safeHandle('file:read-audio-file', async () => null);
  safeHandle('file:save-audio', async () => ({ ok: false, error: 'Handler thật sẽ nối sau.' }));
  safeHandle('file:open-folder-path', async (_event, payload) => {
    const target = typeof payload === 'string' ? payload : payload?.path || payload?.folderPath;
    if (target) await shell.openPath(target);
    return true;
  });
  safeHandle('file:read-base64', async () => null);
  safeHandle('file:convert-waveform-video', async () => ({ ok: false, error: 'Handler thật sẽ nối sau.' }));
  safeHandle('file:compose-final-media', async () => ({ ok: false, error: 'Handler thật sẽ nối sau.' }));
  safeHandle('file:merge-video-files', async () => ({ ok: false, error: 'Handler thật sẽ nối sau.' }));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    title: 'Easy Studio',
    backgroundColor: '#f5f8ff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = win;
  try {
    const iconPath = path.join(__dirname, '..', 'build', 'icons', 'easy-studio.ico');
    if (fs.existsSync(iconPath)) win.setIcon(iconPath);
  } catch {}

  win.setMenuBarVisibility(false);

  win.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase();
    if ((input.control && input.shift && (key === 'i' || key === 'k')) || key === 'f12') {
      event.preventDefault();
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
      else win.webContents.openDevTools({ mode: 'detach' });
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}


function registerEasyStudioEssentialHandlers() {
  const fsp = fs.promises;
  const forceHandle = (channel, handler) => {
    try { ipcMain.removeHandler(channel); } catch {}
    try { ipcMain.handle(channel, handler); }
    catch (error) { console.warn(`[easy-studio-ipc] cannot register ${channel}:`, error?.message || error); }
  };

  // Voice folder picker. Voice app accepts either string or { path }.
  forceHandle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true };
    return { canceled: false, path: result.filePaths[0], folderPath: result.filePaths[0], filePath: result.filePaths[0] };
  });

  forceHandle('easy-studio:select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return result.filePaths[0];
  });

  forceHandle('easy-studio:open-path', async (_event, targetPath) => {
    if (!targetPath) return false;
    await shell.openPath(targetPath);
    return true;
  });

  forceHandle('easy-studio:set-active-app', async (_event, payload = {}) => {
    const title = payload?.title || 'Easy Studio';
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win) {
      win.setTitle(title);
      try {
        const iconByApp = {
          home: 'easy-studio.ico',
          script: 'easy-script.ico',
          'voice-video': 'easy-voice-video.ico',
          thumbnail: 'easy-thumbnail.ico',
          'easy-voice-viet': 'easy-voice-viet.ico'
        };
        const iconFile = iconByApp[payload?.appId] || 'easy-studio.ico';
        const iconPath = path.join(__dirname, '..', 'build', 'icons', iconFile);
        if (fs.existsSync(iconPath)) win.setIcon(iconPath);
      } catch {}
    }
    return { ok: true };
  });

  // Script file/project helpers. These are deliberately force-registered because old app handlers
  // sometimes fail during shell integration if their own Electron main is no longer used.
  forceHandle('script:import-text', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Text / Markdown', extensions: ['txt', 'md'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
    const text = await fsp.readFile(result.filePaths[0], 'utf8');
    return { ok: true, text, path: result.filePaths[0] };
  });

  forceHandle('script:save-project', async (_event, payload) => {
    const defaultPath = path.join(app.getPath('documents'), 'easy-script-project.json');
    const result = await dialog.showSaveDialog({ defaultPath, filters: [{ name: 'JSON Project', extensions: ['json'] }] });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await fsp.writeFile(result.filePath, JSON.stringify(payload || {}, null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  });

  forceHandle('script:load-project', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON Project', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
    const raw = await fsp.readFile(result.filePaths[0], 'utf8');
    return { ok: true, data: JSON.parse(raw), path: result.filePaths[0] };
  });

  forceHandle('script:export-text', async (_event, payload = {}) => {
    const defaultPath = path.join(app.getPath('documents'), payload.filename || 'easy-script.txt');
    const result = await dialog.showSaveDialog({ defaultPath, filters: [{ name: 'Text', extensions: ['txt'] }] });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    await fsp.writeFile(result.filePath, payload.text || '', 'utf8');
    return { ok: true, path: result.filePath };
  });

  forceHandle('app:get-version', async () => app.getVersion());
  forceHandle('app:get-update-status', async () => updaterStatus);
  forceHandle('app:check-for-updates', async () => checkForEasyStudioUpdates());
  forceHandle('app:download-update', async () => downloadEasyStudioUpdate());
  forceHandle('app:quit-and-install-update', async () => installEasyStudioUpdate());
  forceHandle('app:install-update', async () => installEasyStudioUpdate());
  forceHandle('check-update', async () => checkForEasyStudioUpdates());

  forceHandle('debug:ping', async () => ({ ok: true, time: new Date().toISOString() }));
  forceHandle('debug:ipc-status', async () => {
    const expected = [
      'dialog:select-folder',
      'script:generate-step',
      'script:load-project',
      'script:save-project',
      'script:import-text',
      'script:export-text',
      'settings:load',
      'settings:save'
    ];
    const map = ipcMain._invokeHandlers;
    const status = {};
    for (const ch of expected) status[ch] = !!(map && map.has && map.has(ch));
    return { ok: true, status };
  });

  console.log('[easy-studio] essential IPC handlers registered');
  try {
    const status = {};
    const map = ipcMain._invokeHandlers;
    for (const ch of ['dialog:select-folder','script:generate-step','script:load-project','script:save-project','script:import-text','script:export-text']) {
      status[ch] = !!(map && map.has && map.has(ch));
    }
    console.log('[easy-studio] IPC status', JSON.stringify(status));
  } catch {}
}

function registerAppHandlers() {
  registerTemporaryShellHandlers();
  try { require('./script-handlers.cjs'); console.log('[easy-studio] easy-script handlers loaded'); }
  catch (err) { console.warn('[script-handlers] failed:', err?.message || err); }
  try { require('./voice-handlers.cjs').registerEasyVoiceHandlers?.(); console.log('[easy-studio] easy-voice handlers loaded'); }
  catch (err) { console.warn('[voice-handlers] failed:', err?.message || err); }
  registerEasyStudioEssentialHandlers();
  try { require('./easy-voice-viet-handlers.cjs').registerEasyVoiceVietHandlers?.(); console.log('[easy-studio] easy-voice-viet handlers loaded'); }
  catch (err) { console.warn('[easy-voice-viet-handlers] failed:', err?.message || err); }
}

app.whenReady().then(async () => {
  setupAutoUpdater();
  registerAppHandlers();
  await startVoiceBackend();
  createWindow();

  // Auto update chỉ chạy ở bản đã build/cài đặt.
  // Dev mode sẽ không tự check để tránh báo lỗi khi chạy npm run dev.
  if (!isDev && autoUpdater) {
    setTimeout(() => {
      checkForEasyStudioUpdates().catch((error) => {
        sendUpdateStatus({
          status: 'error',
          message: error?.message || 'Không kiểm tra được cập nhật.'
        });
      });
    }, 3000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopVoiceBackend();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
