import { GoogleAuth } from "google-auth-library";
import fetch from "node-fetch";

// =========================
// CONFIG
// =========================
const PROJECT_ID = "ttsp-493112";
const LOCATION = "us-central1";
const MODEL = "gemini-2.5-flash-preview-tts";

// =========================
// AUTH (VERTEX)
// =========================
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

async function getAccessToken(): Promise<string> {
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token || !token.token) {
    throw new Error("Failed to get access token");
  }

  return token.token;
}

// =========================
// MAIN TTS (VERTEX ONLY)
// =========================
export async function callGeminiTTS({
  text,
  voiceName = "Puck",
}: {
  text: string;
  voiceName?: string;
}): Promise<Buffer> {
  console.log("[Vertex] Generating audio...");

  const accessToken = await getAccessToken();

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName,
          },
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Vertex ERROR]", errText);

    throw new Error(`Vertex TTS failed: ${res.status}`);
  }

  const data: any = await res.json();

  const audioPart = data?.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData
  );

  if (!audioPart || !audioPart.inlineData || !audioPart.inlineData.data) {
    throw new Error("No audio data returned from Vertex");
  }

  const base64Audio = audioPart.inlineData.data;

  return Buffer.from(base64Audio, "base64");
}

// =========================
// REACTION GENERATOR
// =========================
export async function callGeminiReaction(
  reactionKeyword: string,
  voiceName: string = "Puck"
): Promise<Buffer> {
  // Bộ mapping Reaction chuẩn Tiếng Anh cho kênh Easy English Channel
  const reactionMap: Record<string, string> = {
    "haha": "Ha ha ha!",
    "hahaha": "Ha ha ha ha ha!",
    "hihi": "Hee hee!",
    "hehe": "Heh heh.",
    "sigh": "*Sigh*...",
    "tsk": "Tsk tsk.",
    "humph": "Humph.",
    "oh": "Oh!",
    "wow": "Wow!",
    "ah": "Ah!",
    "um": "Um...",
    "hmm": "Hmm..."
  };

  const textToSpeak = reactionMap[reactionKeyword.toLowerCase()] || reactionKeyword;
  
  console.log(`[Vertex] Generating reaction for keyword: ${reactionKeyword} -> "${textToSpeak}"`);
  
  // Tái sử dụng hàm gọi Vertex TTS có sẵn
  return callGeminiTTS({ text: textToSpeak, voiceName });
}