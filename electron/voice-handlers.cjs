const { WAVEBAR_RENDER_CONFIG } = require("../src/apps/easy-voice-video/electron/video/wavebar-config.cjs");
const { buildStyledAssContent } = require("../src/apps/easy-voice-video/electron/video/subtitle-layout.cjs");
const { processTimeline } = require("../src/apps/easy-voice-video/electron/video/timelineProcessorService.cjs");
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn } = require("child_process");
const net = require("net");

function safeHandle(channel, handler) {
  try { ipcMain.removeHandler(channel); } catch {}
  try { ipcMain.handle(channel, handler); } catch (error) {
    console.warn(`[ipc] cannot register ${channel}:`, error?.message || error);
  }
}


const APP_TITLE = "English Voice Generator";
const LEGACY_APP_DIR_NAMES = [
  "English Voice Generator",
  "Easy English Channel Voice Generator",
  "Easy-English-Channel",
  "English-generator",
  "English Generator"
];
const isDev = !app.isPackaged;

let mainWindow = null;
let backendProcess = null;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function mergeDirectoryContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir) || sourceDir === targetDir) return;
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      mergeDirectoryContents(sourcePath, targetPath);
      try {
        if (fs.existsSync(sourcePath) && fs.readdirSync(sourcePath).length === 0) {
          fs.rmSync(sourcePath, { recursive: true, force: true });
        }
      } catch {}
      continue;
    }

    if (!fs.existsSync(targetPath)) {
      try {
        fs.renameSync(sourcePath, targetPath);
      } catch {
        try { fs.copyFileSync(sourcePath, targetPath); } catch {}
      }
    }
  }
}

function configureUnifiedUserDataDir() {
  const appDataDir = app.getPath("appData");
  const targetDir = path.join(appDataDir, APP_TITLE);

  for (const legacyName of LEGACY_APP_DIR_NAMES) {
    const legacyDir = path.join(appDataDir, legacyName);
    if (legacyDir !== targetDir && fs.existsSync(legacyDir)) {
      mergeDirectoryContents(legacyDir, targetDir);
    }
  }

  app.setPath("userData", ensureDir(targetDir));
  return targetDir;
}

const UNIFIED_USER_DATA_DIR = configureUnifiedUserDataDir();

function log(message) {
  const line = `[${new Date().toISOString()}] [main] ${message}`;
  console.log(line);
  try {
    ensureDir(UNIFIED_USER_DATA_DIR);
    fs.appendFileSync(path.join(UNIFIED_USER_DATA_DIR, "main.log"), line + "\n", "utf8");
  } catch {}
}

function getProjectRoot() {
  return path.resolve(__dirname, "..");
}

function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function getRendererUrl() {
  return process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";
}

function getRendererFile() {
  return path.join(getProjectRoot(), "dist", "index.html");
}

function getServerEntry() {
  return path.join(getProjectRoot(), "server", "index.mjs");
}

function ensureNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round3(value) {
  return Math.round(ensureNumber(value, 0) * 1000) / 1000;
}

function safeText(value) {
  return String(value || "").trim();
}

