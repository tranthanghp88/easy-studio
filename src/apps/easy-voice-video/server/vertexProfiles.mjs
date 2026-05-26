import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const DATA_DIR = path.join(os.homedir(), ".easy-english-channel");
const PROFILE_DIR = path.join(DATA_DIR, "vertex-profiles");
const PROFILE_INDEX_FILE = path.join(PROFILE_DIR, "profiles.json");
const DEFAULT_CREDENTIALS_PATH = path.join(process.cwd(), "key-300.json");
const DEFAULT_PROJECT_ID = process.env.GCP_PROJECT_ID || "ttsp-493112";
const DEFAULT_LOCATION = process.env.GCP_LOCATION || "us-central1";
const DEFAULT_MODEL = process.env.VERTEX_TTS_MODEL || "gemini-2.5-flash-tts";

function ensureDir() {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
}

function safeName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9-_ ]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "vertex-profile";
}

function inferProjectId(credentials) {
  return String(credentials?.project_id || credentials?.quota_project_id || "").trim();
}

function defaultIndex() {
  const profiles = [];
  if (fs.existsSync(DEFAULT_CREDENTIALS_PATH)) {
    profiles.push({
      id: "default-vertex-ai",
      name: "VERTEX AI",
      projectId: DEFAULT_PROJECT_ID,
      location: DEFAULT_LOCATION,
      model: DEFAULT_MODEL,
      credentialsPath: DEFAULT_CREDENTIALS_PATH,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      builtIn: true
    });
  }
  return { version: 1, activeProfileId: profiles[0]?.id || "", profiles };
}

export function loadVertexProfileIndex() {
  ensureDir();
  if (!fs.existsSync(PROFILE_INDEX_FILE)) {
    const idx = defaultIndex();
    saveVertexProfileIndex(idx);
    return idx;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(PROFILE_INDEX_FILE, "utf8"));
    const idx = {
      version: 1,
      activeProfileId: String(parsed?.activeProfileId || ""),
      profiles: Array.isArray(parsed?.profiles) ? parsed.profiles : []
    };
    if (!idx.profiles.length) return defaultIndex();
    if (!idx.activeProfileId || !idx.profiles.some((p) => p.id === idx.activeProfileId)) {
      idx.activeProfileId = idx.profiles[0]?.id || "";
      saveVertexProfileIndex(idx);
    }
    return idx;
  } catch {
    const idx = defaultIndex();
    saveVertexProfileIndex(idx);
    return idx;
  }
}

export function saveVertexProfileIndex(index) {
  ensureDir();
  fs.writeFileSync(PROFILE_INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
}

export function listVertexProfiles() {
  const idx = loadVertexProfileIndex();
  return {
    activeProfileId: idx.activeProfileId,
    profileDir: PROFILE_DIR,
    profiles: idx.profiles.map((p) => ({
      ...p,
      credentialsPath: p.credentialsPath,
      credentialsExists: !!p.credentialsPath && fs.existsSync(p.credentialsPath),
      isActive: p.id === idx.activeProfileId
    }))
  };
}

export function getActiveVertexProfile() {
  const idx = loadVertexProfileIndex();
  const profile = idx.profiles.find((p) => p.id === idx.activeProfileId) || idx.profiles[0] || null;
  if (!profile) {
    return {
      id: "env-vertex-ai",
      name: "VERTEX AI",
      projectId: DEFAULT_PROJECT_ID,
      location: DEFAULT_LOCATION,
      model: DEFAULT_MODEL,
      credentialsPath: DEFAULT_CREDENTIALS_PATH
    };
  }
  return profile;
}

export function activateVertexProfile(profileId) {
  const idx = loadVertexProfileIndex();
  const id = String(profileId || "").trim();
  const profile = idx.profiles.find((p) => p.id === id);
  if (!profile) throw new Error("Không tìm thấy Vertex profile.");
  if (profile.credentialsPath && !fs.existsSync(profile.credentialsPath)) {
    throw new Error("File credential của profile không còn tồn tại.");
  }
  idx.activeProfileId = id;
  saveVertexProfileIndex(idx);
  return profile;
}

export function importVertexProfile({ name, credentialsJson, projectId, location, model }) {
  ensureDir();
  const raw = String(credentialsJson || "").trim();
  if (!raw) throw new Error("File service-account JSON trống.");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("File service-account không phải JSON hợp lệ.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("File này chưa giống service-account JSON của Google Cloud.");
  }
  const now = new Date().toISOString();
  const id = `vertex-${crypto.randomBytes(6).toString("hex")}`;
  const finalName = String(name || parsed.project_id || "Vertex Account").trim() || "Vertex Account";
  const credentialsPath = path.join(PROFILE_DIR, `${safeName(finalName)}-${id}.json`);
  fs.writeFileSync(credentialsPath, JSON.stringify(parsed, null, 2), "utf8");

  const idx = loadVertexProfileIndex();
  const profile = {
    id,
    name: finalName,
    projectId: String(projectId || inferProjectId(parsed) || DEFAULT_PROJECT_ID).trim(),
    location: String(location || DEFAULT_LOCATION).trim(),
    model: String(model || DEFAULT_MODEL).trim(),
    credentialsPath,
    createdAt: now,
    updatedAt: now,
    builtIn: false
  };
  idx.profiles.push(profile);
  idx.activeProfileId = id;
  saveVertexProfileIndex(idx);
  return profile;
}

export function deleteVertexProfile(profileId) {
  const idx = loadVertexProfileIndex();
  const id = String(profileId || "").trim();
  const profile = idx.profiles.find((p) => p.id === id);
  if (!profile) throw new Error("Không tìm thấy Vertex profile.");
  if (profile.builtIn) throw new Error("Không thể xóa profile mặc định.");
  idx.profiles = idx.profiles.filter((p) => p.id !== id);
  if (profile.credentialsPath && fs.existsSync(profile.credentialsPath)) {
    fs.unlinkSync(profile.credentialsPath);
  }
  if (idx.activeProfileId === id) idx.activeProfileId = idx.profiles[0]?.id || "";
  saveVertexProfileIndex(idx);
  return { activeProfileId: idx.activeProfileId };
}
