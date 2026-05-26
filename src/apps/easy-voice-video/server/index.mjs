import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { GoogleAuth } from "google-auth-library";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { VertexAI } from '@google-cloud/vertexai';
import {
  listVertexProfiles,
  getActiveVertexProfile,
  activateVertexProfile,
  importVertexProfile,
  deleteVertexProfile
} from "./vertexProfiles.mjs";
import { getProviderSettings, updateProviderSettings, isProviderEnabled } from "./providerSettings.mjs";

import {
  loadKeys,
  getNextKey,
  replaceKeys,
  getAllKeys,
  getKeyStatsTemplate,
  clearAllKeys,
  removeKeysByLabels,
  disableKey,
  enableKey,
  resetDisabledKeys,
  moveKeyToEnd,
  normalizeKeys,
  getKeyTier,
  isPaidKeyLabel,
  isGeminiKeyLabel
} from "./keyManager.mjs";

import { initStats, logSuccess, logFail, getStats } from "./keyStats.mjs";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
console.log("SERVER FILE LOADED:", __filename);
app.use(cors());
app.use(express.json({ limit: "4mb" }));

// --- CẤU HÌNH VERTEX AI ---
const DEFAULT_GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "ttsp-493112";
const DEFAULT_GCP_LOCATION = process.env.GCP_LOCATION || "us-central1";

// Vertex Gemini TTS có quota request/phút theo project + base model.
// Nếu bắn nhiều chunk liên tục, dễ gặp 429 RESOURCE_EXHAUSTED.
// Queue này ép toàn bộ request Vertex chạy tuần tự và giãn nhịp an toàn.
const VERTEX_TTS_MIN_INTERVAL_MS = Number(process.env.VERTEX_TTS_MIN_INTERVAL_MS || 3500);
const VERTEX_TTS_RETRY_DELAYS_MS = [10000, 30000, 65000];
let vertexTtsQueue = Promise.resolve();
let vertexTtsLastRequestAt = 0;

import { GoogleGenAI } from "@google/genai";

let activeVertexProfile = getActiveVertexProfile();
function applyActiveVertexProfile(profile = getActiveVertexProfile()) {
  activeVertexProfile = profile;
  if (profile.credentialsPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = profile.credentialsPath;
  }
  return profile;
}
applyActiveVertexProfile(activeVertexProfile);

let auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  keyFilename: activeVertexProfile.credentialsPath
});

let ai = new GoogleGenAI({
  vertexai: true,
  project: activeVertexProfile.projectId || DEFAULT_GCP_PROJECT_ID,
  location: activeVertexProfile.location || DEFAULT_GCP_LOCATION,
});

function rebuildVertexClients(profile = getActiveVertexProfile()) {
  applyActiveVertexProfile(profile);
  auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    keyFilename: activeVertexProfile.credentialsPath
  });
  ai = new GoogleGenAI({
    vertexai: true,
    project: activeVertexProfile.projectId || DEFAULT_GCP_PROJECT_ID,
    location: activeVertexProfile.location || DEFAULT_GCP_LOCATION,
  });
  console.log(`[Vertex Profile] Active: ${activeVertexProfile.name || activeVertexProfile.id} / ${activeVertexProfile.projectId} / ${activeVertexProfile.location}`);
  return activeVertexProfile;
}

async function getAccessToken() {
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token || !token.token) {
    throw new Error("No access token");
  }

  return token.token;
}

function isVertexQuotaError(error) {
  const message = String(error?.message || error || "");
  return (
    message.includes("429") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("Quota exceeded") ||
    message.includes("generate_content_requests_per_minute")
  );
}

async function runVertexTtsQueued(task) {
  const run = vertexTtsQueue.then(async () => {
    const elapsed = Date.now() - vertexTtsLastRequestAt;
    const waitMs = Math.max(0, VERTEX_TTS_MIN_INTERVAL_MS - elapsed);
    if (waitMs > 0) {
      console.log(`[Vertex TTS Queue] Chờ ${waitMs}ms để tránh quota RPM...`);
      await sleep(waitMs);
    }

    vertexTtsLastRequestAt = Date.now();
    return task();
  });

  // Không để một request lỗi làm hỏng queue cho các request sau.
  vertexTtsQueue = run.catch(() => null);
  return run;
}

async function callVertexAIOnce(text, voice) {
  console.log(`[Vertex SDK] text length: ${text.length}, voice: ${voice}`);

  const response = await ai.models.generateContent({
    model: activeVertexProfile.model || "gemini-2.5-flash-tts",

    contents: [
      {
        role: "user",
        parts: [
          {
            text: text
          }
        ]
      }
    ],

    config: {
      responseModalities: ["AUDIO"],

      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice || "Puck"
          }
        }
      }
    }
  });

  const audioPart = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData
  );

  if (!audioPart?.inlineData?.data) {
    throw new Error("No audio returned");
  }

  return Buffer.from(audioPart.inlineData.data, "base64");
}

async function callVertexAI(text, voice) {
  return runVertexTtsQueued(async () => {
    for (let attempt = 0; attempt <= VERTEX_TTS_RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await callVertexAIOnce(text, voice);
      } catch (err) {
        const message = err?.message || String(err);
        console.error("[Vertex SDK ERROR]", message);

        const canRetryQuota = isVertexQuotaError(err) && attempt < VERTEX_TTS_RETRY_DELAYS_MS.length;
        if (!canRetryQuota) {
          return null;
        }

        const delayMs = VERTEX_TTS_RETRY_DELAYS_MS[attempt];
        console.log(
          `[Vertex TTS Retry] Gặp quota 429, chờ ${Math.round(delayMs / 1000)}s rồi thử lại (${attempt + 1}/${VERTEX_TTS_RETRY_DELAYS_MS.length})...`
        );
        await sleep(delayMs);
      }
    }

    return null;
  });
}

loadKeys();
initStats(getKeyStatsTemplate());