function normalizeLaughSubtitleText(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const clean = raw
    .toLowerCase()
    .replace(/[“”"'`]/g, "")
    .replace(/[()\[\]{}]/g, " ")
    .replace(/[.!?,;:~…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const compact = clean.replace(/\s+/g, "");

  const isLaughWord = /^(?:ha){2,}h?$/.test(compact)
    || /^(?:he){2,}h?$/.test(compact)
    || /^(?:hi){2,}h?$/.test(compact)
    || /^(?:ho){2,}h?$/.test(compact)
    || compact === "lol"
    || compact === "laugh"
    || compact === "laughnaturally";

  if (clean === "[laugh]" || clean === "laugh" || clean === "laugh naturally" || compact === "[laugh]" || compact === "laughnaturally" || isLaughWord) {
    return "[laugh]";
  }

  return raw;
}

function quoteFilterPath(filePath) {
  return safeText(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function getOutputBase(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, parsed.name);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFilterPath(filePath) {
  return safeText(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function isPortInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const done = (value) => {
      try { socket.destroy(); } catch {}
      resolve(value);
    };

    socket.setTimeout(800);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}


const LAUGH_ASSET_FOLDER_NAME = "laugh-assets";
const LAUGH_ASSET_APP_FOLDER_NAME = "English Voice Generator";
const LAUGH_ASSET_LEGACY_APP_FOLDER_NAMES = [
  "Easy English Channel Voice Generator",
  "Easy-English-Channel",
  "English-generator",
  "English Generator"
];

function getAppDataRootDir() {
  return process.env.APPDATA || process.env.LOCALAPPDATA || app.getPath("userData");
}

function getLaughAssetCandidateDirs() {
  const appDataRoot = getAppDataRootDir();
  const dirs = [
    path.join(appDataRoot, LAUGH_ASSET_APP_FOLDER_NAME, LAUGH_ASSET_FOLDER_NAME),
    path.join(app.getPath("userData"), LAUGH_ASSET_FOLDER_NAME),
    ...LAUGH_ASSET_LEGACY_APP_FOLDER_NAMES.map((name) => path.join(appDataRoot, name, LAUGH_ASSET_FOLDER_NAME))
  ];
  return [...new Set(dirs.map((dir) => path.normalize(dir)))];
}

function getLaughAssetsRootDir() {
  return getLaughAssetCandidateDirs()[0];
}

function ensureLaughAssetsRootDir() {
  const dir = getLaughAssetsRootDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const role of ["A", "R", "BOTH"]) {
    fs.mkdirSync(path.join(dir, role), { recursive: true });
  }
  return dir;
}

function normalizeLaughType(value) {
  const v = safeText(value).toLowerCase();
  return ["short", "giggle", "long", "misc"].includes(v) ? v : "misc";
}

function normalizeLaughRole(value) {
  const v = safeText(value).toUpperCase();
  return v === "R" || v === "BOTH" ? v : "A";
}

function uniqueFilePath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  let index = 1;
  while (true) {
    const nextPath = path.join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`);
    if (!fs.existsSync(nextPath)) return nextPath;
    index += 1;
  }
}

function listLaughAssetsInternal() {
  const root = ensureLaughAssetsRootDir();
  const assets = [];
  const seen = new Set();
  const dirs = getLaughAssetCandidateDirs();

  for (const baseDir of dirs) {
    for (const role of ["A", "R", "BOTH"]) {
      const roleDir = path.join(baseDir, role);
      if (!fs.existsSync(roleDir)) continue;

      for (const name of fs.readdirSync(roleDir)) {
        if (!/\.wav$/i.test(name)) continue;
        const filePath = path.join(roleDir, name);
        const dedupeKey = path.normalize(filePath).toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const stem = path.parse(name).name;
        const type = normalizeLaughType(stem.split("_")[0] || "misc");
        assets.push({
          id: `${role}:${name}:${Buffer.from(filePath).toString("base64url").slice(0, 10)}`,
          role,
          type,
          label: stem,
          fileName: name,
          filePath
        });
      }
    }
  }

  assets.sort((a, b) => String(a.fileName).localeCompare(String(b.fileName), undefined, { sensitivity: "base" }));
  return { assets, libraryDir: root, scannedDirs: dirs };
}

function getUserDataDir() {
  return path.join(app.getPath("userData"), "bgm-library");
}

function getBgmManifestPath() {
  return path.join(getUserDataDir(), "bgm-assets.json");
}

function ensureBgmLibraryDir() {
  const dir = getUserDataDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function normalizeBgmId(value) {
  const raw = safeText(value).toLowerCase();
  const cleaned = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return cleaned || `bgm_${Date.now()}`;
}

function readBgmAssets() {
  try {
    const file = getBgmManifestPath();
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, "utf8") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBgmAssets(assets) {
  ensureBgmLibraryDir();
  fs.writeFileSync(getBgmManifestPath(), JSON.stringify(Array.isArray(assets) ? assets : [], null, 2), "utf8");
}

function normalizeBgmAsset(raw = {}) {
  const fileName = safeText(raw.fileName || path.basename(safeText(raw.filePath || "")));
  const label = safeText(raw.label || raw.id || fileName || "Untitled BGM");
  return {
    id: normalizeBgmId(raw.id || label || fileName),
    label,
    fileName,
    filePath: safeText(raw.filePath),
    category: safeText(raw.category),
    defaultVolume: Number.isFinite(Number(raw.defaultVolume)) ? Number(raw.defaultVolume) : 0.25,
    tags: Array.isArray(raw.tags) ? raw.tags.map((x) => safeText(x).toLowerCase()).filter(Boolean) : [],
    createdAt: safeText(raw.createdAt || new Date().toISOString()),
    updatedAt: safeText(raw.updatedAt || new Date().toISOString())
  };
}

function uniqueFilePath(filePath) {
  const parsed = path.parse(filePath);
  let candidate = filePath;
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`);
    index += 1;
  }
  return candidate;
}

function runFfmpeg(args, options = {}) {
  const ffmpeg = "ffmpeg";
  const fullCommand = `ffmpeg ${args.join(" ")}`;
  log(`[FFMPEG] Starting command: ${fullCommand}`);
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpeg, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (d) => {
      stdout += String(d);
    });

    proc.stderr?.on("data", (d) => {
      stderr += String(d);
    });

    proc.on("error", (err) => {
      log(`[FFMPEG] Process failed to start: ${err?.message || String(err)}`);
      log(`[FFMPEG] Command was: ${fullCommand}`);
      reject(new Error(`FFmpeg process failed to start: ${err?.message || String(err)}`));
    });

    proc.on("close", (code) => {
      const logOutput = `ffmpeg exited with code ${code}\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`;
      log(`[FFMPEG] Command finished with code ${code}.`);
      if (logOutput) {
        log(`[FFMPEG] Raw Output:\n${logOutput}`);
      }
      if (code === 0) {
        log(`[FFMPEG] Command successful.`);
        resolve({ stdout, stderr });
      } else {
        log(`[FFMPEG] Command failed with code ${code}.`);
        log(`[FFMPEG] Command was: ${fullCommand}`);
        reject(new Error(`FFmpeg command failed with code ${code}. ${stderr || stdout || "Unknown error."}`));
      }
    });
  });
}

function formatSrtTime(seconds) {
  const totalMs = Math.max(0, Math.round(ensureNumber(seconds, 0) * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
}


function buildSrtContent(subtitleCues = [], totalDuration = 0) {
  // Đảm bảo lấy được mảng blocks từ processedTimeline [cite: 1064]
  const actualCues = (subtitleCues && subtitleCues.blocks) ? subtitleCues.blocks : 
                     (Array.isArray(subtitleCues) ? subtitleCues : []);

  let srtIdx = 1;
  const srtEntries = [];
  const laughPatterns = [/ha+ha+/i, /he+he+/i, /hi+hi+/i, /ho+ho+/i, / cười /i, /\[laugh\]/i];

  for (const cue of actualCues) {
    if (!cue || cue.start === undefined || cue.end === undefined) continue;
    const start = formatSrtTime(cue.start);
    const end = formatSrtTime(cue.end);
    let text = (cue.subtitle || cue.text || "").trim();
    
    // Đổi các kiểu cười thành [laugh] như bạn mong muốn [cite: 1068]
    if (laughPatterns.some(pattern => pattern.test(text))) { text = "[laugh]"; }
    
    if (text) {
      srtEntries.push(`${srtIdx++}\r\n${start} --> ${end}\r\n${text}\r\n`);
    }
  }
  console.log(`[main] SRT Engine: Generated ${srtEntries.length} lines.`);
  return srtEntries.join("\r\n");
}

function formatAssTime(seconds) {
  const totalCs = Math.max(0, Math.round(Number(seconds || 0) * 100));
  const hours = Math.floor(totalCs / 360000);
  const minutes = Math.floor((totalCs % 360000) / 6000);
  const secs = Math.floor((totalCs % 6000) / 100);
  const cs = totalCs % 100;
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${hours}:${pad(minutes)}:${pad(secs)}.${pad(cs)}`;
}

function escapeAssText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, " ")
    .trim();
}

function rgbToAssColor(rgb = [255, 255, 255]) {
  const [r, g, b] = rgb;
  const hex = (n) => Math.max(0, Math.min(255, Number(n || 0))).toString(16).padStart(2, "0").toUpperCase();
  return `&H00${hex(b)}${hex(g)}${hex(r)}&`;
}

const ROLE_RGB = {
  A: [79, 195, 247],
  R: [255, 138, 128],
  BOTH: [255, 213, 79],
  DEFAULT: [255, 255, 255]
};

function getRoleRgb(role) {
  if (role === "A") return ROLE_RGB.A;
  if (role === "R") return ROLE_RGB.R;
  if (role === "BOTH") return ROLE_RGB.BOTH;
  return ROLE_RGB.DEFAULT;
}



function hexToRgb(hex, fallback = [255, 255, 255]) {
  const clean = String(hex || "").trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function rgbaStringToAssBackColor(rgbaString) {
  const text = String(rgbaString || "");
  const m = text.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);
  if (!m) return "&H00000000";
  const r = Math.max(0, Math.min(255, Number(m[1] || 0)));
  const g = Math.max(0, Math.min(255, Number(m[2] || 0)));
  const b = Math.max(0, Math.min(255, Number(m[3] || 0)));
  const a = Math.max(0, Math.min(1, Number(m[4] == null ? 1 : m[4])));
  const alpha = Math.round((1 - a) * 255).toString(16).padStart(2, "0").toUpperCase();
  const hx = (n) => n.toString(16).padStart(2, "0").toUpperCase();
  return `&H${alpha}${hx(b)}${hx(g)}${hx(r)}`;
}
function getRoleAtTime(segments = [], timeSeconds = 0) {
  const t = Number(timeSeconds || 0);
  const active = (Array.isArray(segments) ? segments : []).find((seg) =>
    seg && seg.type === "dialogue" && Number(seg.start) <= t && Number(seg.end) >= t
  );
  return active?.role || "A";
}


async function readAudioDuration(filePath) {
  const args = [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath
  ];
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    proc.stdout?.on("data", (d) => out += String(d));
    proc.on("close", () => resolve(ensureNumber(out.trim(), 0)));
    proc.on("error", () => resolve(0));
  });
}

function detectAudibleWindowFromWav(filePath, durationSeconds = 0) {
  // Subtitle sync helper: find real audible area inside a rendered chunk.
  // This prevents the next subtitle from appearing during leading silence/pause.
  const duration = Math.max(0, Number(durationSeconds || 0));
  try {
    const { samples, sampleRate } = readMono16WavSamples(filePath);
    if (!samples || !samples.length || !sampleRate) {
      return { start: 0, end: duration, ok: false, reason: "no_samples" };
    }

    const frameMs = 20;
    const frameSize = Math.max(1, Math.floor(sampleRate * frameMs / 1000));
    const threshold = 420; // about -38 dB for 16-bit PCM; safe for TTS/laugh assets
    const minActiveFrames = 1;

    let firstFrame = -1;
    let lastFrame = -1;
    let activeRun = 0;

    for (let frameStart = 0, frameIndex = 0; frameStart < samples.length; frameStart += frameSize, frameIndex += 1) {
      const frameEnd = Math.min(samples.length, frameStart + frameSize);
      let peak = 0;
      for (let i = frameStart; i < frameEnd; i += 1) {
        const v = Math.abs(samples[i] || 0);
        if (v > peak) peak = v;
      }

      if (peak >= threshold) {
        activeRun += 1;
        if (activeRun >= minActiveFrames && firstFrame < 0) {
          firstFrame = frameIndex - minActiveFrames + 1;
        }
        lastFrame = frameIndex;
      } else {
        activeRun = 0;
      }
    }

    if (firstFrame < 0 || lastFrame < 0) {
      return { start: 0, end: duration, ok: false, reason: "silent" };
    }

    const padIn = 0.035;
    const padOut = 0.08;
    const start = Math.max(0, round3(firstFrame * frameMs / 1000 - padIn));
    const end = Math.min(duration || Infinity, round3(((lastFrame + 1) * frameMs / 1000) + padOut));

    if (!(end > start)) {
      return { start: 0, end: duration, ok: false, reason: "invalid_window" };
    }

    return { start, end, ok: true, reason: "audio_window" };
  } catch (err) {
    return { start: 0, end: duration, ok: false, reason: err?.message || "detect_failed" };
  }
}


function findWavDataOffset(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return -1;
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return -1;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    if (chunkId === "data") return chunkDataStart;
    offset = chunkDataStart + chunkSize + (chunkSize % 2);
  }
  return -1;
}

function readMono16WavSamples(filePath) {
  const buffer = fs.readFileSync(filePath);
  const dataOffset = findWavDataOffset(buffer);
  if (dataOffset < 0) throw new Error("WAV không hợp lệ.");
  const sampleRate = buffer.readUInt32LE(24);
  const channels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  if (bitsPerSample !== 16) throw new Error("Chỉ hỗ trợ WAV 16-bit PCM.");
  const bytesPerSample = bitsPerSample / 8;
  const frameSize = channels * bytesPerSample;
  const sampleCount = Math.floor((buffer.length - dataOffset) / frameSize);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    const base = dataOffset + i * frameSize;
    samples[i] = buffer.readInt16LE(base);
  }
  return { samples, sampleRate };
}


function setRgbPixel(frame, width, height, x, y, rgb = [255, 255, 255]) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 3;
  frame[idx] = rgb[0];
  frame[idx + 1] = rgb[1];
  frame[idx + 2] = rgb[2];
}

function drawTopRoundedBarRgb(frame, width, height, x, y, w, h, radius = 9999, rgb = [255, 255, 255]) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const rectW = Math.max(1, Math.floor(w));
  const rectH = Math.max(1, Math.floor(h));
  const x1 = Math.min(width, x0 + rectW);
  const y1 = Math.min(height, y0 + rectH);
  const actualW = Math.max(1, x1 - x0);
  const actualH = Math.max(1, y1 - y0);
  const r = Math.max(1, Math.min(Math.floor(actualW / 2), Math.floor(actualH / 2), Math.floor(radius || 9999)));

  for (let yy = 0; yy < actualH; yy += 1) {
    for (let xx = 0; xx < actualW; xx += 1) {
      const gx = x0 + xx;
      const gy = y0 + yy;

      if (yy >= r) {
        setRgbPixel(frame, width, height, gx, gy, rgb);
        continue;
      }

      const nx = ((xx + 0.5) - actualW / 2) / Math.max(1, actualW / 2);
      const ny = ((yy + 0.5) - r) / Math.max(1, r);
      if ((nx * nx + ny * ny) <= 1) {
        setRgbPixel(frame, width, height, gx, gy, rgb);
      }
    }
  }
}

async function renderCustomBarsVideo(wavPath, outPath, durationSeconds, timelineBlocks = [], subtitleCues = [], layoutConfig = {}, options = {}) {
  const { samples, sampleRate } = readMono16WavSamples(wavPath);
  const width = Math.max(120, ensureNumber(options.width, 560));
  const height = Math.max(40, ensureNumber(options.height, 58));
  const fps = Math.max(12, ensureNumber(options.fps, 24));
  const barCount = Math.max(12, ensureNumber(options.barCount, 44));
  const barWidth = Math.max(4, ensureNumber(options.barWidth, 8));
  const gap = Math.max(1, ensureNumber(options.gap, 4));
  const bottomPadding = Math.max(1, ensureNumber(options.bottomPadding, 2));
  const baseBarHeight = Math.max(3, ensureNumber(options.baseBarHeight, 4));
  const idleTipMin = Math.max(0, ensureNumber(options.idleTipMin, 0));
  const idleTipMax = Math.max(idleTipMin, ensureNumber(options.idleTipMax, 3));
  const maxTipHeight = Math.max(baseBarHeight + 8, ensureNumber(options.maxTipHeight, 64));
  const sampleWindowMs = Math.max(20, ensureNumber(options.smoothWindowMs, 82));
  const sampleWindow = Math.max(64, Math.round(sampleRate * (sampleWindowMs / 1000)));
  const speakingBoost = Math.max(0.8, ensureNumber(options.speakingBoost, 6.8));
  const activeSpan = Math.max(2, ensureNumber(options.activeSpan, 4));
  const spreadBias = Math.max(0.1, Math.min(2, ensureNumber(options.spreadBias, 1.2)));
  const smoothingUp = Math.max(0.01, Math.min(1, ensureNumber(options.smoothingUp, 0.46)));
  const smoothingDown = Math.max(0.01, Math.min(1, ensureNumber(options.smoothingDown, 0.2)));
  const borderRadius = Math.max(2, ensureNumber(options.borderRadius, 9999));

  const wavebarConfig = layoutConfig?.wavebar || {};
  const defaultBarColor = hexToRgb(wavebarConfig.color || "#FFFFFF", [255, 255, 255]);
  const roleAColor = hexToRgb(wavebarConfig.colorA || "#4FC3F7", [79,195,247]);
  const roleRColor = hexToRgb(wavebarConfig.colorR || "#FF8A80", [255,138,128]);
  const roleBOTHColor = hexToRgb(wavebarConfig.colorBoth || "#FFD54F", [255,213,79]);
  const pauseColor = hexToRgb(wavebarConfig.colorPause || "#BDBDBD", [189,189,189]);
  const laughColor = hexToRgb(wavebarConfig.colorLaugh || "#FFD54F", [255,213,79]);
  const subtitleColor = hexToRgb(wavebarConfig.colorSubtitle || "#64DD17", [100,221,23]);

  const totalFrames = Math.max(1, Math.ceil(durationSeconds * fps));

  await new Promise((resolve, reject) => {
    const args = [
      '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`,
      '-r', String(fps), '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'veryfast',
      '-crf', '18', '-pix_fmt', 'yuv420p', outPath
    ];

    const proc = spawn('ffmpeg', args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d) => { stderr += String(d); });
    proc.on('error', (err) => reject(new Error(err?.message || String(err))));
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });

    const maxAmp = 32768;
    const usableWidth = barCount * barWidth + (barCount - 1) * gap;
    const startX = Math.max(0, Math.floor((width - usableWidth) / 2));
    const currents = new Array(barCount).fill(baseBarHeight + idleTipMin);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      const frame = Buffer.alloc(width * height * 3, 0);
      const t = frameIndex / fps;
      const centerSample = Math.floor(t * sampleRate);
      const windowStart = Math.max(0, centerSample - Math.floor(sampleWindow / 2));
      const windowEnd = Math.min(samples.length, windowStart + sampleWindow);

      let sum = 0;
      let count = 0;
      for (let i = windowStart; i < windowEnd; i += 1) {
        const v = samples[i] / maxAmp;
        sum += v * v;
        count += 1;
      }

      const globalRms = count > 0 ? Math.sqrt(sum / count) : 0;
      const speakingStrength = Math.pow(Math.min(1, globalRms * speakingBoost), 0.92);
      const drift = Math.sin(frameIndex * 0.045) * 1.8;
      const centers = [
        (barCount - 1) * 0.26 + drift,
        (barCount - 1) * 0.74 - drift
      ];

      let currentBarColor = defaultBarColor;

      // Tìm TimelineBlock hiện tại
      const actualBlocks = Array.isArray(timelineBlocks) ? timelineBlocks : (timelineBlocks.blocks || []);
      const activeBlock = actualBlocks.find(block => t >= block.resolvedStart && t < block.resolvedEnd);

      if (activeBlock) {
        // Kiểm tra laugh assets
        const activeLaugh = activeBlock.laughAssets?.find(laugh =>
          t >= (activeBlock.resolvedStart + laugh.offsetSeconds) &&
          t < (activeBlock.resolvedStart + laugh.offsetSeconds + (laugh.asset.duration || 0.5))
        );
        if (activeLaugh) {
          currentBarColor = laughColor;
        } else if (activeBlock.pauseAfterSeconds && activeBlock.pauseAfterSeconds > 0 && t >= activeBlock.resolvedEnd && t < (activeBlock.resolvedEnd + activeBlock.pauseAfterSeconds)) {
          // Kiểm tra pause after block
          currentBarColor = pauseColor;
        } else {
          // Áp dụng màu theo role của block
          switch (activeBlock.role) {
            case "A":
              currentBarColor = roleAColor;
              break;
            case "R":
              currentBarColor = roleRColor;
              break;
            case "BOTH":
              currentBarColor = roleBOTHColor;
              break;
            default:
              currentBarColor = defaultBarColor;
          }
        }
      }

      // Kiểm tra subtitle cues (ưu tiên màu subtitle nếu nằm trong vùng phụ đề)
      const actualSubCues = Array.isArray(subtitleCues) ? subtitleCues : (subtitleCues.blocks || []);
      const activeSubtitle = actualSubCues.find(cue => t >= cue.start && t < cue.end);
      if (activeSubtitle) {
        currentBarColor = subtitleColor;
      }

      for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
        let influence = 0;
        for (let c = 0; c < centers.length; c += 1) {
          const dist = Math.abs(barIndex - centers[c]);
          const spread = Math.max(0, 1 - dist / activeSpan);
          influence += Math.pow(spread, spreadBias);
        }
        influence = Math.min(1, influence / 1.25);

        const centerDistance = Math.abs(barIndex - (barCount - 1) / 2) / Math.max(1, barCount / 2);
        const sideBias = 0.45 + Math.pow(centerDistance, 0.9) * 0.95;
        const pulse = (Math.sin(frameIndex * 0.12 + barIndex * 0.48) + 1) * 0.5;
        const idleTip = idleTipMin + pulse * Math.max(0, idleTipMin);
        const dynamicTip = speakingStrength * influence * maxTipHeight * sideBias;
        const targetHeight = baseBarHeight + idleTip + dynamicTip;

        const current = currents[barIndex];
        const factor = targetHeight > current ? smoothingUp : smoothingDown;
        const next = current + (targetHeight - current) * factor;
        currents[barIndex] = next;

        const finalBarHeight = Math.max(baseBarHeight, Math.round(next));
        const x = startX + barIndex * (barWidth + gap);
        const y = Math.max(0, height - bottomPadding - finalBarHeight);
        drawTopRoundedBarRgb(frame, width, height, x, y, barWidth, finalBarHeight, Math.min(borderRadius, Math.floor(barWidth / 2)), currentBarColor);
      }

      proc.stdin.write(frame);
    }

    proc.stdin.end();
  });
}

