const { app, BrowserWindow, ipcMain, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');

const DEV_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5188';
const isDev = !app.isPackaged;
function resolveIconPath() {
  const candidates = [
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(process.resourcesPath || '', 'icon.ico'),
    path.join(__dirname, 'icon.ico')
  ];

  return candidates.find(file => {
    try {
      return file && fs.existsSync(file);
    } catch {
      return false;
    }
  }) || path.join(__dirname, '..', 'build', 'icon.ico');
}

const iconPath = resolveIconPath();

if (process.platform === 'win32') {
  app.setAppUserModelId('com.easy.storycleaner');
}

function getRendererIndexPath() {
  // Works in dev source, unpacked build, and packaged asar.
  const candidates = [
    path.join(app.getAppPath(), 'dist', 'index.html'),
    path.join(__dirname, '..', 'dist', 'index.html'),
    path.join(process.resourcesPath || '', 'app.asar', 'dist', 'index.html'),
    path.join(process.resourcesPath || '', 'dist', 'index.html')
  ];

  for (const file of candidates) {
    try {
      if (file && fs.existsSync(file)) return file;
    } catch {}
  }

  return path.join(app.getAppPath(), 'dist', 'index.html');
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const windowIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: 'Story Cleaner',
    backgroundColor: '#f8fafc',
    icon: windowIcon || iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    const indexPath = getRendererIndexPath();
    win.loadFile(indexPath).catch(err => {
      console.error('[Story Cleaner] loadFile failed:', err, indexPath);
    });
  }

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Story Cleaner] Renderer load failed:', {
      errorCode,
      errorDescription,
      validatedURL,
      isDev,
      appPath: app.getAppPath(),
      dirname: __dirname,
      resourcesPath: process.resourcesPath
    });
  });
}

function normalizeText(text = '') {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractWithCheerio(html, url) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe, svg, canvas, form, button, input, select, textarea, nav, footer, header, aside, .ads, .advert, .advertisement, .banner, .comment, .comments, #comments, .share, .social, .related').remove();

  const title =
    $('h1').first().text().trim() ||
    $('.chapter-title').first().text().trim() ||
    $('.entry-title').first().text().trim() ||
    $('title').first().text().trim() ||
    'Chương mới';

  const selectors = [
    '#chapter-content', '.chapter-content', '.chapter-c', '.chapter-cnt', '.chapter-text', '.chapter-body', '.chapter-detail',
    '#content_chap', '#content-chap', '#content', '.content', '.entry-content', '.post-content', '.reading-content',
    'article', 'main'
  ];

  let best = '';
  let bestSelector = '';
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      const text = normalizeText($(el).text());
      if (text.length > best.length) {
        best = text;
        bestSelector = selector;
      }
    });
  }

  if (!best || best.length < 300) {
    const bodyText = normalizeText($('body').text());
    if (bodyText.length > best.length) {
      best = bodyText;
      bestSelector = 'body-fallback';
    }
  }

  return { title, text: best, selector: bestSelector, url };
}

async function extractWithReadability(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article) return null;
  return {
    title: article.title || 'Chương mới',
    text: normalizeText(article.textContent || ''),
    selector: 'readability',
    url
  };
}

ipcMain.handle('story:fetch-chapter', async (_, url) => {
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, error: 'Link không hợp lệ. Link cần bắt đầu bằng http:// hoặc https://.' };
  }

  try {
    const res = await axios.get(url, {
      timeout: 25000,
      maxRedirects: 5,
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
      }
    });

    const html = String(res.data || '');
    const a = extractWithCheerio(html, url);
    const b = await extractWithReadability(html, url).catch(() => null);
    const best = b && b.text.length > a.text.length * 0.65 ? b : a;

    if (!best.text || best.text.length < 80) {
      return { ok: false, error: 'Đã tải được trang nhưng không nhận diện được nội dung chương. Có thể web chặn hoặc nội dung render bằng JavaScript.' };
    }

    return { ok: true, ...best };
  } catch (err) {
    return { ok: false, error: err?.message || 'Không lấy được nội dung từ link.' };
  }
});


function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('').trim();
}

ipcMain.handle('story:gemini-list-models', async (_, payload = {}) => {
  const apiKey = String(payload.apiKey || '').trim();
  if (!apiKey) return { ok: false, status: 400, error: 'Thiếu Gemini API key.' };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await axios.get(url, {
      timeout: 30000,
      validateStatus: () => true
    });

    if (res.status < 200 || res.status >= 300) {
      const err = res.data?.error;
      return { ok: false, status: res.status, error: err?.message || `Gemini ListModels HTTP ${res.status}`, details: res.data };
    }

    const models = (res.data?.models || [])
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => ({
        name: String(m.name || '').replace(/^models\//, ''),
        displayName: m.displayName || String(m.name || '').replace(/^models\//, ''),
        description: m.description || '',
        inputTokenLimit: m.inputTokenLimit || 0,
        outputTokenLimit: m.outputTokenLimit || 0,
        supportedGenerationMethods: m.supportedGenerationMethods || []
      }))
      .filter(m => m.name && /^gemini-/i.test(m.name))
      .sort((a, b) => {
        const score = (x) => {
          const n = x.name.toLowerCase();
          if (n.includes('2.5-flash-lite')) return 0;
          if (n.includes('2.5-flash')) return 1;
          if (n.includes('2.0-flash')) return 2;
          if (n.includes('flash')) return 3;
          if (n.includes('pro')) return 4;
          return 9;
        };
        return score(a) - score(b) || a.name.localeCompare(b.name);
      });

    return { ok: true, models };
  } catch (err) {
    return { ok: false, status: 500, error: err?.message || 'Không gọi được Gemini ListModels.' };
  }
});


ipcMain.handle('story:gemini-generate', async (_, payload = {}) => {
  const apiKey = String(payload.apiKey || '').trim();
  const model = String(payload.model || 'gemini-1.5-flash').trim();
  const prompt = String(payload.prompt || '').trim();
  if (!apiKey) return { ok: false, status: 400, error: 'Thiếu Gemini API key.' };
  if (!prompt) return { ok: false, status: 400, error: 'Prompt rỗng.' };

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await axios.post(url, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 8192
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
    }, {
      timeout: 120000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true
    });

    if (res.status < 200 || res.status >= 300) {
      const err = res.data?.error;
      return { ok: false, status: res.status, error: err?.message || `Gemini HTTP ${res.status}`, details: res.data };
    }

    const text = extractGeminiText(res.data);
    if (!text) {
      const reason = res.data?.candidates?.[0]?.finishReason;
      return { ok: false, status: 500, error: reason ? `Gemini không trả text. Finish reason: ${reason}` : 'Gemini không trả text.' };
    }
    return { ok: true, text };
  } catch (err) {
    return { ok: false, status: 500, error: err?.message || 'Không gọi được Gemini API.' };
  }
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && fs.existsSync(iconPath)) {
    app.dock.setIcon(iconPath);
  }
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