const SAMPLE_RATE = 24000;
const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const GEMINI_TTS_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`;
const CLOUD_TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const MAX_RECENT_LOGS = 500;
const JOB_TTL_MS = 30 * 60 * 1000;
const CHUNK_CHAR_LIMIT = 900;
const INTERNAL_RETRY_DELAYS_MS = [2000, 5000];
const CACHE_APP_FOLDER_NAME = "English Voice Generator";
const LEGACY_APP_FOLDER_NAMES = [
  "Easy English Channel Voice Generator",
  "Easy-English-Channel",
  "English-generator",
  "English Generator"
];
const CACHE_DIR = path.join(
  process.env.APPDATA ||
    process.env.LOCALAPPDATA ||
    path.join(os.homedir(), "AppData", "Roaming"),
  CACHE_APP_FOLDER_NAME,
  "tts-cache"
);
const CACHE_AUDIO_DIR = path.join(CACHE_DIR, "audio");
const CACHE_INDEX_FILE = path.join(CACHE_DIR, "cache-index.json");
const LAUGH_ASSET_FOLDER_NAME = "laugh-assets";
const APPDATA_ROOT =
  process.env.APPDATA ||
  process.env.LOCALAPPDATA ||
  path.join(os.homedir(), "AppData", "Roaming");

const LAUGH_ASSET_APPDATA_DIRS = [
  path.join(APPDATA_ROOT, CACHE_APP_FOLDER_NAME, LAUGH_ASSET_FOLDER_NAME),
  ...LEGACY_APP_FOLDER_NAMES.map((name) => path.join(APPDATA_ROOT, name, LAUGH_ASSET_FOLDER_NAME))
];

const LAUGH_ASSET_SEARCH_DIRS = [
  path.join(process.cwd(), LAUGH_ASSET_FOLDER_NAME),
  path.join(__dirname, LAUGH_ASSET_FOLDER_NAME),
  ...LAUGH_ASSET_APPDATA_DIRS
];
const LAUGH_ASSET_PRIMARY_SAVE_DIR = LAUGH_ASSET_APPDATA_DIRS[0];

const keyRuntime = {};
const requestLogs = [];
const ttsJobs = new Map();

const VOICE_CATALOG = {
  podcast: [
    {
      id: "podcast-default",
      apiId: null,
      label: "Podcast mặc định - Puck + Kore",
      description: "A = Puck, R = Kore",
      mode: "podcast",
      language: "en",
      speakers: {
        A: "Puck",
        R: "Kore"
      }
    },
    {
      id: "podcast-friendly",
      apiId: null,
      label: "Podcast thân thiện - Puck + Zephyr",
      description: "A = Puck, R = Zephyr",
      mode: "podcast",
      language: "en",
      speakers: {
        A: "Puck",
        R: "Zephyr"
      }
    },
    {
      id: "podcast-deep",
      apiId: null,
      label: "Podcast trầm ấm - Charon + Kore",
      description: "A = Charon, R = Kore",
      mode: "podcast",
      language: "en",
      speakers: {
        A: "Charon",
        R: "Kore"
      }
    },
    {
      id: "podcast-story",
      apiId: null,
      label: "Podcast kể chuyện - Fenrir + Aoede",
      description: "A = Fenrir, R = Aoede",
      mode: "podcast",
      language: "en",
      speakers: {
        A: "Fenrir",
        R: "Aoede"
      }
    },
    {
      id: "podcast-clear",
      apiId: null,
      label: "Podcast rõ chữ - Orus + Callirrhoe",
      description: "A = Orus, R = Callirrhoe",
      mode: "podcast",
      language: "en",
      speakers: {
        A: "Orus",
        R: "Callirrhoe"
      }
    },
    {
      id: "podcast-warm",
      apiId: null,
      label: "Podcast tự nhiên - Enceladus + Leda",
      description: "A = Enceladus, R = Leda",
      mode: "podcast",
      language: "en",
      speakers: {
        A: "Enceladus",
        R: "Leda"
      }
    },
    {
      id: "podcast-serious",
      apiId: null,
      label: "Podcast chuyên sâu - Iapetus + Despina",
      description: "A = Iapetus, R = Despina",
      mode: "podcast",
      language: "en",
      speakers: {
        A: "Iapetus",
        R: "Despina"
      }
    }
  ],
  englishMale: [
    {
      id: "google_puck",
      apiId: "Puck",
      label: "Puck (Male)",
      description: "Google/Vertex default voice - Energetic, friendly",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_charon",
      apiId: "Charon",
      label: "Charon (Male)",
      description: "Google/Vertex default voice - Deep, strong",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_fenrir",
      apiId: "Fenrir",
      label: "Fenrir (Male)",
      description: "Google/Vertex default voice - Warm, storytelling",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_orus",
      apiId: "Orus",
      label: "Orus (Male)",
      description: "Google/Vertex default voice - Confident, clear",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_enceladus",
      apiId: "Enceladus",
      label: "Enceladus (Male)",
      description: "Google/Vertex default voice - Natural, grounded",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_iapetus",
      apiId: "Iapetus",
      label: "Iapetus (Male)",
      description: "Google/Vertex default voice - Deep, calm",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_umbriel",
      apiId: "Umbriel",
      label: "Umbriel (Male)",
      description: "Google/Vertex default voice - Smooth, serious",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_algieba",
      apiId: "Algieba",
      label: "Algieba (Male)",
      description: "Google/Vertex default voice - Warm, professional",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_algenib",
      apiId: "Algenib",
      label: "Algenib (Male)",
      description: "Google/Vertex default voice - Clear, direct",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_alnilam",
      apiId: "Alnilam",
      label: "Alnilam (Male)",
      description: "Google/Vertex default voice - Balanced, narration",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_rasalgethi",
      apiId: "Rasalgethi",
      label: "Rasalgethi (Male)",
      description: "Google/Vertex default voice - Rich, storytelling",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_sadaltager",
      apiId: "Sadaltager",
      label: "Sadaltager (Male)",
      description: "Google/Vertex default voice - Calm, measured",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_schedar",
      apiId: "Schedar",
      label: "Schedar (Male)",
      description: "Google/Vertex default voice - Warm, stable",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_zubenelgenubi",
      apiId: "Zubenelgenubi",
      label: "Zubenelgenubi (Male)",
      description: "Google/Vertex default voice - Distinct, conversational",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_achird",
      apiId: "Achird",
      label: "Achird (Male)",
      description: "Google/Vertex default voice - Friendly, casual",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_gacrux",
      apiId: "Gacrux",
      label: "Gacrux (Male)",
      description: "Google/Vertex default voice - Deep, dramatic",
      mode: "single",
      language: "en",
      gender: "male"
    },
    {
      id: "google_pulcherrima",
      apiId: "Pulcherrima",
      label: "Pulcherrima (Male)",
      description: "Google/Vertex default voice - Bright, energetic",
      mode: "single",
      language: "en",
      gender: "male"
    }
  ],
  englishFemale: [
    {
      id: "google_zephyr",
      apiId: "Zephyr",
      label: "Zephyr (Female)",
      description: "Google/Vertex default voice - Bright, friendly",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_kore",
      apiId: "Kore",
      label: "Kore (Female)",
      description: "Google/Vertex default voice - Clear, professional",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_leda",
      apiId: "Leda",
      label: "Leda (Female)",
      description: "Google/Vertex default voice - Soft, natural",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_aoede",
      apiId: "Aoede",
      label: "Aoede (Female)",
      description: "Google/Vertex default voice - Warm, expressive",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_callirrhoe",
      apiId: "Callirrhoe",
      label: "Callirrhoe (Female)",
      description: "Google/Vertex default voice - Elegant, clear",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_autonoe",
      apiId: "Autonoe",
      label: "Autonoe (Female)",
      description: "Google/Vertex default voice - Light, conversational",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_despina",
      apiId: "Despina",
      label: "Despina (Female)",
      description: "Google/Vertex default voice - Smooth, friendly",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_erinome",
      apiId: "Erinome",
      label: "Erinome (Female)",
      description: "Google/Vertex default voice - Gentle, calm",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_laomedeia",
      apiId: "Laomedeia",
      label: "Laomedeia (Female)",
      description: "Google/Vertex default voice - Natural, storytelling",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_achernar",
      apiId: "Achernar",
      label: "Achernar (Female)",
      description: "Google/Vertex default voice - Bright, polished",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_sadachbia",
      apiId: "Sadachbia",
      label: "Sadachbia (Female)",
      description: "Google/Vertex default voice - Soft, clean",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_sulafat",
      apiId: "Sulafat",
      label: "Sulafat (Female)",
      description: "Google/Vertex default voice - Clear, balanced",
      mode: "single",
      language: "en",
      gender: "female"
    },
    {
      id: "google_vindemiatrix",
      apiId: "Vindemiatrix",
      label: "Vindemiatrix (Female)",
      description: "Google/Vertex default voice - Warm, mature",
      mode: "single",
      language: "en",
      gender: "female"
    }
  ],
  vietnameseMale: [],
  vietnameseFemale: []
};

function getAllSingleVoices() {
  return [
    ...VOICE_CATALOG.englishMale,
    ...VOICE_CATALOG.englishFemale,
    ...VOICE_CATALOG.vietnameseMale,
    ...VOICE_CATALOG.vietnameseFemale
  ];
}

function findSingleVoiceByIdOrApiId(value) {
  const needle = String(value || "").trim().toLowerCase();
  if (!needle) return null;

  return (
    getAllSingleVoices().find(
      (item) =>
        String(item.id || "").toLowerCase() === needle ||
        String(item.apiId || "").toLowerCase() === needle
    ) || null
  );
}

function findPodcastVoiceById(value) {
  const needle = String(value || "").trim().toLowerCase();
  if (!needle) return null;

  return (
    VOICE_CATALOG.podcast.find((item) => String(item.id || "").toLowerCase() === needle) || null
  );
}

function nowIso() {
  return new Date().toISOString();
}

function dedupeExistingDirs(list = []) {
  const out = [];
  const seen = new Set();
  for (const dir of list) {
    const safe = String(dir || "").trim();
    if (!safe) continue;
    const key = safe.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(safe);
  }
  return out;
}

function safeErrorMessage(error) {
  return (
    (error && error.message) ||
    (typeof error === "string" ? error : "") ||
    "Unknown error"
  );
}

function createJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanupExpiredJobs() {
  const now = Date.now();

  for (const [jobId, job] of ttsJobs.entries()) {
    const created = new Date(job.createdAt).getTime();
    if (now - created > JOB_TTL_MS) {
      ttsJobs.delete(jobId);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncRuntimeFromKeys() {
  const keys = getAllKeys();

  for (const item of keys) {
    if (!keyRuntime[item.label]) {
      keyRuntime[item.label] = {
        lastStatus: "unknown",
        lastError: "",
        lastProvider: "",
        totalChars: 0,
        updatedAt: null,
        quotaExceededCount: 0
      };
    }
  }

  for (const label of Object.keys(keyRuntime)) {
    const exists = keys.some((item) => item.label === label);
    if (!exists) {
      delete keyRuntime[label];
    }
  }
}

function resetRuntimeFromKeys() {
  syncRuntimeFromKeys();

  for (const label of Object.keys(keyRuntime)) {
    keyRuntime[label] = {
      lastStatus: "unknown",
      lastError: "",
      lastProvider: "",
      totalChars: 0,
      updatedAt: null,
      quotaExceededCount: 0
    };
  }
}

syncRuntimeFromKeys();

function addLog(entry) {
  requestLogs.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: nowIso(),
    ...entry
  });

  if (requestLogs.length > MAX_RECENT_LOGS) {
    requestLogs.length = MAX_RECENT_LOGS;
  }
}

function clearLogs() {
  requestLogs.length = 0;
}

function updateKeyRuntime(label, patch = {}) {
  if (!keyRuntime[label]) {
    keyRuntime[label] = {
      lastStatus: "unknown",
      lastError: "",
      lastProvider: "",
      totalChars: 0,
      updatedAt: null,
      quotaExceededCount: 0
    };
  }

  keyRuntime[label] = {
    ...keyRuntime[label],
    ...patch,
    updatedAt: nowIso()
  };
}

function extractRetrySeconds(message = "") {
  const text = String(message || "");
  const retryMatch =
    text.match(/retry in\s+([\d.]+)\s*s/i) ||
    text.match(/please retry in\s+([\d.]+)\s*s/i) ||
    text.match(/try again in\s+([\d.]+)\s*s/i);

  if (!retryMatch) return null;

  const value = Number(retryMatch[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  return Math.max(1, Math.ceil(value));
}

function inferStatusFromError(message = "") {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("quota") ||
    text.includes("resource_exhausted") ||
    text.includes("too many requests") ||
    text.includes("rate limit") ||
    text.includes("429")
  ) {
    return "limited";
  }

  if (
    text.includes("api key not valid") ||
    text.includes("permission denied") ||
    text.includes("unauthenticated") ||
    text.includes("forbidden") ||
    text.includes("invalid api key") ||
    text.includes("request had invalid authentication credentials")
  ) {
    return "invalid";
  }

  if (
    text.includes("internal error") ||
    text.includes("an internal error has occurred") ||
    text.includes("internal") ||
    text.includes("http 500") ||
    text.includes("500 internal") ||
    text.includes("backend error") ||
    text.includes("service unavailable") ||
    text.includes("503")
  ) {
    return "error";
  }

  return "error";
}

function getUiStatus(item, rt) {
  const disabled = !!item?.disabled;
  const lastStatus = String(rt?.lastStatus || "unknown").toLowerCase();
  const err = String(rt?.lastError || "").toLowerCase();

  if (disabled) {
    const disabledReason = String(item?.disabledReason || "").toLowerCase();

    if (
      disabledReason === "limited" ||
      err.includes("quota") ||
      err.includes("resource_exhausted") ||
      err.includes("too many requests") ||
      err.includes("rate limit")
    ) {
      return "limited";
    }

    if (
      disabledReason === "invalid" ||
      err.includes("invalid") ||
      err.includes("api key not valid") ||
      err.includes("permission denied") ||
      err.includes("unauthenticated") ||
      err.includes("forbidden")
    ) {
      return "invalid";
    }

    return "error";
  }

  if (lastStatus === "invalid") return "invalid";
  if (lastStatus === "limited") return "limited";
  if (lastStatus === "error") return "error";

  if (
    err.includes("quota") ||
    err.includes("resource_exhausted") ||
    err.includes("too many requests") ||
    err.includes("rate limit")
  ) {
    return "limited";
  }

  if (
    err.includes("invalid") ||
    err.includes("api key not valid") ||
    err.includes("permission denied") ||
    err.includes("unauthenticated") ||
    err.includes("forbidden")
  ) {
    return "invalid";
  }

  return "active";
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

function isLaughCueText(text) {
  return normalizeLaughSubtitleText(text) === "[laugh]";
}

function isLaughOnlyText(text) {
  return isLaughCueText(text);
}

function mapLaughPromptText(text) {
  if (isLaughCueText(text)) return "[laugh]";
  return String(text || "").trim();
}

function buildPromptFromScript(script) {
  const lines = (script || [])
    .filter((item) => item && item.role && item.text)
    .flatMap((item) => {
      const content = mapLaughPromptText(item.text);
      if (item.role === "A") {
        return [`Host A: ${content}`];
      }
      if (item.role === "R") {
        return [`Host B: ${content}`];
      }
      return [`Host A: ${content}`, `Host B: ${content}`];
    });

  return [
    "Read the following conversation naturally.",
    "Use two distinct speakers consistently.",
    "Host A must always use a male voice.",
    "Host B must always use a female voice.",
    "Do not swap the speakers.",
    "Keep the same speaker identity for every line.",
    "When a line is [laugh], produce a short natural human laugh sound only.",
    "Do not say the words laugh, hahaha, or ha ha ha out loud.",
    "",
    ...lines
  ].join("\n");
}

function escapeSsml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function convertSpeedToSsmlRate(speed) {
  const value = Number(speed || 1);
  if (!Number.isFinite(value) || value <= 0) return "100%";
  const percent = Math.max(70, Math.min(160, Math.round(value * 100)));
  return `${percent}%`;
}

function convertPitchToSsmlPitch(pitch) {
  const value = Number(pitch || 1);
  if (!Number.isFinite(value)) return "+0st";
  const semitones = Math.max(-8, Math.min(8, Math.round((value - 1) * 8)));
  return `${semitones >= 0 ? "+" : ""}${semitones}st`;
}

function buildSingleSpeakerPrompt(script, voiceLabel, language, preset = {}) {
  const safeLanguage = language === "vi" ? "vi-VN" : "en-US";
  const rate = convertSpeedToSsmlRate(preset?.speed || 1);
  const pitch = convertPitchToSsmlPitch(preset?.pitch || 1);
  const breakMs = Math.max(0, Math.min(1500, Math.round(Number(preset?.pause || 0) * 1000)));

  const lines = (script || [])
    .filter((item) => item && item.text)
    .map((item) => {
      const raw = String(item.text || "").trim();
      if (isLaughCueText(raw)) return '<break time="50ms"/>';
      return escapeSsml(raw);
    })
    .filter(Boolean);

  const body = lines.join(breakMs > 0 ? ` <break time="${breakMs}ms"/> ` : " ");

  return `<speak><lang xml:lang="${safeLanguage}"><prosody rate="${rate}" pitch="${pitch}">${body}</prosody></lang></speak>`;
}

function createWaveBufferFromPcm(
  pcmBuffer,
  sampleRate = SAMPLE_RATE,
  channels = 1,
  bitsPerSample = 16
) {
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataLength = pcmBuffer.length;
  const wav = Buffer.alloc(44 + dataLength);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataLength, 40);

  pcmBuffer.copy(wav, 44);
  return wav;
}

function createSilencePcm(seconds, sampleRate = SAMPLE_RATE, channels = 1, bitsPerSample = 16) {
  const safeSeconds = Number(seconds || 0);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) {
    return Buffer.alloc(0);
  }

  const bytesPerSample = bitsPerSample / 8;
  const totalSamples = Math.max(1, Math.round(sampleRate * safeSeconds));
  const totalBytes = totalSamples * channels * bytesPerSample;

  return Buffer.alloc(totalBytes, 0);
}

function clamp16(value) {
  if (value > 32767) return 32767;
  if (value < -32768) return -32768;
  return value;
}

function mixPcmBuffers(buffers, gains = []) {
  const validBuffers = (Array.isArray(buffers) ? buffers : []).filter(
    (buf) => Buffer.isBuffer(buf) && buf.length > 0
  );
  if (!validBuffers.length) return Buffer.alloc(0);
  if (validBuffers.length === 1) return Buffer.from(validBuffers[0]);

  const maxLength = validBuffers.reduce((max, buf) => Math.max(max, buf.length), 0);
  const safeLength = maxLength - (maxLength % 2);
  const out = Buffer.alloc(safeLength);

  for (let offset = 0; offset < safeLength; offset += 2) {
    let mixed = 0;

    for (let i = 0; i < validBuffers.length; i++) {
      const buf = validBuffers[i];
      if (offset + 1 >= buf.length) continue;
      const gain = Number.isFinite(gains[i]) ? gains[i] : 1;
      mixed += Math.round(buf.readInt16LE(offset) * gain);
    }

    out.writeInt16LE(clamp16(mixed), offset);
  }

  return out;
}

function appendPcmParts(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = Buffer.alloc(totalLength);
  let offset = 0;

  for (const part of parts) {
    part.copy(merged, offset);
    offset += part.length;
  }

  return merged;
}

function prependSilencePcm(pcmBuffer, seconds) {
  const silence = createSilencePcm(seconds);
  if (!silence.length) return Buffer.from(pcmBuffer || Buffer.alloc(0));
  return appendPcmParts([silence, Buffer.from(pcmBuffer || Buffer.alloc(0))]);
}

function isLikelySharedReaction(text) {
  const clean = String(text || "").trim().toLowerCase();
  if (!clean) return false;
  if (
    clean.length <= 24 &&
    /\b(ha|haha|hahaha|hehe|hihi|lol|wow|oh|oops|ah|uh|yeah)\b/.test(clean)
  ) {
    return true;
  }
  return /^\W*(ha|he|hi){2,}/.test(clean);
}

function getTotalChars(script) {
  return (script || []).reduce((sum, item) => sum + (item?.text?.length || 0), 0);
}

function splitTextIntoPieces(text, maxChars) {
  const clean = String(text || "").trim();
  if (!clean) return [];

  if (clean.length <= maxChars) {
    return [clean];
  }

  const sentenceParts = clean
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const sourceParts =
    sentenceParts.length > 1
      ? sentenceParts
      : clean
          .split(/,\s+|\s+-\s+|\s+/)
          .map((item) => item.trim())
          .filter(Boolean);

  const out = [];
  let buffer = "";

  for (const part of sourceParts) {
    const next = buffer ? `${buffer} ${part}` : part;

    if (next.length <= maxChars) {
      buffer = next;
      continue;
    }

    if (buffer) {
      out.push(buffer);
      buffer = "";
    }

    if (part.length <= maxChars) {
      buffer = part;
      continue;
    }

    let longPart = part;
    while (longPart.length > maxChars) {
      out.push(longPart.slice(0, maxChars));
      longPart = longPart.slice(maxChars).trim();
    }

    if (longPart) {
      buffer = longPart;
    }
  }

  if (buffer) {
    out.push(buffer);
  }

  return out;
}

function getRoleSentencePauseSeconds(role, speakerSettings) {
  const roleKey = role === "R" ? "R" : "A";
  const raw = Number(speakerSettings?.[roleKey]?.pause || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function getPunctuationPauseSeconds(text, role, speakerSettings) {
  const clean = String(text || "").trim();
  if (!clean) return 0;

  const basePause = getRoleSentencePauseSeconds(role, speakerSettings);

  if (/([.!?…]+["')\]]*)$/u.test(clean)) {
    return basePause > 0 ? basePause : 0.3;
  }

  if (/([;:]+["')\]]*)$/u.test(clean)) {
    return basePause > 0 ? Math.max(0.18, basePause * 0.75) : 0.22;
  }

  if (/([,]+["')\]]*)$/u.test(clean)) {
    return basePause > 0 ? Math.max(0.12, basePause * 0.55) : 0.16;
  }

  return 0;
}


function mapLaughTtsText(text) {
  const clean = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, "");
  const laughSet = new Set(["ha", "hah", "haha", "hahaha", "hehe", "heh", "hihi", "lol"]);
  if (laughSet.has(clean) || /^(ha|he|hi){2,}$/i.test(clean) || isLaughCueText(text)) {
    return "[laugh]";
  }
  return String(text || "").trim();
}

function normalizeAutoPauseRules(rules) {
  return (Array.isArray(rules) ? rules : [])
    .map((rule) => ({
      text: String(rule?.text || "").trim().toLowerCase(),
      pause: Number(rule?.pause || 0)
    }))
    .filter((rule) => rule.text && Number.isFinite(rule.pause) && rule.pause > 0);
}

function extractLeadingMarkers(text) {
  const original = String(text || "").trim();
  if (!original) {
    return {
      markers: [],
      cleanText: ""
    };
  }

  const markers = [];
  let cleanText = original;

  while (true) {
    const match = cleanText.match(/^#([^\s#]+)\s*/i);
    if (!match) break;
    markers.push(`#${String(match[1] || "").trim()}`);
    cleanText = cleanText.slice(match[0].length).trim();
  }

  return {
    markers,
    cleanText
  };
}

