
const { app, BrowserWindow, shell, ipcMain, dialog, clipboard, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

const isDev = !app.isPackaged;

function getConfigPath() {
  return path.join(app.getPath('userData'), 'easy-thumbnail-studio-config.json');
}

function readConfig() {
  try {
    const p = getConfigPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(next) {
  const current = readConfig();
  const merged = { ...current, ...next };
  fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function getFontsDir() {
  const dir = path.join(app.getPath('userData'), 'fonts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setMenuBarVisibility(false);
  if (isDev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '../dist/index.html'));
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableGeminiError(err) {
  const msg = String(err?.message || err || '');
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('temporarily') ||
    msg.includes('overloaded')
  );
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


async function analyzeMediaWithGemini({ apiKey, base64, mimeType, mediaType, analyzeMode, preferredModel }) {
  if (!apiKey) throw new Error('Bạn cần nhập Gemini API Key trong tab Nhân vật / Cài đặt trước khi phân tích.');
  if (!base64) throw new Error('Bạn cần upload ảnh hoặc video trước khi phân tích.');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const isVideo = (mediaType === 'video') || String(mimeType || '').startsWith('video/');
  const mode = analyzeMode || 'fast';

  const fastPrompt = isVideo
    ? `Bạn là chuyên gia thumbnail YouTube.

Phân tích keyframe video này để tạo prompt thumbnail tương tự style.

Trả lời ngắn gọn bằng tiếng Việt theo cấu trúc:

## 1. Style chính
- Màu sắc:
- Ánh sáng:
- Bố cục:
- Cảm xúc:
- Vùng đặt text tốt nhất:

## 2. Công thức thumbnail
- Chủ thể:
- Text style:
- Điểm hút click:

## 3. Prompt Flow
Viết prompt tiếng Anh sạch, ngắn, dùng cho Google Labs Flow để tạo thumbnail 16:9 tương tự style.

## 4. Negative prompt
Viết negative prompt ngắn.`
    : `Bạn là chuyên gia thumbnail YouTube.

Phân tích ảnh thumbnail/keyframe này để tạo prompt tương tự style.

Trả lời ngắn gọn bằng tiếng Việt theo cấu trúc:

## 1. Style chính
- Màu sắc:
- Ánh sáng:
- Bố cục:
- Cảm xúc:
- Vùng đặt text tốt nhất:

## 2. Công thức thumbnail
- Chủ thể:
- Text style:
- Điểm hút click:

## 3. Prompt Flow
Viết prompt tiếng Anh sạch, ngắn, dùng cho Google Labs Flow để tạo thumbnail 16:9 tương tự style.

## 4. Negative prompt
Viết negative prompt ngắn.`;

  const fullPrompt = isVideo
    ? `Bạn là chuyên gia thumbnail YouTube và visual branding.

Hãy phân tích video/keyframe mẫu này để tạo prompt thumbnail tương tự style, không copy y hệt.

Trả lời bằng tiếng Việt theo cấu trúc:

## 1. Style video
- Visual style
- Camera/framing
- Lighting
- Color grading
- Character/object vibe
- Niche/channel vibe

## 2. Công thức thumbnail có thể tái dùng
- Bố cục
- Cảm xúc
- Chủ thể chính
- Text style nếu có
- Điểm hút click

## 3. Gợi ý text thumbnail
- 5 lựa chọn ngắn, mạnh, dễ đọc

## 4. Prompt Flow
Viết prompt tiếng Anh sạch để tạo thumbnail tương tự style video này bằng Google Labs Flow. Prompt phải tập trung vào thumbnail 16:9, CTR, bố cục, màu sắc, cảm xúc.

## 5. Negative prompt
Viết negative prompt ngắn.

## 6. Gợi ý cải thiện
- Cách áp dụng style này cho kênh học tiếng Anh/podcast.`
    : `Bạn là chuyên gia thumbnail YouTube cho kênh học tiếng Anh.

Hãy phân tích ảnh thumbnail hoặc keyframe video này thật chi tiết bằng tiếng Việt.

Trả lời theo đúng cấu trúc sau:

## 1. Phong cách hình ảnh
- Mô tả style tổng thể
- Mức độ phù hợp với YouTube thumbnail

## 2. Bố cục
- Vị trí nhân vật/chủ thể
- Vị trí text
- Khoảng trống cho text
- Điểm nhìn chính

## 3. Ánh sáng và màu sắc
- Lighting
- Color palette
- Contrast
- Độ nổi bật trên màn hình nhỏ

## 4. Cảm xúc và tâm lý click
- Cảm xúc chính
- Curiosity gap
- Lý do người xem có thể click

## 5. Điểm mạnh
- Liệt kê ngắn gọn

## 6. Điểm cần cải thiện
- Liệt kê ngắn gọn

## 7. Prompt tái tạo style
Viết 1 prompt tiếng Anh sạch, có thể dùng cho Google Labs Flow để tạo thumbnail tương tự style này nhưng không copy y hệt.

## 8. Prompt giữ nhân vật đồng bộ
Viết thêm 1 đoạn prompt tiếng Anh để giữ nhân vật/brand consistency nếu người dùng upload ảnh reference.`;

  const prompt = mode === 'full' ? fullPrompt : fastPrompt;

  const fallbackModels = [];
  if (preferredModel) fallbackModels.push(preferredModel);
  for (const m of ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash']) {
    if (!fallbackModels.includes(m)) fallbackModels.push(m);
  }

  const response = await generateWithRetry(
    ai,
    (model) => ({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64, mimeType: mimeType || 'image/png' } },
          { text: prompt },
        ],
      },
    }),
    fallbackModels
  );

  const text =
    response?.text ||
    response?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') ||
    '';

  if (!text.trim()) throw new Error('Gemini không trả kết quả phân tích.');
  return { text, modelUsed: response.__modelUsed, mode };
}

ipcMain.handle('config:get', () => readConfig());
ipcMain.handle('config:save', (_, cfg) => saveConfig(cfg || {}));

ipcMain.handle('open-external', async (_, url) => {
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('copy-text', async (_, text) => {
  clipboard.writeText(text || '');
  return true;
});

ipcMain.handle('save-text', async (_, { defaultPath, content }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultPath || 'thumbnail-prompt.txt',
    filters: [{ name: 'Text', extensions: ['txt'] }]
  });
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, content || '', 'utf8');
  return true;
});