async function startBackend() {
  if (backendProcess && !backendProcess.killed) return;

  const host = process.env.HOST || "127.0.0.1";
  const port = Number(process.env.PORT || 3030);
  const alreadyRunning = await isPortInUse(port, host);
  if (alreadyRunning) {
    log(`Backend already running at http://${host}:${port}, skip spawn.`);
    return;
  }

  const serverEntry = getServerEntry();
  if (!fs.existsSync(serverEntry)) {
    log(`server entry not found: ${serverEntry}`);
    return;
  }

  log("APP STARTING...");
  log("startBackend()");
  log(`isDev = ${String(isDev)}`);
  log(`command = ${process.execPath}`);
  log(`serverEntry = ${serverEntry}`);

  backendProcess = spawn(process.execPath, [serverEntry], {
    cwd: getProjectRoot(),
    env: {
      ...process.env,
      PORT: process.env.PORT || "3030",
      HOST: process.env.HOST || "127.0.0.1",
      ELECTRON_RUN_AS_NODE: "1"
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  backendProcess.stdout?.on("data", (d) => {
    const msg = String(d).trim();
    if (msg) log(`[server] ${msg}`);
  });

  backendProcess.stderr?.on("data", (d) => {
    const msg = String(d).trim();
    if (msg) log(`[server:error] ${msg}`);
  });

  backendProcess.on("error", (err) => {
    log(`backend spawn error: ${err?.message || String(err)}`);
  });

  backendProcess.on("exit", (code, signal) => {
    log(`backend exited code=${code} signal=${signal}`);
    backendProcess = null;
  });

  for (let i = 0; i < 8; i++) {
    await wait(250);
  }
  log(`Backend ready at http://${host}:${port}`);
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    try { backendProcess.kill(); } catch {}
  }
  backendProcess = null;
}

async function _old_composeFinalMediaFiles(payload = {}) {
  log(`[PIPELINE START] composeFinalMediaFiles triggered with payload: ${JSON.stringify(payload)}`);
  log(`[MAIN DURATION CAP FIX ACTIVE] using real finalAudioPath duration for subtitle cap`);
  const sourceAudioPath = safeText(payload.sourceAudioPath);
  const backgroundImagePath = safeText(payload.backgroundImagePath);
  const plan = payload.plan || {};
  console.log("[electron/main.cjs] Received plan in _old_composeFinalMediaFiles:", JSON.stringify(plan, null, 2)); // DEBUG LOG
  const layoutConfig = payload.layoutConfig || {};

  log(`[INPUT VALIDATION] sourceAudioPath: ${sourceAudioPath}, backgroundImagePath: ${backgroundImagePath}`);
  if (!sourceAudioPath) {
    throw new Error("Không tìm thấy source audio.");
  }
  if (!fs.existsSync(sourceAudioPath)) {
    throw new Error(`Source audio file does not exist: ${sourceAudioPath}`);
  }
  log(`[INPUT VALIDATION] sourceAudioPath exists: ${sourceAudioPath}`);

  if (!backgroundImagePath) {
    throw new Error("Không tìm thấy ảnh nền.");
  }
  if (!fs.existsSync(backgroundImagePath)) {
    throw new Error(`Background image file does not exist: ${backgroundImagePath}`);
  }
  log(`[INPUT VALIDATION] backgroundImagePath exists: ${backgroundImagePath}`);

  const musicBeds = Array.isArray(plan.musicBeds) ? plan.musicBeds : [];
  // Dữ liệu phụ đề thực tế được xử lý qua Timeline Engine

  // Lấy các tham số cần thiết cho Timeline Engine
  const speakerSettings = payload.speakerSettings || {}; // Frontend cần đảm bảo truyền speakerSettings vào payload
  const { assets: allLaughAssets } = listLaughAssetsInternal(); // Lấy tất cả laugh assets hiện có

  // Bước quan trọng: Xử lý timeline để có timing tuyệt đối (bao gồm cả pauseAfterSeconds)
  const processedTimeline = processTimeline(
    Array.isArray(plan.segments) ? plan.segments : [], // plan.segments là initialTimeline
    speakerSettings,
    allLaughAssets
  );

  // Build subtitle cues.
  // IMPORTANT:
  // If frontend already sends plan.subtitles, use it as source of truth.
  // plan.subtitles is already in FINAL CONCAT TIMELINE, including pause segments.
  // Do NOT rebuild subtitle timing from VAD/audio chunks in that case, otherwise subtitle drift returns.
  const plannedSubtitleCues = (Array.isArray(plan.subtitles) ? plan.subtitles : [])
    .map((cue) => ({
      start: round3(Number(cue?.start || 0)),
      end: round3(Number(cue?.end || 0)),
      text: normalizeLaughSubtitleText(cue?.text),
      role: String(cue?.role || "A").trim().toUpperCase() || "A"
    }))
    .filter((cue) => cue.text && cue.end > cue.start);

  const shouldUsePlannedSubtitles = plannedSubtitleCues.length > 0;

  let finalSubtitleCues = [];
  let subtitleCursor = 0;

  if (shouldUsePlannedSubtitles) {
    log(`[SUBTITLE SOURCE] Using plan.subtitles as source of truth (${plannedSubtitleCues.length} cues).`);
  } else {
    log(`[SUBTITLE SOURCE] plan.subtitles is empty; falling back to audio-chunk/VAD subtitle generation.`);
  }

  const getSegmentDurationFallback = (segment) => {
    if (!segment) return 0;
    if (Number(segment.duration || 0) > 0) return Number(segment.duration || 0);
    const start = Number(segment.start || 0);
    const end = Number(segment.end || 0);
    return Math.max(0, end - start);
  };

  const getSubtitleText = (segment) => normalizeLaughSubtitleText(
    segment?.subtitle || segment?.text || ""
  );

  const getSubtitleRole = (segment, fallback = "A") => String(
    segment?.role || fallback
  ).trim().toUpperCase();

  const base = getOutputBase(sourceAudioPath);
  const finalAudioPath = `${base}_final.wav`;
  const finalSrtPath = `${base}_final.srt`;
  const finalAssPath = `${base}_final.ass`;
  let currentVideoPath = `${base}_initial_video_input.mp4`; // Placeholder for the current video in the pipeline
  const finalVideoPath = `${base}_final.mp4`;
  const barsOverlayVideoPath = `${base}_bars_overlay.mp4`; // Video file containing only the wavebar overlay
  const videoWithBackgroundAndBarsPath = `${base}_bg_and_bars.mp4`; // Intermediate video with background and wavebar
  const videoWithSubtitlesPath = `${base}_subtitled.mp4`; // Intermediate video with subtitles burned in

  // --- Bước 1: Tạo các audio chunk riêng lẻ cho từng segment --- 
  log(`[PIPELINE STEP 1] START: Audio Chunking`);
  const tempAudioChunks = [];
  const tempAudioFilesToDelete = [];
  let tempChunkIndex = 0;

  for (const segment of plan.segments) {
    log(`[PIPELINE STEP 1] Processing segment type: ${segment.type}, start: ${segment.start}, end: ${segment.end}`);
    const currentChunkPath = path.join(os.tmpdir(), `temp_audio_chunk_${Date.now()}_${tempChunkIndex++}.wav`);
    tempAudioFilesToDelete.push(currentChunkPath);
    tempAudioChunks.push(currentChunkPath);

    let ffmpegArgs = [];

    if (segment.type === "dialogue") {
      ffmpegArgs = [
        "-y",
        "-i", sourceAudioPath,
        "-ss", String(segment.start),
        "-to", String(segment.end),
        "-c:a", "pcm_s16le",
        currentChunkPath
      ];
    } else if (segment.type === "pause") {
      ffmpegArgs = [
        "-y",
        "-f", "lavfi",
        "-i", `anullsrc=r=24000:cl=mono,apad=whole_len=${Math.round(segment.duration * 24000)}`, // anullsrc, apad để tạo silence
        "-t", String(segment.duration),
        "-c:a", "pcm_s16le",
        currentChunkPath
      ];
    } else if (segment.type === "reaction") {
      ffmpegArgs = [
        "-y",
        "-i", segment.filePath,
        "-ss", "0",
        "-to", String(segment.duration),
        "-c:a", "pcm_s16le",
        currentChunkPath
      ];
    }
    
    log(`[PIPELINE STEP 1] FFmpeg Command (Audio Chunk): ${ffmpegArgs.join(" ")}`);
    const { stdout, stderr } = await runFfmpeg(ffmpegArgs);
    log(`[PIPELINE STEP 1] FFmpeg (Audio Chunk) STDOUT: ${stdout}`);
    log(`[PIPELINE STEP 1] FFmpeg (Audio Chunk) STDERR: ${stderr}`);
    
    if (!fs.existsSync(currentChunkPath)) {
      throw new Error(`Audio chunk file does not exist after FFmpeg: ${currentChunkPath}`);
    }
    const chunkStats = fs.statSync(currentChunkPath);
    if (chunkStats.size === 0) {
      throw new Error(`Audio chunk file has 0 bytes after FFmpeg: ${currentChunkPath}`);
    }
    log(`[PIPELINE STEP 1] Created audio chunk: ${currentChunkPath} (size: ${chunkStats.size} bytes)`);

    // Track actual concat audio duration for all chunks.
    // Only build VAD subtitles when plan.subtitles is missing.
    const actualChunkDuration = round3(
      (await readAudioDuration(currentChunkPath)) || getSegmentDurationFallback(segment)
    );
    const subtitleType = String(segment.type || "dialogue").toLowerCase();
    const chunkStartOnFinalAudio = subtitleCursor;
    const chunkEndOnFinalAudio = round3(subtitleCursor + actualChunkDuration);

    if (!shouldUsePlannedSubtitles) {
      const audibleWindow = detectAudibleWindowFromWav(currentChunkPath, actualChunkDuration);

      log(`[SUB VAD FALLBACK] segment#${tempChunkIndex - 1} type=${subtitleType} chunk=${actualChunkDuration.toFixed(3)} audible=${audibleWindow.start.toFixed(3)}-${audibleWindow.end.toFixed(3)} ok=${audibleWindow.ok} reason=${audibleWindow.reason}`);

      if ((subtitleType === "dialogue" || subtitleType === "reaction") && chunkEndOnFinalAudio > chunkStartOnFinalAudio) {
        const text = getSubtitleText(segment);
        const cueStart = round3(chunkStartOnFinalAudio + audibleWindow.start);
        const cueEnd = round3(chunkStartOnFinalAudio + audibleWindow.end);
        if (text && cueEnd > cueStart) {
          finalSubtitleCues.push({
            start: cueStart,
            end: cueEnd,
            text,
            role: getSubtitleRole(segment, subtitleType === "reaction" ? "R" : "A")
          });
        }
      }
    }

    // Pause/silence still advances the final audio cursor, but does not create subtitle.
    subtitleCursor = chunkEndOnFinalAudio;
  }

  if (shouldUsePlannedSubtitles) {
    finalSubtitleCues = plannedSubtitleCues;
  }

  finalSubtitleCues.sort((a, b) => Number(a.start || 0) - Number(b.start || 0));
  log(`[SUBTITLE TIMELINE FIX] Built ${finalSubtitleCues.length} cues from ${shouldUsePlannedSubtitles ? "plan.subtitles" : "REAL audio chunks"}. Total audio cursor: ${subtitleCursor.toFixed(3)}s`);
  finalSubtitleCues.slice(0, 12).forEach((cue, idx) => {
    log(`[SUBTITLE TIMELINE FIX] cue#${idx + 1}: ${cue.start.toFixed(3)} -> ${cue.end.toFixed(3)} | ${cue.role} | ${cue.text}`);
  });

  // --- Bước 2: Concatenate tất cả các audio chunk thành một file finalAudioPath_raw.wav --- 
  log(`[PIPELINE STEP 2] START: Audio Concatenation`);
  const finalAudioPathRaw = `${base}_final_raw.wav`;
  tempAudioFilesToDelete.push(finalAudioPathRaw);

  if (tempAudioChunks.length > 0) {
    const concatListPath = path.join(os.tmpdir(), `concat_list_${Date.now()}.txt`);
    tempAudioFilesToDelete.push(concatListPath);
    const concatListContent = tempAudioChunks.map(p => `file '${p.replace(/\\/g, "/")}'`).join("\n");
    fs.writeFileSync(concatListPath, concatListContent, "utf8");
    log(`[PIPELINE STEP 2] Concat list file: ${concatListPath}`);
    log(`[PIPELINE STEP 2] Concat list content:\n${concatListContent}`);

    const ffmpegArgs = [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatListPath,
      "-c:a", "pcm_s16le",
      finalAudioPathRaw
    ];
    log(`[PIPELINE STEP 2] FFmpeg Command (Audio Concatenation): ${ffmpegArgs.join(" ")}`);
    const { stdout, stderr } = await runFfmpeg(ffmpegArgs);
    log(`[PIPELINE STEP 2] FFmpeg (Audio Concatenation) STDOUT: ${stdout}`);
    log(`[PIPELINE STEP 2] FFmpeg (Audio Concatenation) STDERR: ${stderr}`);
  } else {
    log(`[PIPELINE STEP 2] No audio chunks to concatenate, creating silent audio.`);
    const ffmpegArgs = [
      "-y",
      "-f", "lavfi",
      "-i", "anullsrc=r=24000:cl=mono",
      "-t", String(ensureNumber(plan.estimatedDuration, 1)), // Thời lượng tối thiểu 1s
      "-c:a", "pcm_s16le",
      finalAudioPathRaw
    ];
    log(`[PIPELINE STEP 2] FFmpeg Command (Silent Audio Creation): ${ffmpegArgs.join(" ")}`);
    const { stdout, stderr } = await runFfmpeg(ffmpegArgs);
    log(`[PIPELINE STEP 2] FFmpeg (Silent Audio Creation) STDOUT: ${stdout}`);
    log(`[PIPELINE STEP 2] FFmpeg (Silent Audio Creation) STDERR: ${stderr}`);
  }

  if (!fs.existsSync(finalAudioPathRaw)) {
    throw new Error(`Concatenated audio file does not exist: ${finalAudioPathRaw}`);
  }
  const concatAudioStats = fs.statSync(finalAudioPathRaw);
  if (concatAudioStats.size === 0) {
    throw new Error(`Concatenated audio file has 0 bytes: ${finalAudioPathRaw}`);
  }
  log(`[PIPELINE STEP 2] Created concatenated audio: ${finalAudioPathRaw} (size: ${concatAudioStats.size} bytes)`);

  // --- Bước 3: Mix finalAudioPath_raw.wav với Music Beds (BGM) --- 
  log(`[PIPELINE STEP 3] START: BGM Mixing`);
  if (!musicBeds.length) {
    log(`[PIPELINE STEP 3] No music beds found. Copying raw audio to final audio path.`);
    fs.copyFileSync(finalAudioPathRaw, finalAudioPath);
  } else {
    const audioDurationAfterConcat = await readAudioDuration(finalAudioPathRaw) || ensureNumber(plan.estimatedDuration, 0);
    log(`[PIPELINE STEP 3] Audio duration after concatenation: ${audioDurationAfterConcat}s`);
    const validBeds = musicBeds.filter((bed) => {
      const bgmPath = safeText(bed.filePath);
      const exists = bgmPath && fs.existsSync(bgmPath);
      if (!exists) log(`[PIPELINE STEP 3] WARNING: BGM asset not found: ${bgmPath}`);
      return exists;
    });

    if (!validBeds.length) {
      log(`[PIPELINE STEP 3] No valid music beds found. Copying raw audio to final audio path.`);
      fs.copyFileSync(finalAudioPathRaw, finalAudioPath);
    } else {
      log(`[PIPELINE STEP 3] Mixing with ${validBeds.length} music beds.`);
      const audioArgs = ["-y", "-i", finalAudioPathRaw];
      const filterParts = [
        `[0:a]aformat=sample_fmts=fltp:sample_rates=24000:channel_layouts=mono[voicebase]`
      ];

      validBeds.forEach((bed) => {
        audioArgs.push("-stream_loop", "-1", "-i", safeText(bed.filePath));
      });

      validBeds.forEach((bed, idx) => {
        const inputIndex = idx + 1;
        const start = Math.max(0, ensureNumber(bed.start, 0));
        const volume = Math.max(0, ensureNumber(bed.volume, 0.25));
        const duration = Math.max(0.1, ensureNumber(bed.duration, 0) || Math.max(0.1, audioDurationAfterConcat - start));
        filterParts.push(
          `[${inputIndex}:a]aformat=sample_fmts=fltp:sample_rates=24000:channel_layouts=mono,atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)},volume=${volume.toFixed(3)}[bgm${idx}]`
        );
      });

      const bgmLabels = validBeds.map((_, idx) => `[bgm${idx}]`).join("");
      if (validBeds.length === 1) {
        filterParts.push(`${bgmLabels}anull[bgmfull]`);
      } else {
        filterParts.push(`${bgmLabels}amix=inputs=${validBeds.length}:normalize=0:dropout_transition=0[bgmfull]`);
      }

      filterParts.push(`[bgmfull][voicebase]sidechaincompress=threshold=0.03:ratio=10:attack=20:release=300:makeup=1[bgmduck]`);
      filterParts.push(`[voicebase][bgmduck]amix=inputs=2:normalize=0:dropout_transition=0[aout]`);

      audioArgs.push(
        "-filter_complex", filterParts.join(";"),
        "-map", "[aout]",
        "-c:a", "pcm_s16le",
        finalAudioPath
      );

      log(`[PIPELINE STEP 3] FFmpeg Command (BGM Mixing): ${audioArgs.join(" ")}`);
      const { stdout, stderr } = await runFfmpeg(audioArgs);
      log(`[PIPELINE STEP 3] FFmpeg (BGM Mixing) STDOUT: ${stdout}`);
      log(`[PIPELINE STEP 3] FFmpeg (BGM Mixing) STDERR: ${stderr}`);
    }
  }

  if (!fs.existsSync(finalAudioPath)) {
    throw new Error(`Final audio file does not exist after BGM mix: ${finalAudioPath}`);
  }
  const finalAudioStats = fs.statSync(finalAudioPath);
  if (finalAudioStats.size === 0) {
    throw new Error(`Final audio file has 0 bytes after BGM mix: ${finalAudioPath}`);
  }
  log(`[PIPELINE STEP 3] Created final audio: ${finalAudioPath} (size: ${finalAudioStats.size} bytes)`);

  // Lấy tổng thời lượng từ processedTimeline thay vì đọc lại từ file audio,
  // để đảm bảo đồng bộ với timeline đã xử lý.
  const audioDuration = await readAudioDuration(finalAudioPath) || ensureNumber(plan.estimatedDuration, 0) || processedTimeline.totalDuration || 0;
  log(`[PIPELINE STEP 3] Calculated audio duration from final audio file: ${audioDuration}s`); // Debug log

  // Generate safe temporary ASS file path
  const tempAssFilePathSafe = path.join(os.tmpdir(), `temp_subtitle_${Date.now()}.ass`);
  tempAudioFilesToDelete.push(tempAssFilePathSafe); // Add to cleanup list
  
  log(`[DEBUG SUBTITLE] SRT Output Path: ${finalSrtPath}`); // DEBUG LOG
  log(`[DEBUG SUBTITLE] Subtitle Cues Count: ${finalSubtitleCues.length}`); // DEBUG LOG
  if (finalSubtitleCues.length > 0) {
    log(`[DEBUG SUBTITLE] First 3 Cues (Start, End):`);
    finalSubtitleCues.slice(0, 3).forEach(cue => log(`    - ${cue.start.toFixed(3)}s - ${cue.end.toFixed(3)}s`));
  } // DEBUG LOG
  fs.writeFileSync(finalSrtPath, '\uFEFF' + buildSrtContent(finalSubtitleCues, audioDuration, payload), "utf8");
  log(`[EXPORT PIPELINE] Generated SRT subtitle file successfully.`); // Debug log
  
  log(`[EXPORT PIPELINE] Generating ASS subtitle file content to safe temp path: ${tempAssFilePathSafe}`); // Debug log
  log(`[DEBUG SUBTITLE] ASS Temp Path: ${tempAssFilePathSafe}`); // DEBUG LOG
  fs.writeFileSync(tempAssFilePathSafe, buildStyledAssContent(finalSubtitleCues, audioDuration, layoutConfig), "utf8"); // Write to safe temporary path
  log(`[EXPORT PIPELINE] Generated ASS subtitle file content successfully.`); // Debug log
  
  log(`[PIPELINE STEP 4] START: Wavebar Overlay Video Generation`);
  log(`[PIPELINE STEP 4] Output: ${barsOverlayVideoPath}`);
  await renderCustomBarsVideo(finalAudioPath, barsOverlayVideoPath, audioDuration, processedTimeline.blocks || [], finalSubtitleCues || [], layoutConfig, {
    ...WAVEBAR_RENDER_CONFIG,
    width: Number(layoutConfig?.wavebar?.width || WAVEBAR_RENDER_CONFIG.width),
    height: Number(layoutConfig?.wavebar?.height || WAVEBAR_RENDER_CONFIG.height),
    barCount: Number(layoutConfig?.wavebar?.barCount || WAVEBAR_RENDER_CONFIG.barCount),
    barWidth: Number(layoutConfig?.wavebar?.barWidth || WAVEBAR_RENDER_CONFIG.barWidth),
    gap: Number(layoutConfig?.wavebar?.gap || WAVEBAR_RENDER_CONFIG.gap),
    maxTipHeight: Number(layoutConfig?.wavebar?.maxTipHeight || WAVEBAR_RENDER_CONFIG.maxTipHeight),
    speakingBoost: Number(layoutConfig?.wavebar?.speakingBoost || WAVEBAR_RENDER_CONFIG.speakingBoost),
    smoothingUp: Number(layoutConfig?.wavebar?.smoothingUp || WAVEBAR_RENDER_CONFIG.smoothingUp),
    smoothingDown: Number(layoutConfig?.wavebar?.smoothingDown || WAVEBAR_RENDER_CONFIG.smoothingDown),
    color: String(layoutConfig?.wavebar?.color || WAVEBAR_RENDER_CONFIG.color || "#FFFFFF")
  });

  if (!fs.existsSync(barsOverlayVideoPath)) {
    throw new Error(`Wavebar overlay video file does not exist after generation: ${barsOverlayVideoPath}`);
  }
  const barsStats = fs.statSync(barsOverlayVideoPath);
  if (barsStats.size === 0) {
    throw new Error(`Wavebar overlay video file has 0 bytes after generation: ${barsOverlayVideoPath}`);
  }
  log(`[PIPELINE STEP 4] Created wavebar overlay video: ${barsOverlayVideoPath} (size: ${barsStats.size} bytes)`);

  log(`[PIPELINE STEP 5] START: Video Blending (Background + Bars Overlay)`);
  log(`[PIPELINE STEP 5] INPUT: Background Image: ${backgroundImagePath}, Audio: ${finalAudioPath}, Bars Overlay Video: ${barsOverlayVideoPath}`);
  log(`[PIPELINE STEP 5] OUTPUT: ${videoWithBackgroundAndBarsPath}`);
  const step1Args = [
    "-y",
    "-loop", "1",
    "-i", backgroundImagePath,
    "-i", finalAudioPath,
    "-i", barsOverlayVideoPath,
    "-filter_complex",
    `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720[bg];` +
    `[2:v]colorkey=0x000000:0.12:0.02[wave];` +
    `[bg][wave]overlay=x=(W-w)/2${Number(layoutConfig?.wavebar?.xOffset || WAVEBAR_RENDER_CONFIG.xOffset || 30) >= 0 ? "+" : ""}${Math.round(Number(layoutConfig?.wavebar?.xOffset || WAVEBAR_RENDER_CONFIG.xOffset || 30))}:y=430:format=auto[vout]`,
    "-map", "[vout]",
    "-map", "1:a",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    videoWithBackgroundAndBarsPath
  ];
  log(`[PIPELINE STEP 5] FFmpeg Command (Video Blending): ${step1Args.join(" ")}`);
  const { stdout: stdout1, stderr: stderr1 } = await runFfmpeg(step1Args);
  log(`[PIPELINE STEP 5] FFmpeg (Video Blending) STDOUT: ${stdout1}`);
  log(`[PIPELINE STEP 5] FFmpeg (Video Blending) STDERR: ${stderr1}`);
  
  if (!fs.existsSync(videoWithBackgroundAndBarsPath)) {
    throw new Error(`Video with background and bars does not exist after blending: ${videoWithBackgroundAndBarsPath}`);
  }
  const bgBarsStats = fs.statSync(videoWithBackgroundAndBarsPath);
  if (bgBarsStats.size === 0) {
    throw new Error(`Video with background and bars has 0 bytes after blending: ${videoWithBackgroundAndBarsPath}`);
  }
  log(`[PIPELINE STEP 5] Created video with background and bars: ${videoWithBackgroundAndBarsPath} (size: ${bgBarsStats.size} bytes)`);
  currentVideoPath = videoWithBackgroundAndBarsPath;
  tempAudioFilesToDelete.push(barsOverlayVideoPath);
  tempAudioFilesToDelete.push(videoWithBackgroundAndBarsPath);

  // Chuẩn hóa đường dẫn ASS cho FFmpeg filter, tránh escape drive letter colon
  // Sử dụng đường dẫn an toàn cho FFmpeg
 // --- [PIPELINE STEP 6] START: Subtitle Burning (Màu theo Voice) ---
  log(`[PIPELINE STEP 6] START: Subtitle Burning`);

  // Chuẩn hóa đường dẫn file ASS (để giữ màu sắc nhân vật) [cite: 1256]
  const assPathForFilter = tempAssFilePathSafe.replace(/\\/g, "/").replace(/:/g, "\\:");
  
  // Sử dụng filter 'ass' để giữ màu sắc của Role A và Role R [cite: 1257]
  const vfFilterArg = `ass='${assPathForFilter}'`;

  const step2Args = [
    "-y",
    "-i", currentVideoPath, 
    "-vf", vfFilterArg,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "copy",
    videoWithSubtitlesPath
  ];

  log(`[DEBUG SUBTITLE] FFmpeg Subtitle Burn Command: ${step2Args.join(" ")}`); // DEBUG LOG
  log(`[PIPELINE STEP 6] FFmpeg Command: ${step2Args.join(" ")}`);
  
  try {
    await runFfmpeg(step2Args);
    log(`[PIPELINE STEP 6] Subtitle burning complete.`);
    currentVideoPath = videoWithSubtitlesPath;
  } catch (err) {
    log(`[PIPELINE STEP 6] ERROR: ${err.message}`);
  }





  log(`[PIPELINE STEP 7] START: Final Export`);
  log(`[PIPELINE STEP 7] INPUT: Subtitle-burned Video: ${currentVideoPath}`);
  log(`[PIPELINE STEP 7] OUTPUT: Final Video: ${finalVideoPath}`);
  fs.copyFileSync(currentVideoPath, finalVideoPath);
  
  if (!fs.existsSync(finalVideoPath)) {
    throw new Error(`[VALIDATION ERROR] Final exported video file ${finalVideoPath} does not exist.`);
  }
  const finalVideoStats = fs.statSync(finalVideoPath);
  if (finalVideoStats.size === 0) {
    throw new Error(`[VALIDATION ERROR] Final exported video file ${finalVideoPath} has 0 bytes. It might be corrupted.`);
  }
  log(`[PIPELINE STEP 7] Final video file ${finalVideoPath} exists and has size ${finalVideoStats.size} bytes.`);

  log(`[PIPELINE STEP 8] START: Cleanup`);
  for (const tempFile of tempAudioFilesToDelete) {
    try { 
      fs.unlinkSync(tempFile); 
      log(`[PIPELINE STEP 8] Deleted temporary file: ${tempFile}`); 
    } catch (e) { 
      log(`[PIPELINE STEP 8] [CLEANUP ERROR] Failed to delete ${tempFile}: ${e.message}`); 
    }
  }

  return {
    finalAudioPath,
    finalSrtPath,
    finalVideoPath
  };
}

// --- NEW MINIMAL EXPORT PIPELINE (FROM SCRATCH) ---
async function minimalExportVideo(payload = {}) {
  log(`[MINIMAL EXPORT] START: triggered with payload: ${JSON.stringify(payload)}`);
  const sourceImagePath = safeText(payload.sourceImagePath);
  const sourceAudioPath = safeText(payload.sourceAudioPath);
  const assFilePath = safeText(payload.assFilePath);
  const outputPath = safeText(payload.outputPath);

  // Input validation
  if (!sourceImagePath || !fs.existsSync(sourceImagePath)) {
    throw new Error(`Minimal export: Source image not found or does not exist: ${sourceImagePath}`);
  }
  if (!sourceAudioPath || !fs.existsSync(sourceAudioPath)) {
    throw new Error(`Minimal export: Source audio not found or does not exist: ${sourceAudioPath}`);
  }
  if (!assFilePath || !fs.existsSync(assFilePath)) {
    throw new Error(`Minimal export: ASS file not found or does not exist: ${assFilePath}`);
  }
  if (!outputPath) {
    throw new Error("Minimal export: Output path not specified.");
  }

  log(`[MINIMAL EXPORT] Inputs: Image=${sourceImagePath}, Audio=${sourceAudioPath}, ASS=${assFilePath}, Output=${outputPath}`);

  // Ensure output directory exists
  ensureDir(path.dirname(outputPath));

  // Normalize ASS path for FFmpeg filter
  const assPathForFilter = assFilePath.replace(/\\/g, "/");
  const vfFilterArg = `ass=filename='${assPathForFilter}'`;

  const ffmpegArgs = [
    "-y", // Overwrite output files without asking
    "-loop", "1",
    "-i", sourceImagePath,
    "-i", sourceAudioPath,
    "-vf", vfFilterArg,
    "-shortest", // Finish encoding when the shortest input stream ends
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20", // Quality (0-51, lower is better)
    "-pix_fmt", "yuv420p", // Pixel format for broad compatibility
    "-profile:v", "high", // H.264 profile
    "-c:a", "aac", // Audio codec
    "-b:a", "192k", // Audio bitrate
    outputPath
  ];

  log(`[MINIMAL EXPORT] FFmpeg Command: ${ffmpegArgs.join(" ")}`);
  try {
    const { stdout, stderr } = await runFfmpeg(ffmpegArgs);
    log(`[MINIMAL EXPORT] FFmpeg STDOUT:\n${stdout}`);
    log(`[MINIMAL EXPORT] FFmpeg STDERR:\n${stderr}`);
  } catch (error) {
    throw new Error(`Minimal export FFmpeg failed: ${error?.message || String(error)}`);
  }

  // Verify output file
  if (!fs.existsSync(outputPath)) {
    throw new Error(`Minimal export: Output video file does not exist: ${outputPath}`);
  }
  const stats = fs.statSync(outputPath);
  if (stats.size === 0) {
    throw new Error(`Minimal export: Output video file has 0 bytes: ${outputPath}`);
  }
  log(`[MINIMAL EXPORT] SUCCESS: Created output video: ${outputPath} (size: ${stats.size} bytes)`);

  return { ok: true, path: outputPath };
}

safeHandle("dialog:select-folder", async () => {
  const result = await dialog.showOpenDialog({
    title: APP_TITLE,
    properties: ["openDirectory", "createDirectory"]
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true, path: "" };
  return { canceled: false, path: result.filePaths[0] };
});

safeHandle("dialog:select-audio-file", async () => {
  const result = await dialog.showOpenDialog({
    title: APP_TITLE,
    properties: ["openFile"],
    filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "aac", "ogg", "flac"] }]
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true, path: "" };
  return { canceled: false, path: result.filePaths[0] };
});

safeHandle("dialog:select-audio-files", async () => {
  const result = await dialog.showOpenDialog({
    title: APP_TITLE,
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio", extensions: ["wav", "mp3", "m4a", "aac", "ogg", "flac"] }]
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true, paths: [] };
  return { canceled: false, paths: result.filePaths };
});


safeHandle("dialog:select-video-files", async () => {
  const result = await dialog.showOpenDialog({
    title: "Chọn các video cần ghép",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "webm", "m4v"] }]
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true, paths: [] };
  return { canceled: false, paths: result.filePaths };
});