function resolvePauseFromMarkers(markers, rules) {
  if (!markers.length || !rules.length) return 0;

  let maxPause = 0;
  const normalizedMarkers = markers.map((item) => String(item || "").trim().toLowerCase());

  for (const marker of normalizedMarkers) {
    for (const rule of rules) {
      if (marker === rule.text) {
        maxPause = Math.max(maxPause, rule.pause);
      }
    }
  }

  return maxPause;
}

function keepLinesSeparated(lines = []) {
  return (Array.isArray(lines) ? lines : []).filter((line) => String(line?.text || "").trim());
}

function normalizeScriptUnits(script, speakerSettings, maxChars = CHUNK_CHAR_LIMIT) {
  const autoEnabled = !!speakerSettings?.autoBlockPause;
  const manualBlockPause = Number(speakerSettings?.blockPause || 0);
  const safeManualBlockPause =
    Number.isFinite(manualBlockPause) && manualBlockPause > 0 ? manualBlockPause : 0;

  const autoPauseRules = normalizeAutoPauseRules(speakerSettings?.autoBlockPauseRules);

  const groupedBlocks = [];
  const blockMap = new Map();

  for (let index = 0; index < (script || []).length; index++) {
    const item = script[index] || {};
    const rawText = String(item?.text || "").trim();
    if (!rawText) continue;

    const blockId = Number(item?.blockId || index + 1);

    if (!blockMap.has(blockId)) {
      const block = {
        blockId,
        lines: [],
        pauseAfterSeconds: 0
      };
      blockMap.set(blockId, block);
      groupedBlocks.push(block);
    }

    const block = blockMap.get(blockId);
    const { markers, cleanText } = extractLeadingMarkers(rawText);

    if (autoEnabled && block.lines.length === 0) {
      block.pauseAfterSeconds = resolvePauseFromMarkers(markers, autoPauseRules);
    }

    if (cleanText) {
      block.lines.push({
        role: item?.role || "A",
        text: mapLaughTtsText(cleanText),
        lineId: index + 1
      });
    }
  }

  const units = [];

  groupedBlocks.forEach((block) => {
    let lastUnitIndexOfThisBlock = -1;
    const mergedLines = keepLinesSeparated(block.lines);

    mergedLines.forEach((line) => {
      const pieces = splitTextIntoPieces(line.text, maxChars);

      pieces.forEach((piece) => {
        units.push({
          role: line.role,
          text: piece,
          blockId: block.blockId,
          lineId: Number(line.lineId || 0),
          pauseAfterSeconds: getPunctuationPauseSeconds(piece, line.role, speakerSettings)
        });
        lastUnitIndexOfThisBlock = units.length - 1;
      });
    });

    if (lastUnitIndexOfThisBlock >= 0) {
      const blockPauseSeconds = autoEnabled ? block.pauseAfterSeconds : safeManualBlockPause;
      units[lastUnitIndexOfThisBlock].pauseAfterSeconds = Math.max(
        Number(units[lastUnitIndexOfThisBlock].pauseAfterSeconds || 0),
        Number(blockPauseSeconds || 0)
      );
    }
  });

  return units;
}

function buildKeySummary() {
  syncRuntimeFromKeys();

  const keys = getAllKeys();
  const stats = getStats() || {};

  const list = keys.map((item) => {
    const s = stats[item.label] || {
      success: 0,
      fail: 0,
      lastUsed: null
    };

    const rt = keyRuntime[item.label] || {
      lastStatus: "unknown",
      lastError: "",
      lastProvider: "",
      totalChars: 0,
      updatedAt: null,
      quotaExceededCount: 0
    };

    const uiStatus = getUiStatus(item, rt);

    return {
      keyId: item.label,
      maskedKey: item.label,
      rawKey: item.key,
      tier: getKeyTier(item.label),
      isActive: uiStatus === "active",
      lastStatus: uiStatus,
      lastProvider: String(rt.lastProvider || ""),
      totalSuccess: Number(s.success || 0),
      totalFail: Number(s.fail || 0),
      totalChars: Number(rt.totalChars || 0),
      lastUsedAt: s.lastUsed ? new Date(s.lastUsed).toISOString() : null,
      lastError: String(rt.lastError || ""),
      updatedAt: rt.updatedAt || null,
      quotaExceededCount: Number(rt.quotaExceededCount || 0),
      disabled: !!item.disabled,
      disabledReason: String(item.disabledReason || ""),
      disabledUntil: item.disabledUntil || null,
      manuallyDisabled: !!item.manuallyDisabled
    };
  });

  return {
    totalKeys: list.length,
    activeKeys: list.filter((item) => item.lastStatus === "active").length,
    limitedKeys: list.filter((item) => item.lastStatus === "limited").length,
    invalidKeys: list.filter((item) => item.lastStatus === "invalid").length,
    errorKeys: list.filter((item) => item.lastStatus === "error").length,
    totalChars: list.reduce((sum, item) => sum + item.totalChars, 0),
    totalSuccess: list.reduce((sum, item) => sum + item.totalSuccess, 0),
    totalFail: list.reduce((sum, item) => sum + item.totalFail, 0),
    keys: list
  };
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_AUDIO_DIR, { recursive: true });
}

function createDefaultCacheIndex() {
  return {
    version: 1,
    items: {},
    stats: {
      hits: 0,
      misses: 0,
      saves: 0,
      lastHitAt: null,
      lastMissAt: null,
      lastSaveAt: null
    }
  };
}

let ttsCacheIndex = createDefaultCacheIndex();

function loadCacheIndex() {
  ensureCacheDir();

  if (!fs.existsSync(CACHE_INDEX_FILE)) {
    ttsCacheIndex = createDefaultCacheIndex();
    fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify(ttsCacheIndex, null, 2), "utf8");
    return ttsCacheIndex;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_INDEX_FILE, "utf8") || "{}");
    ttsCacheIndex = {
      ...createDefaultCacheIndex(),
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      items: parsed && typeof parsed.items === "object" ? parsed.items : {},
      stats: {
        ...createDefaultCacheIndex().stats,
        ...(parsed && parsed.stats && typeof parsed.stats === "object" ? parsed.stats : {})
      }
    };
  } catch {
    ttsCacheIndex = createDefaultCacheIndex();
  }

  return ttsCacheIndex;
}

function saveCacheIndex() {
  ensureCacheDir();
  fs.writeFileSync(CACHE_INDEX_FILE, JSON.stringify(ttsCacheIndex, null, 2), "utf8");
}

function getActiveKeyCountByTier(tier = "any") {
  return getAllKeys().filter((item) => {
    if (item.disabled) return false;
    const keyTier = getKeyTier(item.label);
    if (keyTier === "free" && !isProviderEnabled("gemini")) return false;
    if (keyTier === "paid" && !isProviderEnabled("cloud")) return false;
    if (tier === "any") return true;
    return keyTier === tier;
  }).length;
}