ipcMain.handle('save-image', async (_, { defaultPath, dataUrl }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: defaultPath || 'easy-thumbnail.png',
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePath) return false;
  const base64 = String(dataUrl || '').replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
  return true;
});

ipcMain.handle('font:import', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Chọn font chữ',
    properties: ['openFile'],
    filters: [{ name: 'Font', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
  });
  if (result.canceled || !result.filePaths?.[0]) return null;
  const src = result.filePaths[0];
  const ext = path.extname(src);
  const baseName = path.basename(src, ext).replace(/[^a-zA-Z0-9_-]/g, '-');
  const dest = path.join(getFontsDir(), `${Date.now()}-${baseName}${ext}`);
  fs.copyFileSync(src, dest);
  const url = `file://${dest.replace(/\\/g, '/')}`;
  return { name: baseName, path: dest, url };
});


async function suggestTextStyleWithGemini({ apiKey, base64, mimeType, titleText, topic, brandProfile }) {
  if (!apiKey) throw new Error('Bạn cần nhập Gemini API Key trong tab Nhân vật / Cài đặt trước khi dùng AI chọn style.');
  if (!base64) throw new Error('Bạn cần import ảnh nền trước khi dùng AI chọn style.');

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `Bạn là chuyên gia thiết kế thumbnail YouTube.

Hãy phân tích ảnh nền này và chọn thông số text overlay phù hợp nhất.

Trả lời CHỈ bằng JSON hợp lệ, không markdown, không giải thích.

Yêu cầu JSON:
{
  "analysis": "phân tích ảnh ngắn bằng tiếng Việt, nêu vùng nên đặt text và lý do",
  "fontRecommendation": {
    "primary": "tên font tốt nhất, có thể là font ngoài app như Anton, Bangers, Bebas Neue, Montserrat ExtraBold, SVN-Gilroy, Baloo 2...",
    "fallbackInApp": "một trong [\"Arial Black\",\"Impact\",\"Arial\",\"Verdana\",\"Tahoma\",\"Segoe UI\"]",
    "searchKeyword": "từ khóa để người dùng tìm tải font, ví dụ: Anton font Vietnamese download",
    "reason": "vì sao font này hợp ảnh"
  },
  "textX": number từ 120 đến 1160,
  "textY": number từ 100 đến 620,
  "fontSize": number từ 48 đến 120,
  "textColor": mã hex,
  "strokeColor": mã hex,
  "strokeWidth": number từ 4 đến 18,
  "shadowBlur": number từ 6 đến 30,
  "bgDim": number từ 0 đến 0.35,
  "reason": "giải thích ngắn bằng tiếng Việt"
}

Context:
- Text thumbnail: ${titleText || ''}
- Topic: ${topic || ''}
- Brand/style: ${brandProfile || ''}

Nguyên tắc:
- Text phải nổi bật trên mobile.
- Không che mặt nhân vật chính nếu có.
- Ưu tiên vùng ít chi tiết để đặt text.
- Nếu nền sáng, chọn viền tối.
- Nếu nền tối, chọn chữ sáng.
- Style phải hợp thumbnail YouTube.
- Có thể gợi ý font ngoài app, ưu tiên font dày, vui, dễ đọc và hỗ trợ tiếng Việt nếu text có dấu.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [
        { inlineData: { data: base64, mimeType: mimeType || 'image/png' } },
        { text: prompt },
      ],
    },
  });

  const raw =
    response?.text ||
    response?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') ||
    '';

  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('AI không trả JSON hợp lệ: ' + cleaned.slice(0, 300));
  }
}


ipcMain.handle('media:analyze', async (_, payload) => analyzeMediaWithGemini(payload));
ipcMain.handle('style:suggest', async (_, payload) => suggestTextStyleWithGemini(payload));

ipcMain.handle('check-update', async () => {
  if (isDev) return { ok: true, message: 'Bạn đang dùng bản mới nhất.' };
  try {
    await autoUpdater.checkForUpdatesAndNotify();
    return { ok: true, message: 'Đã kiểm tra cập nhật. Nếu có bản mới, app sẽ tự thông báo.' };
  } catch {
    return { ok: false, message: 'Bạn đang dùng bản mới nhất hoặc chưa cấu hình máy chủ cập nhật.' };
  }
});

app.whenReady().then(createWindow);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
