import fs from "fs";
import path from "path";
import os from "os";

const APP_FOLDER_NAME = "English Voice Generator";
const LEGACY_APP_FOLDER_NAMES = [
  "Easy English Channel Voice Generator",
  "Easy-English-Channel",
  "English-generator",
  "English Generator"
];

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

function getPersistentDataDir() {
  const appData =
    process.env.APPDATA ||
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), "AppData", "Roaming");

  const targetDir = path.join(appData, APP_FOLDER_NAME);

  for (const legacyName of LEGACY_APP_FOLDER_NAMES) {
    const legacyDir = path.join(appData, legacyName);
    if (legacyDir !== targetDir && fs.existsSync(legacyDir)) {
      mergeDirectoryContents(legacyDir, targetDir);
    }
  }

  return ensureDir(targetDir);
}

const DATA_DIR = getPersistentDataDir();
const KEY_FILE = path.join(DATA_DIR, "keys.txt");
const KEY_STATE_FILE = path.join(DATA_DIR, "key-state.json");

let keys = [];
let queue = [];
let index = 0;
let disabledMap = {};
let manualDisabledMap = {};

const DEFAULT_COOLDOWN_MS = 90 * 1000;
const LIMITED_COOLDOWN_MS = 2 * 60 * 1000;
const INVALID_COOLDOWN_MS = 30 * 60 * 1000;

function detectKeyTier(label = "") {
  const text = String(label || "").trim().toLowerCase();
// CHÈN THÊM DÒNG NÀY: Nhận diện nhãn gói 300$
  if (text.includes("vertex") || text.includes("300$")) return "paid";

  if (
    text.includes("paid") ||
    text.includes("cloud") ||
    text.includes("trial") ||
    text.includes("billing") ||
    text.includes("pro")
  ) {
    return "paid";
  }

  if (text.includes("free") || text.includes("gemini")) {
    return "free";
  }

  return "free";
}

function pad2(num) {
  return String(num).padStart(2, "0");
}

function ensureKeyFileDir() {
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
}

function loadState() {
  ensureKeyFileDir();

  if (!fs.existsSync(KEY_STATE_FILE)) {
    manualDisabledMap = {};
    return;
  }

  try {
    const raw = fs.readFileSync(KEY_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw || "{}");
    manualDisabledMap = parsed && typeof parsed.manualDisabledMap === "object" ? parsed.manualDisabledMap : {};
  } catch {
    manualDisabledMap = {};
  }
}

function saveState() {
  ensureKeyFileDir();
  fs.writeFileSync(
    KEY_STATE_FILE,
    JSON.stringify({ manualDisabledMap }, null, 2),
    "utf8"
  );
}

function cleanupStateForExistingKeys() {
  const labels = new Set(keys.map((item) => item.label));
  let changed = false;

  for (const label of Object.keys(manualDisabledMap)) {
    if (!labels.has(label)) {
      delete manualDisabledMap[label];
      changed = true;
    }
  }

  if (changed) saveState();
}

function parseKeys(raw) {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes("=")) {
      const eqIndex = line.indexOf("=");
      const label = line.slice(0, eqIndex).trim();
      const key = line.slice(eqIndex + 1).trim();

      if (!key) continue;

      result.push({
        label: label || `KEY_${pad2(i + 1)}`,
        key
      });
    } else {
      result.push({
        label: `KEY_${pad2(i + 1)}`,
        key: line
      });
    }
  }

  return result;
}

function stringifyKeys(list) {
  return list.map((item) => `${item.label}=${item.key}`).join("\n");
}

function syncQueue() {
  queue = keys.map((item) => ({ ...item }));
  index = 0;
}

function normalizeDisabledEntry(entry) {
  if (!entry) return null;

  if (typeof entry === "number") {
    return {
      disabledAt: entry,
      disabledUntil: entry + DEFAULT_COOLDOWN_MS,
      reason: "cooldown",
      manual: false
    };
  }

  const disabledAt = Number(entry.disabledAt || Date.now());
  const disabledUntil = entry.manual
    ? null
    : Number(entry.disabledUntil || disabledAt + DEFAULT_COOLDOWN_MS);

  return {
    disabledAt,
    disabledUntil,
    reason: String(entry.reason || "cooldown"),
    manual: !!entry.manual
  };
}

function getManualDisabledMeta(label) {
  const entry = normalizeDisabledEntry(manualDisabledMap[label]);
  return entry && entry.manual ? entry : null;
}

function isDisabledInternal(label) {
  // CHÈN THÊM DÒNG NÀY: Gói 300$ luôn sẵn sàng, không bị cooldown
  if (label.includes("VERTEX_AI")) return false;
  
  const manualEntry = getManualDisabledMeta(label);
  if (manualEntry) return true;

  const entry = normalizeDisabledEntry(disabledMap[label]);
  if (!entry) return false;

  if (entry.manual) {
    disabledMap[label] = entry;
    return true;
  }

  if (Date.now() >= entry.disabledUntil) {
    delete disabledMap[label];
    return false;
  }

  disabledMap[label] = entry;
  return true;
}

function getDisabledMeta(label) {
  const manualEntry = getManualDisabledMeta(label);
  if (manualEntry) return manualEntry;

  const entry = normalizeDisabledEntry(disabledMap[label]);
  if (!entry) return null;
  if (!isDisabledInternal(label)) return null;
  return normalizeDisabledEntry(disabledMap[label]);
}