function getProviderFamilyForChunk(chunkScript = [], providerMode = "auto") {
  const laughOnlyChunk =
    Array.isArray(chunkScript) &&
    chunkScript.length > 0 &&
    chunkScript.every((item) => isLaughCueText(item?.text));

  const mode = String(providerMode || "auto").trim().toLowerCase();
  const vertexEnabled = isProviderEnabled("vertex");
  const geminiEnabled = isProviderEnabled("gemini");
  const cloudEnabled = isProviderEnabled("cloud");

  if (laughOnlyChunk && geminiEnabled) return "gemini";
  if (mode === "gemini") return geminiEnabled ? "gemini" : "disabled";
  if (mode === "tts" || mode === "paid") {
    if (vertexEnabled) return "vertex";
    if (cloudEnabled) return "cloud";
    return "disabled";
  }
  if (vertexEnabled) return "vertex";
  if (geminiEnabled) return "gemini";
  if (cloudEnabled) return "cloud";
  return "disabled";
}

function getVoiceNameFromSpeechConfig(requestSpeechConfig = {}, role = "A") {
  if (requestSpeechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName) {
    return String(requestSpeechConfig.voiceConfig.prebuiltVoiceConfig.voiceName || "").trim();
  }

  const multiList = requestSpeechConfig?.multiSpeakerVoiceConfig?.speakerVoiceConfigs || [];
  const speakerName = role === "R" ? "Host B" : "Host A";
  const voiceName = multiList.find((item) => item?.speaker === speakerName)?.voiceConfig?.prebuiltVoiceConfig?.voiceName;
  return String(voiceName || "").trim();
}

function normalizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.trim().replace(/\s+/g, ' ');
}

function buildTtsCacheDescriptor({ chunkScript = [], requestSpeechConfig = {}, selection = null, roleForFallback = "A", providerFamily = "gemini" }) {
  const normalizedScript = (Array.isArray(chunkScript) ? chunkScript : [])
    .map((item) => ({
      role: String(item?.role || roleForFallback || "A"),
      text: normalizeText(item?.text),
      blockId: Number(item?.blockId || 0)
    }))
    .filter((item) => item.text);

  const language = String(selection?.language || "en").trim();
  const role = roleForFallback === "R" ? "R" : "A";
  const voiceName = getVoiceNameFromSpeechConfig(requestSpeechConfig, role);
  const preset = {
    speed: Number(selection?.singleSpeakerPreset?.speed || 1),
    pitch: Number(selection?.singleSpeakerPreset?.pitch || 1),
    pause: Number(selection?.singleSpeakerPreset?.pause || 0)
  };

  const base = {
    providerFamily,
    role,
    language,
    voiceLabel: String(selection?.label || voiceName || "Unknown Voice").trim(),
    voiceName,
    preset,
    script: normalizedScript
  };

  const cacheKey = crypto.createHash("sha1").update(JSON.stringify(base)).digest("hex");
  return { cacheKey, base };
}

function getCacheFilePath(cacheKey) {
  return path.join(CACHE_AUDIO_DIR, `${cacheKey}.pcm`);
}

function registerCacheMiss() {
  loadCacheIndex();
  ttsCacheIndex.stats.misses = Number(ttsCacheIndex.stats.misses || 0) + 1;
  ttsCacheIndex.stats.lastMissAt = nowIso();
  saveCacheIndex();
}

function readTtsCache(params) {
  loadCacheIndex();

  const { cacheKey } = buildTtsCacheDescriptor(params);
  console.log(`[Cache TTS] Đọc Cache - Key: ${cacheKey}`); // Thêm log
  const item = ttsCacheIndex.items?.[cacheKey];

  if (!item) {
    registerCacheMiss();
    console.log(`[Cache TTS] Cache Miss - Key: ${cacheKey}`); // Thêm log
    return null;
  }

  const filePath = String(item.filePath || getCacheFilePath(cacheKey));
  if (!fs.existsSync(filePath)) {
    delete ttsCacheIndex.items[cacheKey];
    registerCacheMiss();
    saveCacheIndex();
    return null;
  }

  const pcmBuffer = fs.readFileSync(filePath);
  item.filePath = filePath;
  item.lastUsedAt = nowIso();
  item.hitCount = Number(item.hitCount || 0) + 1;
  item.sizeBytes = pcmBuffer.length;
  console.log(`[Cache TTS] Cache Hit - Key: ${cacheKey}`); // Thêm log Cache Hit

  ttsCacheIndex.stats.hits = Number(ttsCacheIndex.stats.hits || 0) + 1;
  ttsCacheIndex.stats.lastHitAt = nowIso();
  saveCacheIndex();

  return {
    cacheKey,
    pcmBuffer,
    item
  };
}

function writeTtsCache(params, pcmBuffer) {
  if (!pcmBuffer || !Buffer.isBuffer(pcmBuffer) || !pcmBuffer.length) return null;

  loadCacheIndex();
  ensureCacheDir();

  const { cacheKey, base } = buildTtsCacheDescriptor(params);
  console.log(`[Cache TTS] Ghi Cache - Key: ${cacheKey}`); // Thêm log
  const filePath = getCacheFilePath(cacheKey);
  fs.writeFileSync(filePath, pcmBuffer);

  ttsCacheIndex.items[cacheKey] = {
    cacheKey,
    filePath,
    providerFamily: base.providerFamily,
    role: base.role,
    language: base.language,
    voiceLabel: base.voiceLabel,
    voiceName: base.voiceName,
    textPreview: base.script.map((item) => item.text).join(" ").slice(0, 180),
    createdAt: nowIso(),
    lastUsedAt: nowIso(),
    hitCount: 0,
    sizeBytes: pcmBuffer.length
  };

  ttsCacheIndex.stats.saves = Number(ttsCacheIndex.stats.saves || 0) + 1;
  ttsCacheIndex.stats.lastSaveAt = nowIso();
  saveCacheIndex();

  return ttsCacheIndex.items[cacheKey];
}

function clearTtsCache() {
  ensureCacheDir();

  if (fs.existsSync(CACHE_AUDIO_DIR)) {
    for (const name of fs.readdirSync(CACHE_AUDIO_DIR)) {
      const filePath = path.join(CACHE_AUDIO_DIR, name);
      try {
        fs.rmSync(filePath, { force: true, recursive: true });
      } catch {}
    }
  }

  ttsCacheIndex = createDefaultCacheIndex();
  saveCacheIndex();
  return getCacheStats();
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size >= 10 || idx === 0 ? size.toFixed(0) : size.toFixed(2)} ${units[idx]}`;
}

function getCacheStats() {
  loadCacheIndex();

  const items = Object.values(ttsCacheIndex.items || {}).filter(Boolean);
  const totalBytes = items.reduce((sum, item) => sum + Number(item?.sizeBytes || 0), 0);

  return {
    enabled: true,
    cacheDir: CACHE_DIR,
    audioDir: CACHE_AUDIO_DIR,
    totalItems: items.length,
    totalBytes,
    totalSizeLabel: formatBytes(totalBytes),
    totalHits: Number(ttsCacheIndex.stats.hits || 0),
    totalMisses: Number(ttsCacheIndex.stats.misses || 0),
    totalSaves: Number(ttsCacheIndex.stats.saves || 0),
    lastHitAt: ttsCacheIndex.stats.lastHitAt || null,
    lastMissAt: ttsCacheIndex.stats.lastMissAt || null,
    lastSaveAt: ttsCacheIndex.stats.lastSaveAt || null
  };
}

loadCacheIndex();

function normalizeVoiceType(value) {
  const v = String(value || "").toLowerCase().trim();

  if (v.includes("vietnamese") && v.includes("female")) return "vietnameseFemale";
  if (v.includes("vietnamese") && v.includes("male")) return "vietnameseMale";
  if (v.includes("english") && v.includes("female")) return "englishFemale";
  if (v.includes("english") && v.includes("male")) return "englishMale";

  if (v === "vi_female" || v === "vi-female") return "vietnameseFemale";
  if (v === "vi_male" || v === "vi-male") return "vietnameseMale";
  if (v === "en_female" || v === "en-female") return "englishFemale";
  if (v === "en_male" || v === "en-male") return "englishMale";

  return v;
}

function getCloudLanguageCode(language = "en") {
  return language === "vi" ? "vi-VN" : "en-US";
}

function getPreferredTierOrder({ laughOnlyChunk = false, providerMode = "auto" } = {}) {
  const mode = String(providerMode || "auto").trim().toLowerCase();
  const geminiEnabled = isProviderEnabled("gemini");
  const cloudEnabled = isProviderEnabled("cloud");

  if (laughOnlyChunk) {
    return [geminiEnabled ? "free" : null, cloudEnabled ? "paid" : null].filter(Boolean);
  }
  if (mode === "gemini") return geminiEnabled ? ["free"] : [];
  if (mode === "tts" || mode === "paid") return cloudEnabled ? ["paid"] : [];

  const order = [];
  if (cloudEnabled) order.push("paid");
  if (geminiEnabled) order.push("free");
  return order;
}

function getProviderLabelByTier(tier, laughOnlyChunk = false) {
  if (tier === "paid") return "cloud_paid";
  return laughOnlyChunk ? "gemini_laugh" : "gemini_free";
}


function getCloudVoiceForRole({ language = "en", role = "A", geminiVoiceName = "", gender = "" } = {}) {
  const safeLang = language === "vi" ? "vi" : "en";
  const safeRole = role === "R" ? "R" : "A";
  const voice = String(geminiVoiceName || "").toLowerCase();
  const safeGender = String(gender || "").toLowerCase();

  if (safeLang === "vi") {
    if (safeGender === "female" || safeRole === "R" || voice === "kore" || voice === "zephyr") {
      return "vi-VN-Neural2-A";
    }
    return "vi-VN-Neural2-D";
  }

  if (safeGender === "female" || safeRole === "R" || voice === "kore" || voice === "zephyr") {
    return "en-US-Neural2-F";
  }

  if (voice === "charon") {
    return "en-US-Neural2-D";
  }

  if (voice === "fenrir") {
    return "en-US-Neural2-I";
  }

  return "en-US-Neural2-J";
}

function resolveVoiceSelection(payload = {}) {
  const legacyVoiceMap = payload?.voiceMap;
  const voiceModeRaw = String(payload?.voiceMode || "").trim().toLowerCase();
  const voiceTypeRaw = normalizeVoiceType(payload?.voiceType);
  const voiceNameRaw = String(payload?.voiceName || "").trim();

  console.log("VOICE INPUT:", {
    voiceModeRaw,
    voiceTypeRaw,
    voiceNameRaw
  });

  if (
    legacyVoiceMap &&
    typeof legacyVoiceMap === "object" &&
    (legacyVoiceMap.A || legacyVoiceMap.R)
  ) {
    const geminiA = legacyVoiceMap.A || "Puck";
    const geminiR = legacyVoiceMap.R || "Kore";

    return {
      mode: "multi",
      label: "Legacy Podcast",
      language: "en",
      promptBuilder: buildPromptFromScript,
      requestSpeechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: "Host A",
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: geminiA
                }
              }
            },
            {
              speaker: "Host B",
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: geminiR
                }
              }
            }
          ]
        }
      },
      fallbackCloudVoices: {
        A: getCloudVoiceForRole({ language: "en", role: "A", geminiVoiceName: geminiA }),
        R: getCloudVoiceForRole({ language: "en", role: "R", geminiVoiceName: geminiR })
      }
    };
  }

  if (voiceModeRaw === "podcast" || voiceTypeRaw === "podcast") {
    const preset = findPodcastVoiceById(voiceNameRaw) || VOICE_CATALOG.podcast[0];

    return {
      mode: "multi",
      label: preset.label,
      language: "en",
      promptBuilder: buildPromptFromScript,
      requestSpeechConfig: {
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: "Host A",
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: preset.speakers.A
                }
              }
            },
            {
              speaker: "Host B",
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: preset.speakers.R
                }
              }
            }
          ]
        }
      },
      fallbackCloudVoices: {
        A: getCloudVoiceForRole({
          language: "en",
          role: "A",
          geminiVoiceName: preset.speakers.A
        }),
        R: getCloudVoiceForRole({
          language: "en",
          role: "R",
          geminiVoiceName: preset.speakers.R
        })
      }
    };
  }

  let singleVoice = null;

  if (voiceNameRaw) {
    singleVoice = findSingleVoiceByIdOrApiId(voiceNameRaw);
  }

  if (!singleVoice) {
    if (voiceTypeRaw === "vietnameseMale") {
      singleVoice = VOICE_CATALOG.vietnameseMale[0];
    } else if (voiceTypeRaw === "vietnameseFemale") {
      singleVoice = VOICE_CATALOG.vietnameseFemale[0];
    } else if (voiceTypeRaw === "englishMale") {
      singleVoice = VOICE_CATALOG.englishMale[0];
    } else if (voiceTypeRaw === "englishFemale") {
      singleVoice = VOICE_CATALOG.englishFemale[0];
    }
  }

  if (!singleVoice) {
    singleVoice = VOICE_CATALOG.englishMale[0];
  }

  console.log("VOICE RESOLVED:", {
    selectedVoiceId: singleVoice.id,
    apiId: singleVoice.apiId,
    gender: singleVoice.gender,
    language: singleVoice.language
  });

  const singleSpeakerPreset =
    payload?.speakerSettings?.A ||
    payload?.speakerSettings?.R ||
    {};

  return {
    mode: "single",
    label: singleVoice.label,
    language: singleVoice.language || "en",
    promptBuilder: (script) =>
      buildSingleSpeakerPrompt(
        script,
        singleVoice.label,
        singleVoice.language,
        singleSpeakerPreset
      ),
    requestSpeechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: singleVoice.apiId || "Puck"
        }
      }
    },
    fallbackCloudVoices: {
      A: getCloudVoiceForRole({
        language: singleVoice.language || "en",
        role: "A",
        geminiVoiceName: singleVoice.apiId || "Puck",
        gender: singleVoice.gender || "male"
      }),
      R: getCloudVoiceForRole({
        language: singleVoice.language || "en",
        role: "R",
        geminiVoiceName: singleVoice.apiId || "Kore",
        gender: singleVoice.gender || "female"
      })
    },
    singleSpeakerPreset
  };
}

function getGeminiVoiceNameFromSpeechConfig(requestSpeechConfig, role = "A") {
  const speakerConfigs =
    requestSpeechConfig?.multiSpeakerVoiceConfig?.speakerVoiceConfigs || [];

  if (speakerConfigs.length) {
    const speakerName = role === "R" ? "Host B" : "Host A";
    return (
      speakerConfigs.find((item) => item?.speaker === speakerName)?.voiceConfig?.prebuiltVoiceConfig
        ?.voiceName || ""
    );
  }

  return requestSpeechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName || "";
}

function extractWavDataChunk(wavBuffer) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) {
    return wavBuffer;
  }

  if (wavBuffer.toString("ascii", 0, 4) !== "RIFF" || wavBuffer.toString("ascii", 8, 12) !== "WAVE") {
    return wavBuffer;
  }

  let offset = 12;

  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;

    if (chunkId === "data") {
      return wavBuffer.slice(chunkDataStart, Math.min(chunkDataEnd, wavBuffer.length));
    }

    offset = chunkDataEnd + (chunkSize % 2);
  }

  return wavBuffer;
}


function getExistingLaughAssetBaseDir() {
  for (const dir of dedupeExistingDirs(LAUGH_ASSET_SEARCH_DIRS)) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
        return dir;
      }
    } catch {}
  }
  return null;
}

function getLaughTypeFromText(text) {
  const clean = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, "");

  if (clean === "hahaha") return "long";
  if (clean === "hehe" || clean === "hihi") return "giggle";
  return "short";
}


function ensureFlatLaughRoleDir(role = "A") {
  const safeRole = role === "R" || role === "BOTH" ? role : "A";
  const roleDir = path.join(LAUGH_ASSET_PRIMARY_SAVE_DIR, safeRole);
  fs.mkdirSync(roleDir, { recursive: true });
  return roleDir;
}

function buildSavedLaughFileName(text = "") {
  const type = getLaughTypeFromText(text);
  const stem = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "laugh";
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${type}_${stem}_${suffix}.wav`;
}