safeHandle("dialog:select-image-file", async () => {
  const result = await dialog.showOpenDialog({
    title: APP_TITLE,
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });
  if (result.canceled || !result.filePaths?.length) return { canceled: true, path: "" };
  return { canceled: false, path: result.filePaths[0] };
});

safeHandle("file:read-audio-file", async (_event, payload = {}) => {
  try {
    const filePath = safeText(payload.filePath);
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: "Không tìm thấy file audio." };
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
      ".ogg": "audio/ogg",
      ".flac": "audio/flac"
    };
    const uint8 = Uint8Array.from(buf);
    return { ok: true, data: buf.toString("base64"), arrayBuffer: uint8.buffer, mimeType: mimeMap[ext] || "audio/wav" };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

safeHandle("file:save-audio", async (_event, payload = {}) => {
  try {
    const folderPath = safeText(payload.folderPath);
    const fileName = safeText(payload.fileName || "output.wav");
    const arrayBuffer = payload.arrayBuffer;
    if (!folderPath || !fileName || !arrayBuffer) return { ok: false, error: "Thiếu dữ liệu để lưu audio." };
    fs.mkdirSync(folderPath, { recursive: true });
    const targetPath = path.join(folderPath, fileName);
    fs.writeFileSync(targetPath, Buffer.from(arrayBuffer));
    return { ok: true, path: targetPath };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

safeHandle("file:open-folder-path", async (_event, payload = {}) => {
  try {
    const rawPath = safeText(payload.path);
    if (!rawPath) return { ok: false, error: "Chưa có đường dẫn để mở." };

    let targetPath = rawPath;
    let revealTarget = "";

    if (!fs.existsSync(targetPath)) {
      const parentDir = path.dirname(targetPath);
      if (parentDir && fs.existsSync(parentDir)) {
        targetPath = parentDir;
      } else {
        return { ok: false, error: "Không tìm thấy thư mục cần mở." };
      }
    } else {
      const stat = fs.statSync(targetPath);
      if (stat.isFile()) {
        revealTarget = targetPath;
        targetPath = path.dirname(targetPath);
      }
    }

    if (revealTarget && fs.existsSync(revealTarget)) {
      log(`OPENING FILE (revealed): ${revealTarget}`);
      shell.showItemInFolder(revealTarget);
      return { ok: true, path: revealTarget, revealed: true };
    }

    log(`OPENING FILE: ${targetPath}`); // DEBUG LOG
    const openError = await shell.openPath(targetPath);
    if (openError) return { ok: false, error: openError };
    return { ok: true, path: targetPath, revealed: false };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});


safeHandle("file:convert-waveform-video", async (_event, payload = {}) => {
  try {
    const sourceFilePath = safeText(payload.sourceFilePath);
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) return { ok: false, error: "Không tìm thấy source audio." };
    const base = getOutputBase(sourceFilePath);
    const out = `${base}_waveform.mp4`;
    const args = [
      "-y",
      "-f", "lavfi",
      "-i", "color=c=black:s=1280x720:d=1",
      "-i", sourceFilePath,
      "-filter_complex",
`[1:a]showfreqs=s=140x180:mode=bar:ascale=sqrt:fscale=log:win_size=4096:colors=white,format=rgba,crop=140:90:0:0,scale=760:120:flags=neighbor[sw];[0:v][sw]overlay=x=360:y=500[vout]`,
      "-map", "[vout]",
      "-map", "1:a",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-c:a", "aac",
      "-shortest",
      out
    ];
    await runFfmpeg(args);
    return { ok: true, path: out };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});


safeHandle("file:merge-video-files", async (_event, payload = {}) => {
  const tempFiles = [];
  try {
    const inputFiles = Array.isArray(payload.files) ? payload.files.map((f) => safeText(f)).filter(Boolean) : [];
    if (inputFiles.length < 2) return { ok: false, error: "Cần chọn ít nhất 2 video để ghép." };
    for (const file of inputFiles) {
      if (!fs.existsSync(file)) return { ok: false, error: `Không tìm thấy video: ${file}` };
    }

    const outputDir = safeText(payload.outputDir) || path.dirname(inputFiles[0]);
    fs.mkdirSync(outputDir, { recursive: true });
    const outputNameRaw = safeText(payload.outputName || `final-video-${Date.now()}.mp4`);
    const outputName = outputNameRaw.toLowerCase().endsWith(".mp4") ? outputNameRaw : `${outputNameRaw}.mp4`;
    const outputPath = path.join(outputDir, outputName);
    const listPath = path.join(app.getPath("temp"), `easy-english-video-concat-${Date.now()}.txt`);
    tempFiles.push(listPath);

    const concatList = inputFiles
      .map((file) => `file '${String(file).replace(/'/g, "'\\''")}'`)
      .join("\n");
    fs.writeFileSync(listPath, concatList, "utf8");

    const tryCopyArgs = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath];
    try {
      log(`[VIDEO MERGE] FFmpeg concat copy: ${tryCopyArgs.join(" ")}`);
      await runFfmpeg(tryCopyArgs);
    } catch (copyError) {
      log(`[VIDEO MERGE] Copy concat failed, fallback to normalize encode: ${copyError?.message || copyError}`);
      const filter = inputFiles
        .map((_, i) => `[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1[v${i}];[${i}:a]aformat=sample_rates=48000:channel_layouts=stereo[a${i}]`)
        .join(";")
        + ";"
        + inputFiles.map((_, i) => `[v${i}][a${i}]`).join("")
        + `concat=n=${inputFiles.length}:v=1:a=1[outv][outa]`;
      const encodeArgs = ["-y"];
      inputFiles.forEach((file) => encodeArgs.push("-i", file));
      encodeArgs.push(
        "-filter_complex", filter,
        "-map", "[outv]",
        "-map", "[outa]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        outputPath
      );
      log(`[VIDEO MERGE] FFmpeg normalize concat: ${encodeArgs.join(" ")}`);
      await runFfmpeg(encodeArgs);
    }

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      return { ok: false, error: "Ghép video xong nhưng file output rỗng hoặc không tồn tại." };
    }
    return { ok: true, path: outputPath, count: inputFiles.length };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  } finally {
    for (const file of tempFiles) {
      try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
    }
  }
});

safeHandle("file:compose-final-media", async (_event, payload = {}) => {
  try {
    const result = await _old_composeFinalMediaFiles(payload);
    return { ok: true, ...result };
  } catch (error) {
    const message = error?.message || String(error || "Xuất media cuối thất bại");
    log(`_old_compose-final-media failed: ${message}`);
    return { ok: false, error: message };
  }
});

// --- NEW MINIMAL EXPORT IPC TRIGGER ---

safeHandle("file:list-bgm-assets", async () => {
  try {
    const assets = readBgmAssets()
      .map(normalizeBgmAsset)
      .filter((item) => item.filePath && fs.existsSync(item.filePath));
    writeBgmAssets(assets);
    return { ok: true, assets, libraryDir: ensureBgmLibraryDir() };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

safeHandle("file:import-bgm-assets", async (_event, payload = {}) => {
  try {
    const files = Array.isArray(payload.files) ? payload.files.map((x) => safeText(x)).filter(Boolean) : [];
    if (!files.length) return { ok: false, error: "Không có file BGM để import." };

    const libraryDir = ensureBgmLibraryDir();
    const assets = readBgmAssets().map(normalizeBgmAsset);
    let importedCount = 0;

    for (const src of files) {
      if (!fs.existsSync(src)) continue;
      const fileName = path.basename(src);
      const targetPath = uniqueFilePath(path.join(libraryDir, fileName));
      fs.copyFileSync(src, targetPath);

      const nextAsset = normalizeBgmAsset({
        id: path.parse(fileName).name,
        label: path.parse(fileName).name,
        fileName: path.basename(targetPath),
        filePath: targetPath,
        updatedAt: new Date().toISOString()
      });

      const existingIndex = assets.findIndex((item) => item.id === nextAsset.id);
      if (existingIndex >= 0) {
        assets[existingIndex] = { ...assets[existingIndex], ...nextAsset, createdAt: assets[existingIndex].createdAt || nextAsset.createdAt };
      } else {
        assets.push(nextAsset);
      }
      importedCount += 1;
    }

    assets.sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id), undefined, { sensitivity: "base" }));
    writeBgmAssets(assets);
    return { ok: true, assets, importedCount, libraryDir };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});


safeHandle("file:list-laugh-assets", async () => {
  try {
    const { assets, libraryDir } = listLaughAssetsInternal();
    return { ok: true, assets, libraryDir };
  } catch (error) {
    return { ok: false, error: error?.message || String(error), assets: [] };
  }
});

safeHandle("file:import-laugh-assets", async (_event, payload = {}) => {
  try {
    const files = Array.isArray(payload.files) ? payload.files.map((x) => safeText(x)).filter(Boolean) : [];
    const role = normalizeLaughRole(payload.role || "BOTH");
    const type = normalizeLaughType(payload.type || "misc");
    if (!files.length) return { ok: false, error: "Không có file laugh để import." };

    const root = ensureLaughAssetsRootDir();
    const roleDir = path.join(root, role);
    let importedCount = 0;

    for (const src of files) {
      if (!fs.existsSync(src)) continue;
      const originalName = path.parse(src).name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "laugh";
      const ext = path.extname(src).toLowerCase() || ".wav";
      const targetName = `${type}_${originalName}${ext}`;
      const targetPath = uniqueFilePath(path.join(roleDir, targetName));
      fs.copyFileSync(src, targetPath);
      importedCount += 1;
    }

    const { assets, libraryDir } = listLaughAssetsInternal();
    return { ok: true, assets, libraryDir, importedCount };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

safeHandle("file:delete-laugh-asset", async (_event, payload = {}) => {
  try {
    const assetId = safeText(payload.assetId);
    const { assets } = listLaughAssetsInternal();
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return { ok: false, error: "Không tìm thấy laugh asset." };
    try { fs.rmSync(asset.filePath, { force: true }); } catch {}
    const next = listLaughAssetsInternal();
    return { ok: true, assets: next.assets, libraryDir: next.libraryDir };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

safeHandle("file:open-laugh-assets-folder", async () => {
  try {
    const root = ensureLaughAssetsRootDir();
    const openError = await shell.openPath(root);
    if (openError) return { ok: false, error: openError };
    return { ok: true, path: root };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

safeHandle("file:read-base64", async (_event, payload = {}) => {
  try {
    const filePath = safeText(payload.filePath);
    if (!filePath || !fs.existsSync(filePath)) throw new Error("Không tìm thấy file.");
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg"
    };
    const mime = mimeMap[ext] || "application/octet-stream";
    return `data:${mime};base64,${buf.toString("base64")}`; // Direct return of string
  } catch (error) {
    // Throw error to be caught by the frontend promise .catch()
    throw new Error(error?.message || String(error));
  }
});

safeHandle("file:delete-bgm-asset", async (_event, payload = {}) => {
  try {
    const assetId = normalizeBgmId(payload.assetId);
    const assets = readBgmAssets().map(normalizeBgmAsset);
    const found = assets.find((item) => item.id === assetId);
    if (found?.filePath && fs.existsSync(found.filePath)) {
      try { fs.unlinkSync(found.filePath); } catch {}
    }
    const next = assets.filter((item) => item.id !== assetId);
    writeBgmAssets(next);
    return { ok: true, assets: next };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

module.exports = { registerEasyVoiceHandlers: () => true };