export function loadKeys() {
  ensureKeyFileDir();

  if (!fs.existsSync(KEY_FILE)) {
    fs.writeFileSync(KEY_FILE, "", "utf8");
  }

  const raw = fs.readFileSync(KEY_FILE, "utf8");
  keys = parseKeys(raw);
  loadState();
  cleanupStateForExistingKeys();
  syncQueue();
}

export function getAllKeys() {
  return keys.map((item) => {
    const disabled = isDisabledInternal(item.label);
    const meta = disabled ? getDisabledMeta(item.label) : null;

    return {
      ...item,
      tier: detectKeyTier(item.label),
      disabled,
      disabledReason: meta?.reason || "",
      disabledUntil: meta?.manual
        ? null
        : meta?.disabledUntil
          ? new Date(meta.disabledUntil).toISOString()
          : null,
      manuallyDisabled: !!meta?.manual
    };
  });
}

export function getNextKey(preferredTier = "any", excludeLabels = []) {
  if (queue.length === 0) return null;

  const excluded = new Set(Array.isArray(excludeLabels) ? excludeLabels : []);
  let attempts = 0;

  while (attempts < queue.length) {
    const item = queue[index % queue.length];
    index++;

    if (excluded.has(item.label)) {
      attempts++;
      continue;
    }

    if (isDisabledInternal(item.label)) {
      attempts++;
      continue;
    }

    const tier = detectKeyTier(item.label);
    if (preferredTier !== "any" && tier !== preferredTier) {
      attempts++;
      continue;
    }

    return item;
  }

  return null;
}

export function disableKey(label, options = {}) {
  if (options.manual) {
    manualDisabledMap[label] = {
      disabledAt: Date.now(),
      disabledUntil: null,
      reason: String(options.reason || "manual_disabled"),
      manual: true
    };
    saveState();
    return;
  }

  const reason = String(options.reason || "cooldown");
  let cooldownMs = Number(options.cooldownMs);

  if (!Number.isFinite(cooldownMs) || cooldownMs <= 0) {
    cooldownMs =
      reason === "invalid"
        ? INVALID_COOLDOWN_MS
        : reason === "limited"
          ? LIMITED_COOLDOWN_MS
          : DEFAULT_COOLDOWN_MS;
  }

  const now = Date.now();
  disabledMap[label] = {
    disabledAt: now,
    disabledUntil: now + cooldownMs,
    reason,
    manual: false
  };
}

export function enableKey(label) {
  delete disabledMap[label];
  if (manualDisabledMap[label]) {
    delete manualDisabledMap[label];
    saveState();
  }
}

export function resetDisabledKeys() {
  disabledMap = {};
}

export function moveKeyToEnd(label) {
  const idx = queue.findIndex((item) => item.label === label);
  if (idx === -1) return;

  const picked = queue.splice(idx, 1)[0];
  queue.push(picked);

  if (queue.length > 0) {
    index = index % queue.length;
  } else {
    index = 0;
  }
}

export function replaceKeys(newRaw) {
  ensureKeyFileDir();
  fs.writeFileSync(KEY_FILE, newRaw, "utf8");
  loadKeys();
  disabledMap = {};
}

export function clearAllKeys() {
  ensureKeyFileDir();
  fs.writeFileSync(KEY_FILE, "", "utf8");
  keys = [];
  queue = [];
  index = 0;
  disabledMap = {};
  manualDisabledMap = {};
  saveState();
}

export function removeKeysByLabels(labels) {
  const set = new Set(labels || []);

  keys = keys.filter((item) => !set.has(item.label));

  for (const label of set) {
    delete disabledMap[label];
    delete manualDisabledMap[label];
  }

  ensureKeyFileDir();
  fs.writeFileSync(KEY_FILE, stringifyKeys(keys), "utf8");
  saveState();
  syncQueue();
}

export function normalizeKeys() {
  const seen = new Set();
  const unique = [];

  for (const item of keys) {
    const realKey = (item.key || "").trim();
    if (!realKey) continue;
    if (seen.has(realKey)) continue;

    seen.add(realKey);
    unique.push({
      label: item.label,
      key: realKey,
      tier: detectKeyTier(item.label)
    });
  }

  unique.sort((a, b) => {
    const tierOrder = { paid: 0, free: 1 };
    const tierDiff = (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9);
    if (tierDiff !== 0) return tierDiff;

    return a.label.localeCompare(b.label, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });

  let paidIndex = 1;
  let freeIndex = 1;

  keys = unique.map((item) => {
    if (item.tier === "paid") {
      return {
        label: `PAID_${pad2(paidIndex++)}`,
        key: item.key
      };
    }

    return {
      label: `GEMINI_${pad2(freeIndex++)}`,
      key: item.key
    };
  });

  disabledMap = {};
  manualDisabledMap = {};
  ensureKeyFileDir();
  fs.writeFileSync(KEY_FILE, stringifyKeys(keys), "utf8");
  saveState();
  syncQueue();

  return {
    totalKeys: keys.length
  };
}

export function getKeyTier(label) {
  return detectKeyTier(label);
}

export function isPaidKeyLabel(label) {
  return detectKeyTier(label) === "paid";
}

export function isGeminiKeyLabel(label) {
  return detectKeyTier(label) === "free";
}

export function getKeyStatsTemplate() {
  const stats = {};

  for (const item of keys) {
    stats[item.label] = {
      success: 0,
      fail: 0,
      lastUsed: null
    };
  }

  return stats;
}