function autoSaveGeneratedLaughAsset({ role = "A", text = "", pcmBuffer = null, providerFamily = "" }) {
  try {
    if (providerFamily !== "gemini") return null;
    if (!isLaughCueText(text)) return null;
    if (!Buffer.isBuffer(pcmBuffer) || !pcmBuffer.length) return null;

    const roleDir = ensureFlatLaughRoleDir(role);
    const fileName = buildSavedLaughFileName(text);
    const destPath = path.join(roleDir, fileName);
    const wavBuffer = createWaveBufferFromPcm(pcmBuffer, SAMPLE_RATE, 1, 16);
    fs.writeFileSync(destPath, wavBuffer);

    addLog({
      type: "laugh_asset_saved",
      keyLabel: `AUTO_SAVE_${role}`,
      status: "saved",
      chars: String(text || "").length,
      message: `Da tu luu laugh asset -> ${role}/${fileName}`
    });

    return destPath;
  } catch (error) {
    addLog({
      type: "laugh_asset_save_fail",
      keyLabel: "AUTO_SAVE",
      status: "error",
      chars: String(text || "").length,
      message: `Tu luu laugh asset that bai: ${safeErrorMessage(error)}`
    });
    return null;
  }
}

function listLaughAssetFiles(baseDir, role, type) {
  const roleDir = path.join(baseDir, role);
  if (!fs.existsSync(roleDir)) return [];

  let names = [];
  try {
    names = fs.readdirSync(roleDir);
  } catch {
    names = [];
  }

  const wavs = names.filter((name) => /\.wav$/i.test(name));
  const exact = wavs.filter((name) => name.toLowerCase().startsWith(`${String(type || "").toLowerCase()}_`));
  if (exact.length) return exact.map((name) => path.join(roleDir, name));

  const misc = wavs.filter((name) => name.toLowerCase().startsWith("misc_"));
  if (misc.length) return misc.map((name) => path.join(roleDir, name));

  return wavs.map((name) => path.join(roleDir, name));
}

function pickRandomItem(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)] || null;
}

function readLaughAssetPcm(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath);
  if (!Buffer.isBuffer(raw) || !raw.length) return null;
  return extractWavDataChunk(raw);
}

function loadLaughAssetPcmForUnit(unit) {
  if (!isLaughCueText(unit?.text)) return null;

  const baseDir = getExistingLaughAssetBaseDir();
  if (!baseDir) return null;

  const type = getLaughTypeFromText(unit?.text);
  const role = unit?.role === "R" || unit?.role === "BOTH" ? unit.role : "A";

  if (role === "BOTH") {
    const bothFile = pickRandomItem(listLaughAssetFiles(baseDir, "BOTH", type));
    if (bothFile) {
      const pcmBuffer = readLaughAssetPcm(bothFile);
      if (pcmBuffer?.length) {
        return { pcmBuffer, keyLabel: `ASSET_BOTH_${type}` };
      }
    }

    const aPcm = readLaughAssetPcm(pickRandomItem(listLaughAssetFiles(baseDir, "A", type)));
    const rPcm = readLaughAssetPcm(pickRandomItem(listLaughAssetFiles(baseDir, "R", type)));
    if (aPcm?.length && rPcm?.length) {
      return {
        pcmBuffer: mixPcmBuffers(
          [prependSilencePcm(aPcm, 0.02), prependSilencePcm(rPcm, 0.08)],
          [0.72, 0.68]
        ),
        keyLabel: `ASSET_BOTH_MIX_${type}`
      };
    }

    return null;
  }

  const pcmBuffer = readLaughAssetPcm(
    pickRandomItem(listLaughAssetFiles(baseDir, role, type))
  );
  if (!pcmBuffer?.length) return null;

  return {
    pcmBuffer,
    keyLabel: `ASSET_${role}_${type}`
  };
}

async function callGeminiTtsOnce({
  key,
  label,
  prompt,
  requestSpeechConfig,
  totalChars,
  chunkIndex,
  totalChunks
}) {
  addLog({
    type: "request_start",
    keyLabel: label,
    status: "processing",
    chars: totalChars,
    message: `Gemini start chunk ${chunkIndex + 1}/${totalChunks}`
  });

  const response = await fetch(GEMINI_TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: requestSpeechConfig
      }
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.status ||
      data?.error ||
      `HTTP ${response.status}`;

    throw new Error(String(message || "Gemini TTS request failed"));
  }

  const base64Audio =
    data?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData?.data)?.inlineData
      ?.data ||
    data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Audio) {
    throw new Error("Không nhận được audio từ Gemini TTS");
  }

  const pcmBuffer = Buffer.from(base64Audio, "base64");

  addLog({
    type: "request_success",
    keyLabel: label,
    status: "active",
    chars: totalChars,
    message: `Gemini OK chunk ${chunkIndex + 1}/${totalChunks}`
  });

  return { pcmBuffer, provider: "gemini" };
}

