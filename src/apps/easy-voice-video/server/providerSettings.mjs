import fs from "fs";
import path from "path";
import os from "os";

const APP_FOLDER_NAME = "English Voice Generator";
const APPDATA_ROOT =
  process.env.APPDATA ||
  process.env.LOCALAPPDATA ||
  path.join(os.homedir(), "AppData", "Roaming");

const DATA_DIR = path.join(APPDATA_ROOT, APP_FOLDER_NAME);
const SETTINGS_FILE = path.join(DATA_DIR, "provider-settings.json");

const DEFAULT_SETTINGS = {
  vertexEnabled: true,
  geminiEnabled: true,
  cloudApiKeyEnabled: false,
  preferredOrder: ["vertex", "gemini"],
  updatedAt: null
};

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normalizeSettings(value = {}) {
  const preferredOrder = Array.isArray(value.preferredOrder)
    ? value.preferredOrder.filter((item) => ["vertex", "gemini", "cloud"].includes(String(item)))
    : DEFAULT_SETTINGS.preferredOrder;

  return {
    ...DEFAULT_SETTINGS,
    ...value,
    vertexEnabled: value.vertexEnabled !== false,
    geminiEnabled: value.geminiEnabled !== false,
    cloudApiKeyEnabled: value.cloudApiKeyEnabled === true,
    preferredOrder: preferredOrder.length ? preferredOrder : DEFAULT_SETTINGS.preferredOrder,
    updatedAt: value.updatedAt || null
  };
}

export function getProviderSettings() {
  ensureDir();
  if (!fs.existsSync(SETTINGS_FILE)) {
    const initial = normalizeSettings(DEFAULT_SETTINGS);
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8") || "{}");
    return normalizeSettings(parsed);
  } catch {
    return normalizeSettings(DEFAULT_SETTINGS);
  }
}

export function updateProviderSettings(patch = {}) {
  ensureDir();
  const current = getProviderSettings();
  const next = normalizeSettings({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function isProviderEnabled(provider) {
  const settings = getProviderSettings();
  const key = String(provider || "").toLowerCase();
  if (key === "vertex") return settings.vertexEnabled;
  if (key === "gemini") return settings.geminiEnabled;
  if (key === "cloud") return settings.cloudApiKeyEnabled;
  return false;
}