async function callCloudTtsOnce({
  key,
  label,
  chunkScript,
  cloudVoiceName,
  language,
  preset,
  totalChars,
  chunkIndex,
  totalChunks
}) {
  addLog({
    type: "request_start",
    keyLabel: label,
    status: "processing",
    chars: totalChars,
    message: `Cloud start chunk ${chunkIndex + 1}/${totalChunks}`
  });

  const ssml = buildSingleSpeakerPrompt(
    chunkScript,
    cloudVoiceName || "Cloud Voice",
    language === "vi" ? "vi" : "en",
    preset || {}
  );

  const response = await fetch(`${CLOUD_TTS_ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      input: { ssml },
      voice: {
        languageCode: getCloudLanguageCode(language),
        name: cloudVoiceName || getCloudVoiceForRole({ language, role: "A" })
      },
      audioConfig: {
        audioEncoding: "LINEAR16",
        sampleRateHertz: SAMPLE_RATE
      }
    })
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error?.status ||
      data?.error ||
      `HTTP ${response.status}`;

    throw new Error(String(message || "Cloud TTS request failed"));
  }

  if (!data?.audioContent) {
    throw new Error("Không nhận được audio từ Cloud TTS");
  }

  const rawAudio = Buffer.from(data.audioContent, "base64");
  const pcmBuffer = extractWavDataChunk(rawAudio);

  addLog({
    type: "request_success",
    keyLabel: label,
    status: "active",
    chars: totalChars,
    message: `Cloud OK chunk ${chunkIndex + 1}/${totalChunks}`
  });

  return { pcmBuffer, provider: "cloud" };
}

async function tryGeminiWithInternalRetry(args) {
  try {
    return await callGeminiTtsOnce(args);
  } catch (error) {
    const message = safeErrorMessage(error);
    const status = inferStatusFromError(message);

    if (status !== "error") {
      throw error;
    }

    for (const delayMs of INTERNAL_RETRY_DELAYS_MS) {
      addLog({
        type: "retry_wait",
        keyLabel: args.label,
        status: "error",
        chars: args.totalChars,
        message: `Gemini internal retry sau ${Math.round(delayMs / 1000)}s`
      });

      await sleep(delayMs);

      try {
        return await callGeminiTtsOnce(args);
      } catch (retryError) {
        const retryMessage = safeErrorMessage(retryError);
        const retryStatus = inferStatusFromError(retryMessage);
        if (retryStatus !== "error") {
          throw retryError;
        }
      }
    }

    throw error;
  }
}

async function generateChunkWithRetry({
  chunkScript,
  requestSpeechConfig,
  promptBuilder,
  chunkIndex,
  totalChunks,
  language = "en",
  selection = null,
  roleForFallback = "A",
  providerMode = "auto",
  laughAssetMode = "auto"
}) {
  const prompt = promptBuilder(chunkScript);
  const totalChars = getTotalChars(chunkScript);
  const totalKeyCount = Math.max(1, getAllKeys().length);
  const triedLabels = new Set();
  const laughOnlyChunk =
    Array.isArray(chunkScript) &&
    chunkScript.length > 0 &&
    chunkScript.every((item) => isLaughCueText(item?.text));
  const providerFamily = getProviderFamilyForChunk(chunkScript, providerMode);

  // Cache phải được kiểm tra trước mọi provider, kể cả Vertex.
  // Nếu không, reaction giống nhau vẫn bị gen lại và file laugh không được tái sử dụng.
  const cacheHit = readTtsCache({
    chunkScript,
    requestSpeechConfig,
    selection,
    roleForFallback,
    providerFamily
  });

  if (cacheHit) {
    addLog({
      type: "chunk_cache_hit",
      keyLabel: `CACHE [${providerFamily}]`,
      status: "cache_hit",
      chars: totalChars,
      message: `Chunk ${chunkIndex + 1}/${totalChunks} dùng cache (${providerFamily})`
    });

    return {
      pcmBuffer: cacheHit.pcmBuffer,
      keyLabel: `CACHE [${providerFamily}]`
    };
  }

  const providerSettings = getProviderSettings();
  const vertexProviderEnabled = providerSettings.vertexEnabled === true;
  const geminiProviderEnabled = providerSettings.geminiEnabled === true;
  const cloudApiKeyEnabled = providerSettings.cloudApiKeyEnabled === true;

  if (!vertexProviderEnabled && !geminiProviderEnabled && !cloudApiKeyEnabled) {
    throw new Error("Bạn đang tắt cả Vertex và Gemini key. Hãy bật ít nhất một loại key trong Key Manager.");
  }

  // Ưu tiên Vertex khi không ép Gemini, nhưng chỉ dùng nếu Vertex đang được bật.
  // Nếu Vertex hết quota/lỗi, app tự rơi xuống Gemini key pool bên dưới.
  if (providerMode !== "gemini" && vertexProviderEnabled) {
    const role = chunkScript?.[0]?.role === "R" ? "R" : "A";
    const vVoice = getGeminiVoiceNameFromSpeechConfig(requestSpeechConfig, role);
    const contentToGen = chunkScript?.[0]?.text || "";

    console.log(`[Hệ thống] Đang thử dùng VERTEX AI cho Chunk ${chunkIndex + 1}...`);
    const vertexBuffer = await callVertexAI(contentToGen, vVoice);

    if (vertexBuffer) {
      autoSaveGeneratedLaughAsset({
        role: chunkScript?.[0]?.role || roleForFallback || "A",
        text: chunkScript?.[0]?.text || "",
        pcmBuffer: vertexBuffer,
        providerFamily: laughOnlyChunk ? "gemini" : providerFamily
      });

      writeTtsCache({
        chunkScript,
        requestSpeechConfig,
        selection,
        roleForFallback,
        providerFamily
      }, vertexBuffer);

      console.log(`[Hệ thống] Chunk ${chunkIndex + 1} dùng VERTEX AI OK.`);
      return { pcmBuffer: vertexBuffer, keyLabel: "VERTEX AI" };
    }
  }

  if (!geminiProviderEnabled && !cloudApiKeyEnabled) {
    throw new Error("Vertex không tạo được audio và Gemini key pool đang tắt. Hãy bật Gemini hoặc kiểm tra Vertex quota.");
  }

  while (triedLabels.size < totalKeyCount) {
    const tierOrder = getPreferredTierOrder({ laughOnlyChunk, providerMode });
    let keyObj = null;

    for (const tier of tierOrder) {
      keyObj = getNextKey(tier, Array.from(triedLabels));
      if (keyObj) break;
    }

    if (!keyObj) {
      keyObj = getNextKey("any", Array.from(triedLabels));
    }

    if (!keyObj) {
      const mode = String(providerMode || "auto").trim().toLowerCase();
      if (mode === "gemini") {
        throw new Error("Không còn Gemini key khả dụng. Hãy chờ cooldown hoặc thêm key mới.");
      }
      if (mode === "tts" || mode === "paid") {
        throw new Error("Không còn Paid key khả dụng. Hãy chờ cooldown hoặc thêm key mới.");
      }
      throw new Error("All keys are temporarily disabled. Wait for cooldown or reset cooldown in Key Manager.");
    }

    const { key, label } = keyObj;
    const tier = getKeyTier(label);
    const provider = getProviderLabelByTier(tier, laughOnlyChunk);
    triedLabels.add(label);

    addLog({
      type: "chunk_start",
      keyLabel: label,
      status: "processing",
      chars: totalChars,
      message: `Chunk ${chunkIndex + 1}/${totalChunks} -> dùng ${label} [${provider}]`
    });

    try {
      let result = null;

      if (tier === "paid" && !laughOnlyChunk && providerMode !== "gemini") {
        const role = chunkScript?.[0]?.role === "R" ? "R" : "A";
        const geminiVoiceName = getGeminiVoiceNameFromSpeechConfig(requestSpeechConfig, role);
        const cloudVoiceName = getCloudVoiceForRole({
          language,
          role,
          geminiVoiceName
        });

        result = await callCloudTtsOnce({
          key,
          label,
          chunkScript,
          cloudVoiceName,
          language,
          preset: selection?.singleSpeakerPreset || {},
          totalChars,
          chunkIndex,
          totalChunks
        });
      } else if (isGeminiKeyLabel(label)) {
        result = await tryGeminiWithInternalRetry({
          key,
          label,
          prompt,
          requestSpeechConfig,
          totalChars,
          chunkIndex,
          totalChunks
        });
      }

      logSuccess(label);
      enableKey(label);
      updateKeyRuntime(label, {
        lastStatus: "active",
        lastError: "",
        lastProvider: provider,
        quotaExceededCount: 0,
        totalChars: (keyRuntime[label]?.totalChars || 0) + totalChars
      });

      moveKeyToEnd(label);

      if (!result || !result.pcmBuffer) {
        throw new Error(`No audio buffer returned for ${label}`);
      }

      autoSaveGeneratedLaughAsset({
        role: chunkScript?.[0]?.role || roleForFallback || "A",
        text: chunkScript?.[0]?.text || "",
        pcmBuffer: result.pcmBuffer,
        providerFamily
      });

      writeTtsCache({
        chunkScript,
        requestSpeechConfig,
        selection,
        roleForFallback,
        providerFamily
      }, result.pcmBuffer);

      addLog({
        type: "chunk_success",
        keyLabel: label,
        status: "success",
        chars: totalChars,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} OK (${label}) [${provider}]`
      });

      return {
        pcmBuffer: result.pcmBuffer,
        keyLabel: `${label} [${provider}]`
      };
    } catch (error) {
      console.error("GENERATE_CHUNK_FULL_ERROR:", error);
      console.error("GENERATE_CHUNK_STACK:", error?.stack || String(error));
      const message = safeErrorMessage(error);
      const status = inferStatusFromError(message);

      logFail(label);

      if (status === "invalid") {
        disableKey(label, {
          reason: "invalid",
          cooldownMs: 30 * 60 * 1000
        });
      } else if (status === "limited") {
        const retrySeconds = extractRetrySeconds(message);
        disableKey(label, {
          reason: "limited",
          cooldownMs: (retrySeconds ? retrySeconds + 5 : 120) * 1000
        });
      }

      moveKeyToEnd(label);

      updateKeyRuntime(label, {
        lastStatus: status,
        lastError: String(message),
        lastProvider: provider
      });

      addLog({
        type: "chunk_fail",
        keyLabel: label,
        status,
        chars: totalChars,
        message: `Chunk ${chunkIndex + 1}/${totalChunks} FAIL (${label}) -> ${message}`
      });
    }
  }

  throw new Error(`Chunk ${chunkIndex + 1}/${totalChunks} failed on all available keys`);
}

function buildSingleSpeakerSelection(voiceName, language = "en", role = "A") {
  return {
    mode: "single",
    label: voiceName || "Single Voice",
    language,
    promptBuilder: (script) =>
      buildSingleSpeakerPrompt(script, voiceName || "Single Voice", language, {}),
    requestSpeechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: voiceName || "Puck"
        }
      }
    },
    fallbackCloudVoices: {
      [role]: getCloudVoiceForRole({
        language,
        role,
        geminiVoiceName: voiceName || (role === "R" ? "Kore" : "Puck")
      })
    },
    speakerSettings: {
      A: {},
      R: {}
    },
    singleSpeakerPreset: {}
  };
}

function createBothSelection(selection) {
  const speakerConfigs =
    selection?.requestSpeechConfig?.multiSpeakerVoiceConfig?.speakerVoiceConfigs || [];
  const hostA =
    speakerConfigs.find((item) => item?.speaker === "Host A")?.voiceConfig?.prebuiltVoiceConfig
      ?.voiceName || "Puck";
  const hostB =
    speakerConfigs.find((item) => item?.speaker === "Host B")?.voiceConfig?.prebuiltVoiceConfig
      ?.voiceName || "Kore";
  const language = selection?.language || "en";

  return {
    A: {
      ...buildSingleSpeakerSelection(hostA, language, "A"),
      fallbackCloudVoices: {
        A:
          selection?.fallbackCloudVoices?.A ||
          getCloudVoiceForRole({ language, role: "A", geminiVoiceName: hostA })
      },
      speakerSettings: {
        A: selection?.speakerSettings?.A || {}
      }
    },
    R: {
      ...buildSingleSpeakerSelection(hostB, language, "R"),
      fallbackCloudVoices: {
        R:
          selection?.fallbackCloudVoices?.R ||
          getCloudVoiceForRole({ language, role: "R", geminiVoiceName: hostB })
      },
      speakerSettings: {
        R: selection?.speakerSettings?.R || {}
      }
    }
  };
}

async function synthesizeUnitsToWav({
  units,
  requestSpeechConfig,
  promptBuilder,
  fileName = "output.wav",
  onProgress,
  bothSelection,
  selection,
  providerMode = "auto",
  laughAssetMode = "auto"
}) {
  if (!Array.isArray(units) || !units.length) {
    throw new Error("Không có units để synthesize");
  }

  const pcmParts = [];
  const dialogueTimeline = [];
  let lastKeyLabel = "";
  let cursorSeconds = 0;
  const bytesPerSecond = SAMPLE_RATE * 2;

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];

    let pcmBuffer = null;
    let keyLabel = "";

    const normalizedLaughAssetMode = String(laughAssetMode || "auto").trim().toLowerCase();
    const shouldTryLaughAsset = normalizedLaughAssetMode !== "off";
    const laughAsset = shouldTryLaughAsset ? loadLaughAssetPcmForUnit(unit) : null;

    if (laughAsset) {
      pcmBuffer = laughAsset.pcmBuffer;
      keyLabel = laughAsset.keyLabel;
    } else if (normalizedLaughAssetMode === "force" && isLaughCueText(unit?.text)) {
      throw new Error(`Không tìm thấy laugh asset phù hợp cho reaction: ${unit.text || "[laugh]"}`);
    } else if (unit.role === "BOTH" && bothSelection?.A && bothSelection?.R) {
      const [resultA, resultR] = await Promise.all([
        generateChunkWithRetry({
          chunkScript: [{ role: "A", text: unit.text, blockId: unit.blockId }],
          requestSpeechConfig: bothSelection.A.requestSpeechConfig,
          promptBuilder: bothSelection.A.promptBuilder,
          chunkIndex: i,
          totalChunks: units.length,
          selection: bothSelection.A,
          roleForFallback: "A",
          providerMode
        }),
        generateChunkWithRetry({
          chunkScript: [{ role: "R", text: unit.text, blockId: unit.blockId }],
          requestSpeechConfig: bothSelection.R.requestSpeechConfig,
          promptBuilder: bothSelection.R.promptBuilder,
          chunkIndex: i,
          totalChunks: units.length,
          selection: bothSelection.R,
          roleForFallback: "R",
          providerMode
        })
      ]);

      keyLabel = [resultA.keyLabel, resultR.keyLabel].filter(Boolean).join(" + ");
      const useNaturalStagger = isLikelySharedReaction(unit.text);
      const pcmA = useNaturalStagger
        ? prependSilencePcm(resultA.pcmBuffer, 0.02)
        : resultA.pcmBuffer;
      const pcmR = useNaturalStagger
        ? prependSilencePcm(resultR.pcmBuffer, 0.08)
        : resultR.pcmBuffer;
      pcmBuffer = mixPcmBuffers(
        [pcmA, pcmR],
        useNaturalStagger ? [0.7, 0.66] : [0.72, 0.72]
      );
} else {
  const normalizedRole = unit.role === "BOTH" ? "A" : unit.role;

  const roleSelection =
    normalizedRole === "R"
      ? (bothSelection?.R || selection)
      : (bothSelection?.A || selection);

  const result = await generateChunkWithRetry({
    chunkScript: [
      {
        role: normalizedRole,
        text: unit.text,
        blockId: unit.blockId
      }
    ],
    requestSpeechConfig: roleSelection?.requestSpeechConfig || requestSpeechConfig,
    promptBuilder: roleSelection?.promptBuilder || promptBuilder,
    chunkIndex: i,
    totalChunks: units.length,
    selection: roleSelection || selection,
    roleForFallback: normalizedRole,
    providerMode
  });

  keyLabel = result.keyLabel;
  pcmBuffer = result.pcmBuffer;
}

    lastKeyLabel = keyLabel;
    pcmParts.push(pcmBuffer);

    const audioDurationSeconds = Math.max(0, Buffer.isBuffer(pcmBuffer) ? pcmBuffer.length / bytesPerSecond : 0);
    const startSeconds = cursorSeconds;
    const endSeconds = startSeconds + audioDurationSeconds;
    dialogueTimeline.push({
      blockId: Number(unit.blockId || i + 1),
      role: unit.role || "A",
      text: String(unit.text || "").trim(),
      start: Number(startSeconds.toFixed(3)),
      end: Number(endSeconds.toFixed(3)),
      pauseAfterSeconds: Number(Math.max(0, Number(unit.pauseAfterSeconds || 0)).toFixed(3))
    });
    cursorSeconds = endSeconds;

    if (unit.pauseAfterSeconds > 0) {
      const silenceBuffer = createSilencePcm(unit.pauseAfterSeconds);
      console.log("[AUTO_PAUSE_AFTER]", {
        blockId: unit.blockId,
        seconds: unit.pauseAfterSeconds,
        bytes: silenceBuffer.length
      });
      pcmParts.push(silenceBuffer);
      cursorSeconds += Math.max(0, Number(unit.pauseAfterSeconds || 0));
    }

    onProgress?.({
      index: i,
      total: units.length,
      keyLabel
    });
  }

  const merged = appendPcmParts(pcmParts);

  return {
    wavBuffer: createWaveBufferFromPcm(merged, SAMPLE_RATE, 1, 16),
    keyLabel: lastKeyLabel,
    fileName,
    dialogueTimeline
  };
}

function createJob(fileName) {
  const jobId = createJobId();
  const job = {
    jobId,
    status: "queued",
    stage: "queued",
    progressPercent: 0,
    totalChunks: 0,
    completedChunks: 0,
    currentChunk: 0,
    elapsedMs: 0,
    etaMs: null,
    fileName: fileName || "output.wav",
    currentKeyLabel: "",
    error: "",
    createdAt: nowIso(),
    startedAtMs: null,
    audioBuffer: null,
    voiceLabel: "",
    dialogueTimeline: []
  };

  ttsJobs.set(jobId, job);
  cleanupExpiredJobs();
  return job;
}

function getPublicJob(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    stage: job.stage,
    progressPercent: job.progressPercent,
    totalChunks: job.totalChunks,
    completedChunks: job.completedChunks,
    currentChunk: job.currentChunk,
    elapsedMs: job.elapsedMs,
    etaMs: job.etaMs,
    fileName: job.fileName,
    currentKeyLabel: job.currentKeyLabel,
    error: job.error,
    createdAt: job.createdAt,
    voiceLabel: job.voiceLabel || "",
    dialogueTimeline: Array.isArray(job.dialogueTimeline) ? job.dialogueTimeline : []
  };
}

async function processTtsJob(jobId, payload) {
  const job = ttsJobs.get(jobId);
  if (!job) return;

  const script = payload?.script || [];
  const fileName = payload?.fileName || "output.wav";
  const speakerSettings = payload?.speakerSettings || {};
  const providerMode = String(payload?.providerMode || "auto").trim().toLowerCase();
  const selection = {
    ...resolveVoiceSelection(payload),
    speakerSettings
  };

  try {
    const units = normalizeScriptUnits(script, speakerSettings, CHUNK_CHAR_LIMIT);

    if (!units.length) {
      throw new Error("Script rỗng sau khi xử lý auto pause");
    }

    job.status = "processing";
    job.stage = "processing";
    job.totalChunks = units.length;
    job.completedChunks = 0;
    job.currentChunk = 0;
    job.progressPercent = 0;
    job.startedAtMs = Date.now();
    job.fileName = fileName;
    job.voiceLabel = selection.label;

    const bothSelection = selection.mode === "multi" ? createBothSelection(selection) : null;

    const result = await synthesizeUnitsToWav({
      units,
      requestSpeechConfig: selection.requestSpeechConfig,
      promptBuilder: selection.promptBuilder,
      fileName,
      bothSelection,
      selection,
      providerMode,
      laughAssetMode: payload?.laughAssetMode || "auto",
      onProgress: ({ index, total, keyLabel }) => {
        job.currentChunk = index + 1;
        job.currentKeyLabel = keyLabel;
        job.completedChunks = index + 1;
        job.elapsedMs = Date.now() - job.startedAtMs;

        const processingRatio = total ? job.completedChunks / total : 1;
        job.progressPercent = Math.min(92, Math.round(processingRatio * 92));

        if (job.completedChunks > 0) {
          const avg = job.elapsedMs / job.completedChunks;
          job.etaMs = Math.max(
            0,
            Math.round(avg * (job.totalChunks - job.completedChunks))
          );
        } else {
          job.etaMs = null;
        }
      }
    });

    job.stage = "saving";
    job.status = "saving";
    job.progressPercent = 96;
    job.etaMs = 1000;

    job.audioBuffer = result.wavBuffer;
    job.dialogueTimeline = Array.isArray(result.dialogueTimeline) ? result.dialogueTimeline : [];
    job.elapsedMs = Date.now() - job.startedAtMs;
    job.etaMs = 0;
    job.progressPercent = 100;
    job.stage = "done";
    job.status = "done";

    addLog({
      type: "job_done",
      keyLabel: job.currentKeyLabel || "-",
      status: "done",
      chars: getTotalChars(units),
      message: `Hoàn thành ${job.fileName} với ${job.totalChunks} chunk | voice=${selection.label}`
    });
  } catch (error) {
    const message = safeErrorMessage(error);

    job.error = message;
    job.elapsedMs = job.startedAtMs ? Date.now() - job.startedAtMs : 0;
    job.etaMs = 0;
    job.progressPercent = Math.max(job.progressPercent, 1);
    job.stage = "error";
    job.status = "error";

    addLog({
      type: "job_error",
      keyLabel: job.currentKeyLabel || "-",
      status: "error",
      chars: getTotalChars(script),
      message
    });
  }
}

app.get("/api/voices/catalog", (req, res) => {
  return res.json({
    ok: true,
    catalog: VOICE_CATALOG
  });
});

app.post("/api/tts/start", async (req, res) => {
  const { script, fileName } = req.body || {};

  if (!Array.isArray(script) || !script.length) {
    return res.status(400).json({
      error: "Thiếu script hợp lệ"
    });
  }

  const job = createJob(fileName || "output.wav");
  processTtsJob(job.jobId, req.body || {});

  return res.json({
    ok: true,
    jobId: job.jobId
  });
});

app.get("/api/tts/jobs/:jobId", (req, res) => {
  const job = ttsJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      error: "Không tìm thấy job"
    });
  }

  return res.json(getPublicJob(job));
});

app.get("/api/tts/jobs/:jobId/audio", (req, res) => {
  const job = ttsJobs.get(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      error: "Không tìm thấy job"
    });
  }

  if (job.status !== "done" || !job.audioBuffer) {
    return res.status(400).json({
      error: "Job chưa hoàn tất hoặc chưa có audio"
    });
  }

  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Disposition", `attachment; filename="${job.fileName}"`);
  return res.send(job.audioBuffer);
});

app.post("/api/generate", async (req, res) => {
  const text = String(req.body?.text || "").trim();
  const voiceName = req.body?.voiceName || "Puck";
  const fileName = req.body?.fileName || "preview.wav";
  const pauseSecondsRaw = Number(req.body?.pauseSeconds || req.body?.blockPause || 0);

  if (!text) {
    return res.status(400).json({ error: "Thiếu text" });
  }

  try {
    const voice = findSingleVoiceByIdOrApiId(voiceName) || {
      id: "default",
      apiId: "Puck",
      label: "Default Single Voice",
      language: "en",
      gender: "male"
    };

    const previewSettings = {
      autoBlockPause: pauseSecondsRaw > 0,
      autoBlockPauseRules: [
        {
          id: "preview_rule",
          text: "#preview",
          pause: String(pauseSecondsRaw > 0 ? pauseSecondsRaw : 0)
        }
      ],
      blockPause: pauseSecondsRaw > 0 ? pauseSecondsRaw : 0,
      A: {
        pause: pauseSecondsRaw > 0 ? pauseSecondsRaw : 0
      },
      R: {
        pause: pauseSecondsRaw > 0 ? pauseSecondsRaw : 0
      }
    };

    const normalizedPreviewScript = [
      {
        role: "A",
        text: pauseSecondsRaw > 0 ? `#preview ${mapLaughTtsText(text)}` : mapLaughTtsText(text),
        blockId: 1
      }
    ];

    const units = normalizeScriptUnits(
      normalizedPreviewScript,
      previewSettings,
      CHUNK_CHAR_LIMIT
    );

    const selection = {
      mode: "single",
      label: voice.label,
      language: voice.language || "en",
      requestSpeechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice.apiId || "Puck"
          }
        }
      },
      promptBuilder: (script) =>
        buildSingleSpeakerPrompt(script, voice.label, voice.language, {
          speed: 1,
          pitch: 1,
          pause: pauseSecondsRaw > 0 ? pauseSecondsRaw : 0
        }),
      fallbackCloudVoices: {
        A: getCloudVoiceForRole({
          language: voice.language || "en",
          role: "A",
          geminiVoiceName: voice.apiId || "Puck",
          gender: voice.gender || "male"
        })
      },
      singleSpeakerPreset: {
        speed: 1,
        pitch: 1,
        pause: pauseSecondsRaw > 0 ? pauseSecondsRaw : 0
      },
      speakerSettings: {
        A: {
          pause: pauseSecondsRaw > 0 ? pauseSecondsRaw : 0
        }
      }
    };

    const result = await synthesizeUnitsToWav({
      units,
      requestSpeechConfig: selection.requestSpeechConfig,
      promptBuilder: selection.promptBuilder,
      fileName,
      selection
    });

    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    return res.send(result.wavBuffer);
  } catch (error) {
    return res.status(500).json({
      error: safeErrorMessage(error)
    });
  }
});

app.get("/api/cache/stats", (req, res) => {
  try {
    return res.json(getCacheStats());
  } catch (error) {
    return res.status(500).json({ error: safeErrorMessage(error) });
  }
});

app.post("/api/cache/clear", (req, res) => {
  try {
    const stats = clearTtsCache();
    addLog({
      type: "manager_action",
      keyLabel: "CACHE",
      status: "info",
      chars: 0,
      message: "Clear TTS cache"
    });
    return res.json({ ok: true, stats });
  } catch (error) {
    return res.status(500).json({ error: safeErrorMessage(error) });
  }
});

app.get("/api/key-stats", (req, res) => {
  try {
    const summary = buildKeySummary();
    res.json(summary);
  } catch (error) {
    console.error("KEY-STATS ERROR:", error);
    res.status(500).json({
      error: "buildKeySummary failed",
      message: error?.message || String(error)
    });
  }
});

app.get("/api/logs/recent", (req, res) => {
  res.json({
    logs: requestLogs.slice(0, 150)
  });
});

app.delete("/api/logs", (req, res) => {
  clearLogs();
  res.json({ ok: true });
});

app.get("/api/key-stats/report", (req, res) => {
  try {
    const summary = buildKeySummary();
    const header = [
      "KEY MANAGER REPORT",
      `GeneratedAt: ${nowIso()}`,
      `TotalKeys: ${summary.totalKeys}`,
      `Active: ${summary.activeKeys}`,
      `Limited: ${summary.limitedKeys}`,
      `Invalid: ${summary.invalidKeys}`,
      `Error: ${summary.errorKeys}`,
      `TotalChars: ${summary.totalChars}`,
      `TotalSuccess: ${summary.totalSuccess}`,
      `TotalFail: ${summary.totalFail}`,
      "",
      "=== KEY DETAILS ==="
    ];

    const detailLines = summary.keys.map((item) => {
      return [
        item.keyId,
        `tier=${item.tier}`,
        `status=${item.lastStatus}`,
        `provider=${item.lastProvider || "-"}`,
        `success=${item.totalSuccess}`,
        `fail=${item.totalFail}`,
        `chars=${item.totalChars}`,
        `lastUsed=${item.lastUsedAt || "-"}`,
        `updated=${item.updatedAt || "-"}`,
        `error=${String(item.lastError || "").split(/\r?\n/).join(" ") || "-"}`
      ].join(" | ");
    });

    const logLines = ["", "=== RECENT LOGS ==="].concat(
      requestLogs.slice().reverse().map((item) => {
        return [
          item.time,
          item.type,
          item.keyLabel,
          item.status,
          `chars=${item.chars || 0}`,
          item.message || ""
        ].join(" | ");
      })
    );

    const content = header.concat(detailLines, logLines).join("\n");

    res.setHeader("Content-Disposition", "attachment; filename=key-manager-report.txt");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(content);
  } catch (error) {
    return res.status(500).json({ error: safeErrorMessage(error) });
  }
});

app.get("/api/logs/download", (req, res) => {
  const lines = requestLogs
    .slice()
    .reverse()
    .map((item) => {
      return [
        item.time,
        item.type,
        item.keyLabel,
        item.status,
        `chars=${item.chars || 0}`,
        item.message || ""
      ].join(" | ");
    });

  const content = lines.join("\n");

  res.setHeader("Content-Disposition", "attachment; filename=key-logs.txt");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.send(content);
});

app.get("/api/provider-settings", (req, res) => {
  try {
    return res.json({ ok: true, settings: getProviderSettings() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeErrorMessage(error) });
  }
});

app.post("/api/provider-settings", (req, res) => {
  try {
    const settings = updateProviderSettings({
      vertexEnabled: req.body?.vertexEnabled,
      geminiEnabled: req.body?.geminiEnabled,
      cloudApiKeyEnabled: req.body?.cloudApiKeyEnabled,
      preferredOrder: req.body?.preferredOrder
    });
    addLog({
      type: "manager_action",
      keyLabel: "PROVIDER",
      status: "info",
      chars: 0,
      message: `Provider settings updated: Vertex=${settings.vertexEnabled ? "on" : "off"}, Gemini=${settings.geminiEnabled ? "on" : "off"}`
    });
    return res.json({ ok: true, settings });
  } catch (error) {
    return res.status(400).json({ ok: false, error: safeErrorMessage(error) });
  }
});

app.get("/api/keys", (req, res) => {
  res.json(
    getAllKeys().map((item) => ({
      label: item.label,
      tier: getKeyTier(item.label),
      providerType: getKeyTier(item.label) === "paid" ? "cloud_tts" : "gemini",
      disabled: !!item.disabled,
      disabledReason: item.disabledReason || "",
      disabledUntil: item.disabledUntil || null,
      manuallyDisabled: !!item.manuallyDisabled
    }))
  );
});

app.post("/api/keys/disable", (req, res) => {
  const label = String(req.body?.label || "").trim();
  const reason = String(req.body?.reason || "manual_disabled").trim() || "manual_disabled";

  if (!label) {
    return res.status(400).json({ error: "Thiếu label key" });
  }

  const exists = getAllKeys().some((item) => item.label === label);
  if (!exists) {
    return res.status(404).json({ error: "Không tìm thấy key" });
  }

  disableKey(label, { manual: true, reason });
  updateKeyRuntime(label, {
    lastStatus: "error",
    lastError: reason === "manual_disabled" ? "Disabled manually" : reason
  });

  addLog({
    type: "manager_action",
    keyLabel: label,
    status: "info",
    chars: 0,
    message: `Manual disable: ${reason}`
  });

  return res.json({ ok: true, summary: buildKeySummary() });
});

app.post("/api/keys/enable", (req, res) => {
  const label = String(req.body?.label || "").trim();

  if (!label) {
    return res.status(400).json({ error: "Thiếu label key" });
  }

  const exists = getAllKeys().some((item) => item.label === label);
  if (!exists) {
    return res.status(404).json({ error: "Không tìm thấy key" });
  }

  enableKey(label);
  updateKeyRuntime(label, {
    lastStatus: "active",
    lastError: ""
  });

  addLog({
    type: "manager_action",
    keyLabel: label,
    status: "info",
    chars: 0,
    message: "Manual enable"
  });

  return res.json({ ok: true, summary: buildKeySummary() });
});


app.get("/api/vertex-profiles", (req, res) => {
  try {
    return res.json({ ok: true, ...listVertexProfiles() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: safeErrorMessage(error) });
  }
});

app.post("/api/vertex-profiles/import", (req, res) => {
  try {
    const profile = importVertexProfile({
      name: req.body?.name,
      credentialsJson: req.body?.credentialsJson,
      projectId: req.body?.projectId,
      location: req.body?.location,
      model: req.body?.model
    });
    rebuildVertexClients(profile);
    addLog({
      type: "manager_action",
      keyLabel: "VERTEX AI",
      status: "info",
      chars: 0,
      message: `Import Vertex profile: ${profile.name}`
    });
    return res.json({ ok: true, profile, ...listVertexProfiles() });
  } catch (error) {
    return res.status(400).json({ ok: false, error: safeErrorMessage(error) });
  }
});

app.post("/api/vertex-profiles/activate", (req, res) => {
  try {
    const profile = activateVertexProfile(req.body?.profileId);
    rebuildVertexClients(profile);
    addLog({
      type: "manager_action",
      keyLabel: "VERTEX AI",
      status: "info",
      chars: 0,
      message: `Activate Vertex profile: ${profile.name}`
    });
    return res.json({ ok: true, profile, ...listVertexProfiles() });
  } catch (error) {
    return res.status(400).json({ ok: false, error: safeErrorMessage(error) });
  }
});

app.post("/api/vertex-profiles/delete", (req, res) => {
  try {
    deleteVertexProfile(req.body?.profileId);
    rebuildVertexClients(getActiveVertexProfile());
    return res.json({ ok: true, ...listVertexProfiles() });
  } catch (error) {
    return res.status(400).json({ ok: false, error: safeErrorMessage(error) });
  }
});

app.post("/api/import-keys", (req, res) => {
  const text = req.body?.text || "";

  if (!text.trim()) {
    return res.status(400).json({
      error: "File keys trống"
    });
  }

  try {
    replaceKeys(text);
    initStats(getKeyStatsTemplate());
    resetRuntimeFromKeys();

    addLog({
      type: "manager_action",
      keyLabel: "-",
      status: "info",
      chars: 0,
      message: `Import keys thành công. Total=${getAllKeys().length}`
    });

    return res.json({
      ok: true,
      totalKeys: getAllKeys().length
    });
  } catch (error) {
    return res.status(500).json({
      error: safeErrorMessage(error)
    });
  }
});

app.post("/api/keys/import", (req, res) => {
  const raw = req.body?.raw || req.body?.text || "";

  if (!raw.trim()) {
    return res.status(400).json({
      error: "File keys trống"
    });
  }

  try {
    replaceKeys(raw);
    initStats(getKeyStatsTemplate());
    resetRuntimeFromKeys();

    return res.json({
      ok: true,
      totalKeys: getAllKeys().length
    });
  } catch (error) {
    return res.status(500).json({
      error: safeErrorMessage(error)
    });
  }
});

app.post("/api/keys/normalize", (req, res) => {
  try {
    const result = normalizeKeys();
    initStats(getKeyStatsTemplate());
    resetRuntimeFromKeys();

    addLog({
      type: "manager_action",
      keyLabel: "-",
      status: "info",
      chars: 0,
      message: `Normalize keys xong. Total=${result.totalKeys}`
    });

    return res.json({
      ok: true,
      totalKeys: result.totalKeys
    });
  } catch (error) {
    return res.status(500).json({
      error: safeErrorMessage(error)
    });
  }
});

app.post("/api/test-all-keys", async (req, res) => {
  const keys = getAllKeys();
  let tested = 0;

  for (const item of keys) {
    tested++;

    try {
      const tier = getKeyTier(item.label);
      let provider = "";

      if (isPaidKeyLabel(item.label)) {
        const cloud = await callCloudTtsOnce({
          key: item.key,
          label: item.label,
          chunkScript: [{ role: "A", text: "Say clearly: test voice connection.", blockId: 1 }],
          cloudVoiceName: "en-US-Neural2-F",
          language: "en",
          preset: selection?.singleSpeakerPreset || {},
          totalChars: 26,
          chunkIndex: 0,
          totalChunks: 1
        });

        if (cloud?.pcmBuffer) {
          provider = "cloud_paid";
        }
      } else if (isGeminiKeyLabel(item.label)) {
        const result = await tryGeminiWithInternalRetry({
          key: item.key,
          label: item.label,
          prompt: "Say clearly: test voice connection.",
          requestSpeechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Kore"
              }
            }
          },
          totalChars: 26,
          chunkIndex: 0,
          totalChunks: 1
        });

        if (result?.pcmBuffer) {
          provider = "gemini_free";
        }
      } else {
        throw new Error("Key chưa được gắn nhãn PAID_/GEMINI_ rõ ràng.");
      }

      enableKey(item.label);
      updateKeyRuntime(item.label, {
        lastStatus: "active",
        lastError: "",
        lastProvider: provider,
        quotaExceededCount: 0
      });
    } catch (error) {
      const message = safeErrorMessage(error);
      updateKeyRuntime(item.label, {
        lastStatus: inferStatusFromError(message),
        lastError: String(message),
        lastProvider: ""
      });
    }
  }

  return res.json({
    ok: true,
    total: tested,
    summary: buildKeySummary()
  });
});

app.post("/api/keys/reset-cooldown", (req, res) => {
  resetDisabledKeys();

  addLog({
    type: "manager_action",
    keyLabel: "-",
    status: "info",
    chars: 0,
    message: "Đã reset cooldown toàn bộ key"
  });

  return res.json({
    ok: true,
    summary: buildKeySummary()
  });
});

app.post("/api/keys/clear", (req, res) => {
  clearAllKeys();
  initStats({});
  resetRuntimeFromKeys();

  addLog({
    type: "manager_action",
    keyLabel: "-",
    status: "info",
    chars: 0,
    message: "Đã xóa toàn bộ key"
  });

  res.json({ ok: true });
});

app.post("/api/keys/remove-bad", (req, res) => {
  const keys = getAllKeys();

  const labelsToRemove = keys
    .map((item) => {
      const rt = keyRuntime[item.label] || {};
      const status = getUiStatus(item, rt);
      return {
        label: item.label,
        status
      };
    })
    .filter((item) => item.status === "invalid" || item.status === "error")
    .map((item) => item.label);

  removeKeysByLabels(labelsToRemove);
  initStats(getKeyStatsTemplate());
  resetRuntimeFromKeys();

  addLog({
    type: "manager_action",
    keyLabel: "-",
    status: "info",
    chars: 0,
    message: `Đã xóa key hỏng: ${labelsToRemove.join(", ") || "none"}`
  });

  res.json({
    ok: true,
    removed: labelsToRemove
  });
});

app.post("/api/keys/remove", (req, res) => {
  const labels = Array.isArray(req.body?.labels) ? req.body.labels : [];

  removeKeysByLabels(labels);
  initStats(getKeyStatsTemplate());
  resetRuntimeFromKeys();

  res.json({ ok: true });
});

const PORT = process.env.PORT || 3030;
const HOST = process.env.HOST || "127.0.0.1";

app.listen(PORT, HOST, () => {
  console.log(`✅ Server running at http://${HOST}:${PORT}`);
});
