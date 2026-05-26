import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type StepId = PipelineStepId;
type Outputs = Record<StepId, string>;

type StepProgress = {
  percent: number;
  label: string;
  status: 'idle' | 'running' | 'done' | 'error';
};

type StepDef = {
  id: StepId;
  title: string;
  short: string;
};

const steps: StepDef[] = [
  {
    id: "structure",
    title: "1. Xây cấu trúc",
    short: "Tách ý, dựng outline #HOOK / #CTA_INTRO / #INTRO / #BODY / #CTA_MID / #CTA_END",
  },
  {
    id: "expand",
    title: "2. Tăng độ dài",
    short: "Mở rộng lên mục tiêu 12k–15k ký tự",
  },
  {
    id: "natural",
    title: "3. Tự nhiên hơn",
    short: "Làm giọng nói mềm, thân thiện, giống podcast",
  },
  {
    id: "standardize",
    title: "4. Chuẩn hóa ngôn ngữ",
    short: "Sửa grammar, câu dễ đọc, đúng level",
  },
  {
    id: "conversation",
    title: "5. Humanizer / Xóa cảm giác AI",
    short: "Làm hội thoại bớt hoàn hảo, đời thường hơn, CTA mềm hơn",
  },
];

const emptyOutputs: Outputs = {
  structure: "",
  expand: "",
  natural: "",
  standardize: "",
  conversation: "",
  translateVi: "",
};

const TRANSLATION_CHUNK_TARGET_CHARS = 2600;

function preferredTranslateApiSettings(settings: ApiSettings): ApiSettings {
  const geminiModel = settings.geminiModel || defaultApiSettings.geminiModel;
  const openaiModel = settings.openaiModel || defaultApiSettings.openaiModel;
  return {
    ...settings,
    // Translation should be fast and non-premium by default.
    geminiModel: settings.provider === "gemini" ? "gemini-2.5-flash-lite" : geminiModel,
    openaiModel: settings.provider === "openai" ? "gpt-4.1-mini" : openaiModel,
  };
}

function splitScriptForTranslation(text: string, targetChars = TRANSLATION_CHUNK_TARGET_CHARS) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks: string[] = [];
  const lines = normalized.split("\n");
  let current: string[] = [];

  for (const line of lines) {
    const isBlockStart = /^\s*#[A-Z0-9_]+(?:\s|-|$)/i.test(line);
    if (isBlockStart && current.length) {
      blocks.push(current.join("\n").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n").trim());

  const chunks: string[] = [];
  let bucket = "";
  for (const block of blocks) {
    if (!bucket) {
      bucket = block;
      continue;
    }
    if ((bucket + "\n\n" + block).length <= targetChars) {
      bucket += "\n\n" + block;
    } else {
      chunks.push(bucket);
      bucket = block;
    }
  }
  if (bucket) chunks.push(bucket);

  if (chunks.length <= 1 && normalized.length > targetChars) {
    const paragraphs = normalized.split(/\n{2,}/);
    const paragraphChunks: string[] = [];
    let paragraphBucket = "";
    for (const paragraph of paragraphs) {
      if (!paragraphBucket) paragraphBucket = paragraph;
      else if ((paragraphBucket + "\n\n" + paragraph).length <= targetChars) paragraphBucket += "\n\n" + paragraph;
      else {
        paragraphChunks.push(paragraphBucket);
        paragraphBucket = paragraph;
      }
    }
    if (paragraphBucket) paragraphChunks.push(paragraphBucket);
    return paragraphChunks;
  }

  return chunks;
}


function sanitizeScriptForVoice(text: string) {
  if (!text) return text;
  return text
    .replace(/\[(laughs?|chuckles?|chuckle|giggles?|giggle)\]/gi, "haha")
    .replace(/\[(pause|sigh|music|breath|breathing)\]/gi, "")
    .replace(/\((laughs?|chuckles?|chuckle|giggles?|giggle)\)/gi, "haha")
    .replace(/\((pause|sigh|music|breath|breathing)\)/gi, "")
    .replace(/\bchuckles\b/gi, "haha")
    .replace(/\bchuckling\b/gi, "haha")
    .replace(/\blaughs\b/gi, "haha")
    .replace(/\blaughing\b/gi, "haha")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function freshStepProgress(): Record<StepId, StepProgress> {
  return {
    structure: { percent: 0, label: "Chưa chạy", status: "idle" },
    expand: { percent: 0, label: "Chưa chạy", status: "idle" },
    natural: { percent: 0, label: "Chưa chạy", status: "idle" },
    standardize: { percent: 0, label: "Chưa chạy", status: "idle" },
    conversation: { percent: 0, label: "Chưa chạy", status: "idle" },
    translateVi: { percent: 0, label: "Chưa chạy", status: "idle" },
  };
}

const PROMPT_CHAIN_VERSION = "2026-05-17-reaction-cleanup-v4";

const promptEditorSteps: { id: StepId; title: string; desc: string }[] = [
  { id: "structure", title: "Step 1 — Structure", desc: "Dựng cấu trúc, mode, block và flow." },
  { id: "expand", title: "Step 2 — Expand", desc: "Mở rộng độ dài, thêm story và đoạn nối." },
  { id: "natural", title: "Step 3 — Naturalize", desc: "Làm mềm hội thoại và giảm cảm giác bài giảng." },
  { id: "standardize", title: "Step 4 — Clean Language", desc: "Chuẩn hóa ngôn ngữ, bỏ dịch máy và teaching tone." },
  { id: "conversation", title: "Step 5 — Humanizer", desc: "Xóa cảm giác AI, làm hội thoại đời thường hơn." },
  { id: "translateVi", title: "Translation — Bilingual Review", desc: "Dịch phụ sang tiếng Việt để review nhanh." },
];

const defaultPromptTemplates: Record<StepId, string> = {
  structure: `Hãy viết lại/xây cấu trúc một kịch bản tiếng Anh theo đúng Script Format đã chọn.

MỤC TIÊU STEP 1:
- Dựa trên script gốc hoặc ý tưởng user, rút ra ý chính và dựng lại flow mới.
- Short Mode: dùng #HOOK / #INTRO / #BODY / #CTA_MID nếu cần / #CTA_END.
- Long Mode: tạo Master Outline, rồi dùng #HOOK / #INTRO / #BODY_PART_1... / #CTA_MID nếu cần / #ENDING / #CTA_END.
- Không lặp Hook/Intro/CTA trong từng BODY_PART.
- CTA phải mềm, giống hội thoại thật, không giống lời kêu gọi quảng cáo.
- Có tình huống thực tế, awkward moments, mini story, phản ứng đời thường nếu nội dung cho phép.
- Ưu tiên cảm giác "2 người đang trò chuyện thật" thay vì "2 host đang dạy học".

QUAN TRỌNG:
- KHÔNG viết theo kiểu lesson/tutorial/checklist.
- KHÔNG dùng cấu trúc:
  - "Step 1"
  - "First"
  - "Next"
  - "Finally"
  - "Let's recap"
  - "Today we will learn"
  - "Here are some tips"
- KHÔNG biến script thành bài giảng tiếng Anh.
- KHÔNG để hai người nói chuyện như giáo viên hoặc podcast host chuyên nghiệp.
- KHÔNG làm mọi đoạn đều mang tính giải thích hoặc hướng dẫn.
- KHÔNG để nhân vật liên tục giải thích lý thuyết cho nhau.

THAY VÀO ĐÓ:
- Hãy để nội dung xuất hiện tự nhiên qua:
  - câu chuyện
  - trải nghiệm cá nhân
  - tình huống awkward
  - mini conversation
  - reaction tự nhiên
  - ví dụ đời thường
- Người nghe nên cảm giác:
  "đang nghe hai người thật trò chuyện"
  thay vì:
  "đang nghe bài học tiếng Anh".

OUTPUT:
- Chỉ output script.
- Không giải thích thêm ngoài script.

{{COMMON}}

SCRIPT GỐC / Ý TƯỞNG:
{{SOURCE_TEXT}}`,
  expand: `Mở rộng kịch bản dưới đây.

GIỮ NGUYÊN:
- Series context.
- Block structure.
- Preset metadata.
- Speaker labels phù hợp với format.
- Existing story flow.

CHỈ ĐƯỢC:
- Thêm dòng hội thoại.
- Thêm reaction tự nhiên.
- Thêm awkward moments nhẹ.
- Thêm mini story hoặc personal experience nếu phù hợp.
- Thêm đoạn nối mềm và tự nhiên giữa các block.
- Làm hội thoại dài hơn và sống động hơn.

MỤC TIÊU:
- Ít nhất {{TARGET_LENGTH}} ký tự nếu nội dung cho phép.
- Không rewrite toàn bộ.
- Không làm mất logic series.
- Không thay đổi format block.
- Không làm thay đổi tone tổng thể.

QUAN TRỌNG:
- KHÔNG biến script thành bài giảng hoặc tutorial.
- KHÔNG thêm cấu trúc:
  - "Step 1"
  - "First"
  - "Next"
  - "Finally"
  - "Let's recap"
  - "Here are some tips"
- KHÔNG làm hai nhân vật nói chuyện như giáo viên hoặc podcast host chuyên nghiệp.
- KHÔNG thêm quá nhiều giải thích lý thuyết.
- KHÔNG làm mọi đoạn đều mang tính dạy học.

ƯU TIÊN:
- casual conversation
- slice-of-life feeling
- natural reactions
- imperfect dialogue rhythm
- relatable situations
- tiny emotional moments
- conversational chemistry
- real human interaction

Nội dung nên giống:
- hai người bạn đang trò chuyện thật
KHÔNG giống:
- lesson script
- educational outline
- speaking exercise
- AI-generated tutorial

OUTPUT:
- Chỉ output script.
- Không giải thích thêm ngoài script.

{{COMMON}}

SCRIPT:
{{SOURCE_TEXT}}`,
  natural: `Làm đoạn hội thoại tự nhiên hơn.

GIỮ NGUYÊN:
- Series flow.
- Block structure.
- Preset metadata.
- Speaker labels.
- Main topic và ý chính.

TỐI ƯU:
- Ngắt lời nhẹ tự nhiên.
- Self-correction nhẹ.
- Hesitation nhỏ nếu phù hợp.
- Reaction đời thường.
- Tiny awkward moments.
- Làm nhịp hội thoại bớt hoàn hảo.
- Tăng chemistry giữa nhân vật.
- CTA phải mềm, giống đoạn kết trò chuyện thật.

QUAN TRỌNG:
- Hội thoại phải giống:
  "hai người thật đang nói chuyện"
KHÔNG giống:
  "podcast host"
  "lesson script"
  "AI trying to sound natural"

KHÔNG ĐƯỢC:
- Không phá flow series.
- Không rewrite toàn bộ.
- Không biến thành bài giảng.
- Không thêm teaching structure.
- Không thêm recap/tutorial wording.
- Không làm mọi câu đều nghe quá hay hoặc quá polished.
- Không để hai người luôn phản hồi hoàn hảo với nhau.
- Không làm nhân vật nghe như đang đọc script hoàn chỉnh.

TRÁNH:
- poetic lines
- motivational phrasing
- therapist-like responses
- perfectly balanced replies
- overexplaining
- too much agreement
- excessive enthusiasm
- forced jokes

ƯU TIÊN:
- casual rhythm
- imperfect reactions
- conversational overlap feeling
- tiny emotional reactions
- relatable human moments
- slightly messy dialogue flow

REAL CONVERSATION RHYTHM:
- People sometimes react before the other person fully finishes.
- Short emotional reactions are common.
- Small overlap feeling is natural.
- Not every reply needs a full sentence.
- Some responses can be very short.
- Quick agreement or interruption is natural in casual conversation.

CTA RULE:
- CTA phải giống lời kết tự nhiên.
- Không được sounding like:
  "like and subscribe"
- Không được giống outro YouTube.
- Nên giống:
  "Anyway, yeah... thanks for hanging out with us."

OUTPUT:
- Chỉ output script.
- Không giải thích thêm ngoài script.

{{COMMON}}

SCRIPT:
{{SOURCE_TEXT}}`,
  standardize: `Make the conversation clean, natural, and voice-ready without changing the main language of the script.

STEP 4: CLEAN LANGUAGE PASS

IMPORTANT:
- This is NOT a Vietnamese translation step.
- Do NOT translate the script into Vietnamese.
- Do NOT mix Vietnamese into English lines.
- Do NOT create English-Vietnamese translation pairs.
- Do NOT insert explanatory Vietnamese sentences.
- If the script is English-only, keep it English-only.
- If the script uses another main language, keep that same main language.
- Keep one main language per sentence.

FIX:
- Remove word-by-word translation feeling.
- Remove direct translation structure.
- Remove remaining teaching tone.
- Remove podcast-host energy.
- Make sentences clear, spoken, and easy for voice generation.
- Keep simple English if the script is for English learners.

REACTION FORMAT RULES:
- Do NOT use square-bracket stage directions like [laugh], [laughs], [pause], [sigh], [music].
- Do NOT use parenthetical stage directions like (laugh), (laughs), (chuckle), (chuckles), (sigh).
- Use spoken reactions instead, only when natural:
  haha
  hahaha
  heh
  oh man
  wait—
  seriously?
  no way
  oh no
- Do not overuse reactions.

CONVERSATION STYLE:
- Sound like close friends casually talking.
- Not teachers.
- Not hosts.
- Not language coaches.
- Not tutorial dialogue.

AVOID:
- overexplaining
- recap energy
- lesson cadence
- motivational tone
- perfect transitions
- perfectly structured exchanges
- too much agreement
- every line sounding meaningful

KEEP:
- Block structure exactly.
- Timing preset metadata exactly.
- Speaker labels exactly.
- Core meaning.
- Original main language of the script.

OUTPUT:
- Only output the script.
- No explanation outside the script.

{{COMMON}}

SCRIPT:
{{SOURCE_TEXT}}`,
  conversation: `Make the conversation sound like real human speech, but do NOT simply add filler words everywhere.

STEP 5: HUMANIZER PASS

Your job is to remove AI perfection from the dialogue.

The goal is NOT to make the dialogue more beautiful.
The goal is to make it sound like two real friends casually talking.

KEEP:
- Keep block structure exactly.
- Keep timing preset metadata exactly.
- Keep speaker labels exactly.
- Keep the main meaning and story flow.
- Keep CTA blocks soft and casual.
- Final script must still be ready for the voice/video app.

CHARACTER DIFFERENCE RULES:

Speaker A:
- calmer
- more grounded
- slightly more structured
- explains things more clearly
- lower emotional energy

Speaker R:
- more spontaneous
- more reactive
- slightly more emotional
- interrupts more naturally
- reacts faster
- sometimes exaggerates slightly

REACTION FORMAT RULES:
- Do NOT use square-bracket stage directions like [laugh], [laughs], [pause], [sigh], [music].
- Do NOT use parenthetical stage directions like (laugh), (laughs), (chuckle), (chuckles), (sigh).
- Use spoken reactions instead, only when natural:
  haha
  hahaha
  heh
  oh man
  wait—
  seriously?
  no way
  oh no
- Reactions must feel like part of spoken dialogue.
- Do NOT spam reactions.
- Do NOT force laughter into every block.

AVOID AI-LIKE SPEECH:
- Avoid poetic lines.
- Avoid inspirational phrasing.
- Avoid therapist-like responses.
- Avoid perfectly balanced replies.
- Avoid overly supportive reactions.
- Avoid perfect callbacks.
- Avoid polished podcast-host wording.
- Avoid lesson-ending conclusions.
- Avoid every line sounding meaningful.
- Avoid both speakers always agreeing.
- Avoid overexplaining emotions.
- Avoid "movie dialogue" energy.
- Avoid sounding too clever or too polished.

MAKE IT MORE HUMAN:
- Let speakers underreact sometimes.
- Add small misunderstandings when natural.
- Add light awkward interruptions.
- Add self-corrections mid-sentence.
- Add incomplete sentences.
- Add tiny failed jokes.
- Add gentle disagreement.
- Add casual, unnecessary remarks.
- Make some responses less perfect.
- Make the rhythm slightly messy.
- Let some reactions feel quiet or low-energy.
- Allow small pauses or flat responses.
- Let some exchanges feel unfinished naturally.

IMPORTANT HUMAN RULES:
- Do NOT try too hard to sound natural.
- Do NOT overload the script with filler words or interruptions.
- Natural conversation still contains many normal, simple lines.
- Not every line needs emotional weight.
- Not every reply needs to be witty or meaningful.
- Real conversations contain small low-value moments.
- Real people sometimes respond briefly or awkwardly.
- Real conversations are not optimized like AI dialogue.
- Vary conversational energy naturally.
- Some exchanges can feel more animated.
- Some exchanges can feel quiet or slightly flat.

CONVERSATION STYLE:
The dialogue should feel like:
- close friends talking casually
- spontaneous conversation
- slice-of-life interaction
- relaxed real-world speech

NOT like:
- a lesson script
- podcast hosts
- motivational content
- polished YouTube dialogue
- AI trying hard to sound human

CTA RULE:
CTA must feel like part of the conversation, not a YouTube marketing line.
Do NOT sound like:
- "Like and subscribe"
- "Thanks for watching everyone"
- "See you in the next lesson"

CTA should feel more like:
- a casual goodbye
- a natural wrap-up
- two people ending a conversation naturally

GOOD CTA EXAMPLES:

GOOD:
A: Anyway, yeah... this was actually kinda fun to talk about.
R: Yeah, honestly. And now I'm thinking about all the awkward introductions I've had.
A: Same here. Some of them were painfully bad.
R: But hey, at least they make good stories later.
A: Exactly. Alright, we'll catch you next time.
R: See ya.

GOOD:
R: Honestly, I didn't realize how much overthinking goes into simple conversations.
A: Right? Sometimes you just say something random and it works.
R: Which is... weirdly comforting actually.
A: Yeah. Anyway, thanks for hanging out with us today.
R: Alright, talk to you again soon.

GOOD:
A: You know what's funny? I still mess this stuff up sometimes.
R: Oh, same. Constantly.
A: So I guess nobody ever fully masters small talk.
R: Nope. We just get slightly less awkward over time.
A: That's probably true.
R: Alright, let's leave it there before we embarrass ourselves more.

OUTPUT:
- Only output the script.
- No explanation outside the script.

{{COMMON}}

SCRIPT:
{{SOURCE_TEXT}}`,
  translateVi: `Hãy dịch script tiếng Anh dưới đây sang tiếng Việt để người sản xuất dễ kiểm tra nội dung.

YÊU CẦU:
- Giữ nguyên 100% các dòng metadata preset dạng #HOOK - 6s - A ...
- Giữ nguyên label thoại A:, R:, BOTH: hoặc label format khác nếu có.
- Chỉ dịch nội dung sau speaker label sang tiếng Việt.
- Dịch tự nhiên, dễ hiểu, không dịch từng chữ máy móc.
- Không thêm giải thích ngoài bản dịch.

SCRIPT CẦN DỊCH:
{{SOURCE_TEXT}}`,
};

function normalizePromptDrafts(customPrompts?: Partial<Record<StepId, string>>) {
  return promptEditorSteps.reduce((acc, step) => {
    acc[step.id] = customPrompts?.[step.id]?.trim() || defaultPromptTemplates[step.id];
    return acc;
  }, {} as Record<StepId, string>);
}

function diffCustomPrompts(drafts: Record<StepId, string>) {
  return promptEditorSteps.reduce((acc, step) => {
    const value = drafts[step.id]?.trim() || "";
    if (value && value !== defaultPromptTemplates[step.id]) acc[step.id] = value;
    return acc;
  }, {} as Partial<Record<StepId, string>>);
}

const defaultApiSettings: ApiSettings = {
  provider: "gemini",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash-lite",
  openaiApiKey: "",
  openaiModel: "gpt-4.1-mini",
  qualityMode: "fast",
};

const defaultBlockPresets: BlockPreset[] = [
  {
    tag: "#HOOK",
    name: "Hook",
    pauseSeconds: 6,
    aSpeed: 0.96,
    aPitch: 0.1,
    aPause: 0.22,
    rSpeed: 1.0,
    rPitch: 0.1,
    rPause: 0.18,
  },
  {
    tag: "#CTA_INTRO",
    name: "CTA đầu",
    pauseSeconds: 3,
    aSpeed: 0.96,
    aPitch: 0.08,
    aPause: 0.2,
    rSpeed: 1.0,
    rPitch: 0.1,
    rPause: 0.18,
  },
  {
    tag: "#INTRO",
    name: "Intro",
    pauseSeconds: 4,
    aSpeed: 0.98,
    aPitch: 0.08,
    aPause: 0.2,
    rSpeed: 1.0,
    rPitch: 0.1,
    rPause: 0.18,
  },
  {
    tag: "#BODY",
    name: "Body",
    pauseSeconds: 3,
    aSpeed: 1.0,
    aPitch: 0.05,
    aPause: 0.18,
    rSpeed: 1.02,
    rPitch: 0.08,
    rPause: 0.18,
  },
  {
    tag: "#CTA_MID",
    name: "CTA giữa",
    pauseSeconds: 3,
    aSpeed: 0.96,
    aPitch: 0.08,
    aPause: 0.2,
    rSpeed: 1.0,
    rPitch: 0.1,
    rPause: 0.18,
  },
  {
    tag: "#CTA_END",
    name: "CTA cuối",
    pauseSeconds: 5,
    aSpeed: 0.96,
    aPitch: 0.08,
    aPause: 0.22,
    rSpeed: 1.0,
    rPitch: 0.1,
    rPause: 0.2,
  },
];

function countChars(text: string) {
  return new Intl.NumberFormat("vi-VN").format(text.length);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGenerationStep(stepId: StepId) {
  return stepId !== "translateVi";
}

function stepIndex(stepId: StepId) {
  return steps.findIndex((step) => step.id === stepId);
}

function getStepCharCount(stepId: StepId, outputs: Outputs) {
  return outputs[stepId]?.length || 0;
}

function previousText(stepId: StepId, original: string, outputs: Outputs) {
  if (stepId === "structure") return original;
  if (stepId === "expand") return outputs.structure || original;
  if (stepId === "natural")
    return outputs.expand || outputs.structure || original;
  if (stepId === "standardize")
    return outputs.natural || outputs.expand || outputs.structure || original;
  if (stepId === "conversation")
    return (
      outputs.standardize ||
      outputs.natural ||
      outputs.expand ||
      outputs.structure ||
      original
    );
  return (
    outputs.conversation ||
    outputs.standardize ||
    outputs.natural ||
    outputs.expand ||
    outputs.structure ||
    original
  );
}

function maskKey(value = "") {
  if (!value) return "Chưa lưu";
  if (value.length <= 10) return "Đã lưu";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function App() {
  const [apiSettings, setApiSettings] =
    useState<ApiSettings>(defaultApiSettings);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [promptEditorStep, setPromptEditorStep] = useState<StepId>("structure");
  const [promptDrafts, setPromptDrafts] = useState<Record<StepId, string>>(() => normalizePromptDrafts());
  const [advancedMode, setAdvancedMode] = useState(false);
  const [topic, setTopic] = useState("Daily English conversation");
  const [scriptLengthMode, setScriptLengthMode] = useState<"short" | "long">("short");
  const [targetLength, setTargetLength] = useState("12000-15000");
  const [scriptFormat, setScriptFormat] = useState("Podcast 2 speakers - A/R");
  const [inputMode, setInputMode] = useState<"competitor" | "idea">("competitor");
  const [tone] = useState("Friendly, natural, creator-first");
  const [showManualInputModal, setShowManualInputModal] = useState(false);
  const [manualInputDraft, setManualInputDraft] = useState("");
  const [qualityMode, setQualityMode] = useState<ApiSettings["qualityMode"]>("fast");
  const [originalScript, setOriginalScript] = useState("");
  const [showOriginalScriptModal, setShowOriginalScriptModal] = useState(false);
  const [showPatchModal, setShowPatchModal] = useState(false);
  const [patchInstruction, setPatchInstruction] = useState("");
  const [patchScope, setPatchScope] = useState<"final" | "active">("final");
  const [outputs, setOutputs] = useState<Outputs>(emptyOutputs);
  const [activeStep, setActiveStep] = useState<StepId>("structure");
  const [running, setRunning] = useState<StepId | "all" | "patch" | null>(null);
  const [status, setStatus] = useState("Sẵn sàng.");
  const [stepProgress, setStepProgress] = useState<Record<StepId, StepProgress>>(() => freshStepProgress());
  const [blockPresets, setBlockPresets] =
    useState<BlockPreset[]>(defaultBlockPresets);

  const outputRef = useRef<HTMLTextAreaElement | null>(null);
  const translationRef = useRef<HTMLTextAreaElement | null>(null);
  const syncingRef = useRef(false);
  const translationRunIdRef = useRef(0);

  const finalScript =
    outputs.conversation ||
    outputs.standardize ||
    outputs.natural ||
    outputs.expand ||
    outputs.structure;
  const activeOutput = outputs[activeStep];
  const activeInput = useMemo(
    () => previousText(activeStep, originalScript, outputs),
    [activeStep, originalScript, outputs],
  );
  const translationSource = activeOutput || activeInput;
  const patchSource = patchScope === "active" ? activeOutput : finalScript;
  const vietnameseScript = outputs.translateVi;
  const completedSteps = steps.filter((step) => outputs[step.id]?.trim()).length;
  const simpleProgressText = running
    ? `${running === "patch" ? "AI Patch" : steps.find((step) => step.id === running)?.title || "Đang xử lý"}...`
    : completedSteps
      ? `${completedSteps}/${steps.length} bước đã hoàn thành`
      : "Sẵn sàng tạo script";

  function canRunStep(stepId: StepId) {
    if (running) return false;
    if (!originalScript.trim()) return false;
    if (stepId === "conversation") return true;
    const index = stepIndex(stepId);
    if (index <= 0) return true;
    const previous = steps[index - 1];
    return Boolean(outputs[previous.id]?.trim());
  }

  function stepRunLabel(stepId: StepId) {
    if (running === stepId) return "Đang chạy";
    return outputs[stepId]?.trim() ? "Chạy lại" : "Chạy";
  }
  function updateStepProgress(stepId: StepId, patch: Partial<StepProgress>) {
    setStepProgress((prev) => ({
      ...prev,
      [stepId]: { ...prev[stepId], ...patch },
    }));
  }

  function resetGeneratedScriptState() {
    translationRunIdRef.current += 1;
    setOutputs({ ...emptyOutputs });
    setStepProgress(freshStepProgress());
    setActiveStep("structure");
    setRunning(null);
  }

  async function simulateStepProgress(stepId: StepId) {
    const checkpoints = [12, 24, 38, 52, 66, 78, 88];
    for (const percent of checkpoints) {
      await delay(650);
      updateStepProgress(stepId, {
        percent,
        status: "running",
        label: percent < 40 ? "Đang gửi prompt..." : percent < 75 ? "AI đang viết script..." : "Đang nhận output...",
      });
    }
  }


  useEffect(() => {
    window.easyScriptAPI?.loadSettings().then((result) => {
      if (result.ok && result.settings)
        {
          const loaded = { ...defaultApiSettings, ...result.settings };
          const canUseSavedPrompts = loaded.promptChainVersion === PROMPT_CHAIN_VERSION;
          setApiSettings(loaded);
          setPromptDrafts(normalizePromptDrafts(canUseSavedPrompts ? loaded.customPrompts : undefined));
          setQualityMode(loaded.qualityMode || "fast");
          if (!canUseSavedPrompts && loaded.customPrompts && Object.keys(loaded.customPrompts).length) {
            setStatus("Prompt mặc định đã được nâng cấp. Prompt custom cũ được tạm bỏ qua để tránh dùng lại bản lỗi thời.");
          }
        }
    });
  }, []);

  function generationSettings(stepId?: StepId) {
    const mode = qualityMode || "fast";
    const fastGeminiModel = "gemini-2.5-flash-lite";
    const highQualityGeminiModel = "gemini-2.5-flash";
    const selectedApiSettings: ApiSettings = {
      ...apiSettings,
      qualityMode: mode,
      // Fast/Balanced keep the main pipeline on the more stable model.
      // Only Step 5 may use 2.5 Flash when the user explicitly selects High Quality.
      geminiModel:
        mode === "highQuality" && stepId === "conversation"
          ? highQualityGeminiModel
          : fastGeminiModel,
      openaiModel: mode === "highQuality" ? (apiSettings.openaiModel || "gpt-4.1") : "gpt-4.1-mini",
    };
    const outlineModeText = scriptLengthMode === "long"
      ? "Long Script Mode: create a Master Outline first, then write one global HOOK/INTRO, multiple BODY_PART sections, optional CTA_MID, and one ENDING/CTA_END. Do NOT repeat Hook/Intro/CTA inside every part."
      : "Short Script Mode: use one compact workflow with Hook, Intro, Body, CTA, Ending.";
    return {
      targetLength,
      level: outlineModeText,
      topic: `${topic}\nInput Type: ${inputMode === "competitor" ? "Import competitor/reference script" : "Start from my own idea"}\nScript Format: ${scriptFormat}\nTone/Mood: ${tone}`,
      apiSettings: selectedApiSettings,
      blockPresets,
      scriptLengthMode,
      inputMode,
      scriptFormat,
      customPrompts: promptDrafts,
    };
  }

  async function runStep(stepId: StepId) {
    setActiveStep(stepId);
    const inputText = previousText(stepId, originalScript, outputs);
    if (!inputText.trim()) {
      setStatus("Bạn cần nhập script gốc hoặc chạy bước trước đó.");
      return false;
    }
    if (!window.easyScriptAPI) {
      setStatus("Không tìm thấy Electron API. Hãy chạy app bằng Electron.");
      return false;
    }
    setRunning(stepId);
    updateStepProgress(stepId, { percent: 8, label: "Bắt đầu chạy step...", status: "running" });
    setStatus(
      `Đang chạy: ${steps.find((s) => s.id === stepId)?.title || stepId}...`,
    );
    const progressTask = simulateStepProgress(stepId);
    const result = await window.easyScriptAPI.generateStep({
      step: stepId,
      inputText,
      settings: generationSettings(stepId),
    });
    await progressTask;
    if (!result.ok || !result.text) {
      updateStepProgress(stepId, { percent: 100, label: "Lỗi", status: "error" });
      setStatus(`Lỗi: ${result.error || "Không có output."}`);
      setRunning(null);
      return false;
    }
    const generatedText = stepId === "translateVi" ? (result.text || "") : sanitizeScriptForVoice(result.text || "");
    updateStepProgress(stepId, { percent: 100, label: "Hoàn tất", status: "done" });
    setOutputs((prev) => ({ ...prev, [stepId]: generatedText }));
    setStatus(
      `Hoàn thành ${steps.find((s) => s.id === stepId)?.title}. Bấm “🌐 Dịch lại” nếu bạn cần Smart Bilingual Review.`,
    );
    setRunning(null);
    return true;
  }

  async function runAll() {
    if (!originalScript.trim()) {
      setOriginalScript(`Topic / Idea: ${topic}\nScript Length Mode: ${scriptLengthMode}\nTarget length: ${targetLength}\nInput Type: ${inputMode}\nScript Format: ${scriptFormat}\nTone/Mood: ${tone}`);
    }
    let workingOutputs = { ...outputs };
    for (const step of steps) {
      const inputText = previousText(step.id, originalScript || `Topic / Idea: ${topic}\nScript Length Mode: ${scriptLengthMode}\nTarget length: ${targetLength}\nInput Type: ${inputMode}\nScript Format: ${scriptFormat}\nTone/Mood: ${tone}`, workingOutputs);
      setRunning(step.id);
      setActiveStep(step.id);
      updateStepProgress(step.id, { percent: 8, label: "Run All đang chạy step này...", status: "running" });
      setStatus(`Run All: ${step.title}...`);
      const progressTask = simulateStepProgress(step.id);
      const result = await window.easyScriptAPI?.generateStep({
        step: step.id,
        inputText,
        settings: generationSettings(step.id),
      });
      await progressTask;
      if (!result?.ok || !result.text) {
        updateStepProgress(step.id, { percent: 100, label: "Lỗi", status: "error" });
        setStatus(
          `Run All dừng ở ${step.title}: ${result?.error || "Không có output."}`,
        );
        setRunning(null);
        return;
      }
      updateStepProgress(step.id, { percent: 100, label: "Hoàn tất", status: "done" });
      const cleanedText = sanitizeScriptForVoice(result.text);
      workingOutputs = { ...workingOutputs, [step.id]: cleanedText };
      setOutputs(workingOutputs);
      setStatus(`Run All: ${step.title} hoàn thành. Nghỉ ngắn để tránh quá tải model...`);
      await delay(2500);
    }
    setStatus("Run All hoàn thành. Final script đã sẵn sàng. Bản dịch không tự chạy để tiết kiệm thời gian; bấm “🌐 Dịch lại” nếu cần review tiếng Việt.");
    setRunning(null);
  }

  async function translateText(sourceText: string, silent = false) {
    const source = sourceText.trim();
    if (!source || !window.easyScriptAPI) return false;

    const runId = translationRunIdRef.current + 1;
    translationRunIdRef.current = runId;

    const chunks = splitScriptForTranslation(source);
    if (!chunks.length) return false;

    if (!silent) {
      setRunning("translateVi");
      setStatus("Đang dịch tiếng Việt theo từng block...");
    }
    updateStepProgress("translateVi", { percent: 5, label: "Bắt đầu dịch...", status: "running" });

    const translatedChunks: string[] = [];
    setOutputs((prev) => ({ ...prev, translateVi: "" }));

    for (let index = 0; index < chunks.length; index += 1) {
      if (translationRunIdRef.current !== runId) return false;

      const chunk = chunks[index];
      setStatus(
        `${silent ? "Tự dịch" : "Đang dịch"} tiếng Việt: đoạn ${index + 1}/${chunks.length}...`,
      );

      const result = await window.easyScriptAPI.generateStep({
        step: "translateVi",
        inputText: chunk,
        settings: {
          ...generationSettings("translateVi"),
          apiSettings: preferredTranslateApiSettings({ ...apiSettings, qualityMode: "fast", geminiModel: "gemini-2.5-flash-lite", openaiModel: "gpt-4.1-mini" }),
        },
      });

      if (!result.ok || !result.text) {
        updateStepProgress("translateVi", { percent: 100, label: "Lỗi dịch", status: "error" });
        if (!silent) setRunning(null);
        setStatus(`Lỗi dịch đoạn ${index + 1}: ${result.error || "Không có output."}`);
        return false;
      }

      translatedChunks.push(result.text.trim());
      const partialTranslation = translatedChunks.join("\n\n");
      const percent = Math.round(((index + 1) / chunks.length) * 100);
      updateStepProgress("translateVi", {
        percent,
        label: index + 1 >= chunks.length ? "Dịch xong" : `Đã dịch ${index + 1}/${chunks.length} đoạn`,
        status: index + 1 >= chunks.length ? "done" : "running",
      });
      setOutputs((prev) => ({ ...prev, translateVi: partialTranslation }));

      if (index < chunks.length - 1) await delay(250);
    }

    if (!silent) {
      setStatus("Đã dịch tiếng Việt.");
      setRunning(null);
    }
    return true;
  }

  async function translateCurrentOutput() {
    const ok = await translateText(translationSource, false);
    if (!ok && !translationSource.trim())
      setStatus("Chưa có nội dung để dịch.");
  }

  async function exportFinal() {
    const text = finalScript.trim();
    if (!text) {
      setStatus("Chưa có final script để export.");
      return;
    }
    const result = await window.easyScriptAPI?.exportText({
      text,
      filename: "easy-english-final-script.txt",
    });
    if (result?.ok) setStatus(`Đã export: ${result.path}`);
  }

  async function copyText(text: string, label: string) {
    if (!text.trim()) {
      setStatus(`Chưa có ${label} để copy.`);
      return;
    }
    await navigator.clipboard.writeText(text);
    setStatus(`Đã copy ${label}.`);
  }

async function runPatchScript() {
    const request = patchInstruction.trim();
    const source = patchSource.trim();
    if (!source) {
      setStatus("Chưa có script để AI Patch.");
      return;
    }
    if (!request) {
      setStatus("Bạn cần nhập yêu cầu sửa trước khi chạy AI Patch.");
      return;
    }
    if (!window.easyScriptAPI) {
      setStatus("Không tìm thấy Electron API. Hãy chạy app bằng Electron.");
      return;
    }

    const patchPrompt = `You are editing an existing podcast/conversation script.

TASK: AI PATCH MODE
Only apply the user's requested changes. Do NOT run the full script workflow again.

USER REQUEST:
${request}

STRICT RULES:
- Return the full updated script, not only the changed lines.
- Do NOT rewrite the entire script unless the request explicitly asks for it.
- Preserve block structure exactly.
- Preserve timing preset metadata exactly.
- Preserve speaker labels exactly.
- Preserve the main story flow and tone.
- Keep the script voice-ready for the voice/video app.
- Do NOT add square-bracket stage directions like [laugh], [pause], [sigh].
- Prefer spoken reactions when needed: haha, hahaha, heh, oh man, wait—, seriously?, no way.
- Do NOT translate the script into Vietnamese.
- Do NOT mix Vietnamese into English lines unless the original script already does that intentionally.
- Keep CTA soft and conversational.

OUTPUT:
- Only output the updated script.
- No explanation outside the script.

{{COMMON}}

SCRIPT:
{{SOURCE_TEXT}}`;

    setRunning("patch");
    updateStepProgress("conversation", { percent: 10, label: "AI Patch đang sửa...", status: "running" });
    setStatus("Đang chạy AI Patch trên script hiện tại...");
    const progressTask = simulateStepProgress("conversation");
    const result = await window.easyScriptAPI.generateStep({
      step: "conversation",
      inputText: source,
      settings: {
        ...generationSettings("conversation"),
        customPrompts: { ...promptDrafts, conversation: patchPrompt },
      },
    });
    await progressTask;

    if (!result.ok || !result.text) {
      updateStepProgress("conversation", { percent: 100, label: "AI Patch lỗi", status: "error" });
      setStatus(`AI Patch lỗi: ${result.error || "Không có output."}`);
      setRunning(null);
      return;
    }

    const patched = sanitizeScriptForVoice(result.text || "");
    setOutputs((prev) => ({ ...prev, conversation: patched }));
    setActiveStep("conversation");
    updateStepProgress("conversation", { percent: 100, label: "AI Patch xong", status: "done" });
    setShowPatchModal(false);
    setPatchInstruction("");
    setStatus("Đã AI Patch và cập nhật Final Script. Kiểm tra lại trước khi export.");
    setRunning(null);
  }

  async function importOriginalScript() {
    const result = await window.easyScriptAPI?.importText();
    if (result?.ok && typeof result.text === "string") {
      resetGeneratedScriptState();
      setOriginalScript(result.text);
      setInputMode("competitor");
      setManualInputDraft(result.text);
      setStatus(`Đã import script gốc: ${result.path || ""}. Đã làm mới output cũ.`);
    }
  }

  async function saveProject() {
    const result = await window.easyScriptAPI?.saveProject({
      topic,
      scriptLengthMode,
      targetLength,
      scriptFormat,
      inputMode,
      originalScript,
      outputs,
      blockPresets,
    });
    if (result?.ok) setStatus(`Đã lưu project: ${result.path}`);
  }

  async function loadProject() {
    const result = await window.easyScriptAPI?.loadProject();
    if (result?.ok && result.data && typeof result.data === "object") {
      const data = result.data as Partial<{
        topic: string;
        scriptLengthMode: "short" | "long";
        targetLength: string;
        scriptFormat: string;
        inputMode: "competitor" | "idea";
        originalScript: string;
        outputs: Outputs;
        blockPresets: BlockPreset[];
      }>;
      setTopic(data.topic || "Daily English conversation");
      setScriptLengthMode(data.scriptLengthMode || "short");
      setTargetLength(data.targetLength || "12000-15000");
      setScriptFormat(data.scriptFormat || "Podcast 2 speakers - A/R");
      setInputMode(data.inputMode || "competitor");
      setOriginalScript(data.originalScript || "");
      setOutputs(data.outputs || emptyOutputs);
      setBlockPresets(data.blockPresets || defaultBlockPresets);
      setStatus(`Đã mở project: ${result.path}`);
    }
  }

  async function saveApiSettings() {
    const settingsToSave = { ...apiSettings, promptChainVersion: PROMPT_CHAIN_VERSION, customPrompts: diffCustomPrompts(promptDrafts) };
    const result = await window.easyScriptAPI?.saveSettings(settingsToSave);
    if (result?.ok) setApiSettings(settingsToSave);
    setStatus(
      result?.ok
        ? "Đã lưu API settings local. Lần sau mở app không cần nhập lại."
        : `Lỗi lưu settings: ${result?.error || "Không rõ lỗi."}`,
    );
  }

  async function testProvider() {
    setStatus("Đang test API provider...");
    const result = await window.easyScriptAPI?.testProvider(apiSettings);
    setStatus(
      result?.ok
        ? "Test API OK."
        : `Test API lỗi: ${result?.error || "Không rõ lỗi."}`,
    );
  }

  async function checkForUpdates() {
    setStatus("Đang kiểm tra cập nhật...");
    const result = await window.easyScriptAPI?.checkForUpdates?.();
    if (!result?.ok) {
      setStatus(`Kiểm tra cập nhật lỗi: ${result?.error || "Chưa cấu hình update feed."}`);
      return;
    }
    setStatus(result.message || "Chưa có bản cập nhật mới.");
  }

  function saveManualInput() {
    resetGeneratedScriptState();
    setOriginalScript(manualInputDraft.trim());
    setInputMode("idea");
    setShowManualInputModal(false);
    setStatus("Đã lưu nội dung bạn nhập.");
  }


  async function savePromptChain() {
    const customPrompts = diffCustomPrompts(promptDrafts);
    const settingsToSave = { ...apiSettings, promptChainVersion: PROMPT_CHAIN_VERSION, customPrompts };
    const result = await window.easyScriptAPI?.saveSettings(settingsToSave);
    if (result?.ok) {
      setApiSettings(settingsToSave);
      setStatus("Đã lưu Prompt Chain. Các lần generate sau sẽ dùng prompt custom này.");
      return;
    }
    setStatus(`Lỗi lưu Prompt Chain: ${result?.error || "Không rõ lỗi."}`);
  }

  function resetPromptStep(stepId: StepId) {
    setPromptDrafts((prev) => ({ ...prev, [stepId]: defaultPromptTemplates[stepId] }));
    setStatus(`Đã reset ${promptEditorSteps.find((item) => item.id === stepId)?.title || stepId} về prompt mặc định. Bấm Save Prompt Chain để lưu.`);
  }

  function resetAllPrompts() {
    setPromptDrafts(normalizePromptDrafts());
    setStatus("Đã reset toàn bộ prompt về mặc định. Bấm Save Prompt Chain để lưu.");
  }

  async function copyPromptStep(stepId: StepId) {
    await navigator.clipboard.writeText(promptDrafts[stepId] || "");
    setStatus(`Đã copy prompt ${promptEditorSteps.find((item) => item.id === stepId)?.title || stepId}.`);
  }

  function updateBlockPreset(index: number, patch: Partial<BlockPreset>) {
    setBlockPresets((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function goHome() {
    window.dispatchEvent(new CustomEvent("easy-studio:navigate-home"));
    setStatus("Home button is ready for Easy Studio shell. Khi gộp app, nút này sẽ đưa bạn về trang chủ.");
  }

  function syncScroll(from: "output" | "translation") {
    if (syncingRef.current) return;
    const source =
      from === "output" ? outputRef.current : translationRef.current;
    const target =
      from === "output" ? translationRef.current : outputRef.current;
    if (!source || !target) return;
    syncingRef.current = true;
    const maxSource = source.scrollHeight - source.clientHeight;
    const ratio = maxSource > 0 ? source.scrollTop / maxSource : 0;
    const maxTarget = target.scrollHeight - target.clientHeight;
    target.scrollTop = ratio * Math.max(0, maxTarget);
    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="home-button" onClick={goHome} title="Về trang chủ Easy Studio" aria-label="Về trang chủ Easy Studio">
          <svg className="es-home-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 10.2V20h4.6v-5.4h3.2V20h4.6v-9.8"/></svg>
        </button>
        <div className="topbar-title">
          <h1>Easy Script Studio</h1>
          <p></p>
        </div>
        <div className="top-actions">
          <button onClick={loadProject}>📂 Mở project</button>
          <button onClick={saveProject}>💾 Lưu project</button>
          <button onClick={() => setShowApiSettings((v) => !v)}>
            ⚙ API Settings
          </button>
          <button className="primary secondary-primary" onClick={exportFinal}>
            ⬇ Export .txt
          </button>
        </div>
      </header>

      {showApiSettings && (
        <section className="settings-card api-settings-card creator-api-card">
          <div className="api-copy">
            <h2>⚙ API Settings</h2>
            <p>Auto mode will choose the best available provider automatically.</p>
          </div>
          <label>
            Gemini API Key
            <input
              type="password"
              value={apiSettings.geminiApiKey || ""}
              onChange={(e) =>
                setApiSettings((prev) => ({
                  ...prev,
                  geminiApiKey: e.target.value,
                }))
              }
              placeholder={maskKey(apiSettings.geminiApiKey)}
            />
          </label>
          <label>
            OpenAI API Key
            <input
              type="password"
              value={apiSettings.openaiApiKey || ""}
              onChange={(e) =>
                setApiSettings((prev) => ({
                  ...prev,
                  openaiApiKey: e.target.value,
                }))
              }
              placeholder={maskKey(apiSettings.openaiApiKey)}
            />
          </label>
          <div className="settings-actions">
            <button onClick={testProvider}>✓ Test Connection</button>
            <button className="primary" onClick={saveApiSettings}>
              💾 Save API
            </button>
          </div>
          <details className="advanced-settings" open={advancedMode}>
            <summary onClick={(event) => { event.preventDefault(); setAdvancedMode((value) => !value); }}>Advanced Settings</summary>
            <div className="advanced-grid">
              <label>
                AI Engine chính
                <select
                  value={apiSettings.provider}
                  onChange={(e) =>
                    setApiSettings((prev) => ({
                      ...prev,
                      provider: e.target.value as AiProvider,
                    }))
                  }
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                </select>
              </label>
              <label>
                Gemini model ưu tiên
                <input
                  value={apiSettings.geminiModel || ""}
                  onChange={(e) =>
                    setApiSettings((prev) => ({
                      ...prev,
                      geminiModel: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                OpenAI model ưu tiên
                <input
                  value={apiSettings.openaiModel || ""}
                  onChange={(e) =>
                    setApiSettings((prev) => ({
                      ...prev,
                      openaiModel: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="prompt-chain-entry">
              <div>
                <strong>Prompt Chain</strong>
                <p>Xem, copy hoặc sửa prompt Step 1–5. Chỉ dành cho Advanced Mode.</p>
              </div>
              <button className="btn-secondary" onClick={() => setShowPromptEditor(true)}>🧩 View / Edit Prompt</button>
            </div>
          </details>
        </section>
      )}

      <section className="settings-card compact-settings creator-quick-card">
        <div className="quick-copy">
          <span className="eyebrow">Creator Mode</span>
          <h2>Tạo script mới</h2>
          <p></p>
        </div>
        <label>
          Chủ đề
          <input value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <label>
          Độ dài Script
          <select value={scriptLengthMode} onChange={(e) => setScriptLengthMode(e.target.value as "short" | "long")}>
            <option value="short">Script ngắn</option>
            <option value="long">Script dài / Dàn ý lớn</option>
          </select>
        </label>
        <label>
          Độ dài mục tiêu
          <input
            value={targetLength}
            onChange={(e) => setTargetLength(e.target.value)}
            placeholder={scriptLengthMode === "long" ? "30.000–40.000 ký tự" : "12.000–15.000 ký tự"}
          />
        </label>
        <label>
          Giọng / Định dạng
          <select value={scriptFormat} onChange={(e) => setScriptFormat(e.target.value)}>
            <option value="Podcast 2 speakers - A/R">Podcast 2 người nói - A/R</option>
            <option value="Single narrator - NARRATOR">Một người dẫn - NARRATOR</option>
            <option value="YouTube story - VOICEOVER / SCENE">Kể chuyện YouTube - VOICEOVER / SCENE</option>
            <option value="Educational video - HOOK / BODY / CTA">Video giáo dục - HOOK / BODY / CTA</option>
            <option value="Custom format">Định dạng tùy chỉnh</option>
          </select>
        </label>
        <label>
          Chất lượng
          <select value={qualityMode || "fast"} onChange={(e) => setQualityMode(e.target.value as ApiSettings["qualityMode"])}>
            <option value="fast">Nhanh</option>
            <option value="balanced">Cân bằng</option>
            <option value="highQuality">Chất lượng cao</option>
          </select>
        </label>
        <button className="primary quick-main-button" disabled={!!running} onClick={runAll}>
          {running ? simpleProgressText : "✨ Tạo Script"}
        </button>
      </section>

      <section className="preset-card script-source-card compact-source-row">
        <div className="source-title">
          <strong>Script mẫu</strong>
          <span>{countChars(originalScript)} ký tự</span>
        </div>
        <div className="source-button-group single-line-source-actions">
          <button
            onClick={() => {
              setInputMode("competitor");
              importOriginalScript();
            }}
          >
            📄 Script gốc
          </button>
          <button
            onClick={() => {
              setInputMode("idea");
              setManualInputDraft(originalScript);
              setShowManualInputModal(true);
            }}
          >
            ✍ Nhập nội dung
          </button>
          <button onClick={() => setShowOriginalScriptModal(true)} disabled={!originalScript.trim()}>
            👁 Xem nội dung gốc
          </button>
        </div>
      </section>

      <section className="workspace script-workspace">
        <aside className="left-panel">
          <div className="panel-head">
            <h2>Workflow</h2>
            <p></p>
          </div>
          <div className="step-list">
            {steps.map((step, index) => {
              const locked = !canRunStep(step.id);
              const chars = getStepCharCount(step.id, outputs);
              return (
                <div
                  key={step.id}
                  className={`step-card ${activeStep === step.id ? "active" : ""} ${locked && !running ? "locked" : ""}`}
                  onClick={() => setActiveStep(step.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setActiveStep(step.id);
                  }}
                >
                  <div className="step-content">
                    <div className="step-title-row">
                      <strong>{step.title}</strong>
                      <strong className="step-char-count">
                        {chars ? `${countChars(outputs[step.id])} ký tự` : "0 ký tự"}
                      </strong>
                    </div>
                    <small>{step.short}</small>
                  </div>
                  <button
                    className="step-run-button"
                    disabled={!canRunStep(step.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      runStep(step.id);
                    }}
                    title={step.id !== "conversation" && index > 0 && !outputs[steps[index - 1].id]?.trim() ? "Cần hoàn tất bước trước." : undefined}
                  >
                    {stepRunLabel(step.id)}
                  </button>
                  <div className="step-progress-row">
                    <div className="step-progress-track">
                      <div
                        className={`step-progress-fill ${stepProgress[step.id].status}`}
                        style={{ width: `${stepProgress[step.id].percent}%` }}
                      />
                    </div>
                    <span>{stepProgress[step.id].label}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="status">{status}</div>
        </aside>

        <aside className="right-panel">
          <div className="panel-head">
            <div>
              <h2>Script Preview</h2>
              <p>{steps.find((s) => s.id === activeStep)?.title}</p>
            </div>
            <span>{countChars(activeOutput)} ký tự</span>
          </div>
          <textarea
            ref={outputRef}
            value={activeOutput}
            onScroll={() => syncScroll("output")}
            onChange={(e) =>
              setOutputs((prev) => ({ ...prev, [activeStep]: e.target.value }))
            }
            placeholder="Script của step đang chọn sẽ hiện ở đây..."
          />
          <details>
            <summary>Advanced: input đang dùng cho bước này</summary>
            <pre>{activeInput.slice(0, 4000)}</pre>
          </details>
        </aside>

        <aside className="translation-panel">
          <div className="panel-head">
            <div>
              <h2>Bilingual Review</h2>
              <p></p>
            </div>
            <div className="panel-actions">
              <button className="btn-secondary btn-translate" onClick={translateCurrentOutput} disabled={!!running}>
                {running === "translateVi" ? "⏳ Đang dịch..." : "🌐 Dịch lại"}
              </button>
              <button
                className="btn-secondary btn-copy"
                onClick={() =>
                  copyText(vietnameseScript, "bản dịch tiếng Việt")
                }
              >
                📋 Copy
              </button>
              <span>{countChars(vietnameseScript)} ký tự</span>
            </div>
          </div>
          <div className="translation-progress-row">
            <div className="step-progress-track">
              <div
                className={`step-progress-fill ${stepProgress.translateVi.status}`}
                style={{ width: `${stepProgress.translateVi.percent}%` }}
              />
            </div>
            <span>{stepProgress.translateVi.label}</span>
          </div>
          <textarea
            ref={translationRef}
            value={vietnameseScript}
            onScroll={() => syncScroll("translation")}
            onChange={(e) =>
              setOutputs((prev) => ({ ...prev, translateVi: e.target.value }))
            }
            placeholder="Bản dịch mẫu sẽ hiển thị tại đây..."
          />
        </aside>

        <aside className="final-panel">
          <div className="panel-head">
            <div>
              <h2>Final Script</h2>
              <p></p>
            </div>
            <div className="panel-actions">
              <button
                className="btn-secondary patch-button"
                onClick={() => setShowPatchModal(true)}
                disabled={!finalScript.trim() || !!running}
              >
                ✨ AI Patch
              </button>
              <button
                className="primary copy-all-button"
                onClick={() => copyText(finalScript, "toàn bộ final script")}
              >
                📋 Copy all script
              </button>
              <span>{countChars(finalScript)} ký tự</span>
            </div>
          </div>
          <textarea
            value={finalScript}
            readOnly
            placeholder="Final script sẽ sẵn sàng để export sau khi bạn review xong."
          />
        </aside>
      </section>


      {showPatchModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card patch-modal">
            <div className="panel-head">
              <div>
                <h2>✨ AI Patch</h2>
                <p>Sửa vài điểm nhỏ trên script hiện tại, không chạy lại toàn bộ workflow.</p>
              </div>
              <div className="panel-actions">
                <button className="btn-ghost" onClick={() => setShowPatchModal(false)}>Hủy</button>
                <button
                  className="primary patch-run-button"
                  onClick={runPatchScript}
                  disabled={!patchInstruction.trim() || !patchSource.trim() || !!running}
                >
                  {running === "patch" ? "⏳ Đang sửa..." : "✨ Apply Patch"}
                </button>
              </div>
            </div>
            <div className="patch-grid">
              <div className="patch-form">
                <label>
                  Sửa phần nào?
                  <select value={patchScope} onChange={(event) => setPatchScope(event.target.value as "final" | "active")}>
                    <option value="final">Final Script</option>
                    <option value="active">Step đang xem</option>
                  </select>
                </label>
                <label>
                  Yêu cầu sửa
                  <textarea
                    value={patchInstruction}
                    onChange={(event) => setPatchInstruction(event.target.value)}
                    placeholder={'Ví dụ:\n- Làm CTA mềm hơn, bớt YouTube hơn.\n- Thêm vài haha/hahaha tự nhiên ở đoạn awkward.\n- Giảm teaching tone ở BODY_PART_5.\n- Chia BODY dài thành BODY_PART_1, BODY_PART_2.'}
                  />
                </label>
                <p className="prompt-help">
                  AI Patch sẽ trả về bản script đầy đủ đã sửa, giữ nguyên metadata/block/speaker label để đưa sang app voice.
                </p>
              </div>
              <div className="patch-preview">
                <div className="panel-head">
                  <div>
                    <h2>Preview nguồn sửa</h2>
                    <p>{patchScope === "final" ? "Final Script" : steps.find((s) => s.id === activeStep)?.title}</p>
                  </div>
                  <span>{countChars(patchSource)} ký tự</span>
                </div>
                <textarea value={patchSource} readOnly />
              </div>
            </div>
          </section>
        </div>
      )}

      {showPromptEditor && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card prompt-editor-modal">
            <div className="panel-head">
              <div>
                <h2>🧩 Prompt Chain Editor</h2>
                <p>Sửa prompt theo từng step. Dùng placeholders: {"{{SOURCE_TEXT}}"}, {"{{COMMON}}"}, {"{{TARGET_LENGTH}}"}.</p>
              </div>
              <div className="panel-actions">
                <button className="btn-subtle" onClick={() => setShowPromptEditor(false)}>✕ Đóng</button>
                <button className="btn-danger-soft" onClick={resetAllPrompts}>↺ Reset all</button>
                <button className="primary prompt-save-button" onClick={savePromptChain}>💾 Save Prompt Chain</button>
              </div>
            </div>
            <div className="prompt-editor-layout">
              <div className="prompt-step-tabs">
                {promptEditorSteps.map((step) => (
                  <button
                    key={step.id}
                    className={promptEditorStep === step.id ? "active" : ""}
                    onClick={() => setPromptEditorStep(step.id)}
                  >
                    <strong>{step.title}</strong>
                    <span>{step.desc}</span>
                  </button>
                ))}
              </div>
              <div className="prompt-editor-main">
                <div className="prompt-editor-toolbar">
                  <div>
                    <strong>{promptEditorSteps.find((step) => step.id === promptEditorStep)?.title}</strong>
                    <p>{promptDrafts[promptEditorStep] === defaultPromptTemplates[promptEditorStep] ? "Đang dùng prompt mặc định" : "Đang dùng prompt custom"}</p>
                  </div>
                  <div className="panel-actions">
                    <button className="btn-secondary" onClick={() => copyPromptStep(promptEditorStep)}>📋 Copy</button>
                    <button className="btn-danger-soft" onClick={() => resetPromptStep(promptEditorStep)}>↺ Reset step</button>
                  </div>
                </div>
                <textarea
                  value={promptDrafts[promptEditorStep]}
                  onChange={(event) =>
                    setPromptDrafts((prev) => ({ ...prev, [promptEditorStep]: event.target.value }))
                  }
                  spellCheck={false}
                />
                <p className="prompt-help">
                  Lưu ý: nếu bạn xóa {"{{SOURCE_TEXT}}"}, AI sẽ không nhận được nội dung đầu vào. Nếu xóa {"{{COMMON}}"}, prompt sẽ mất rule chung về format/mode/block.
                </p>
              </div>
            </div>
          </section>
        </div>
      )}

      {showManualInputModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card original-script-modal">
            <div className="panel-head">
              <div>
                <h2>✍ Nhập nội dung bạn muốn làm</h2>
                <p>{countChars(manualInputDraft)} ký tự</p>
              </div>
              <div className="panel-actions">
                <button onClick={() => setShowManualInputModal(false)}>Hủy</button>
                <button
                  className="primary modal-save-button"
                  onClick={saveManualInput}
                  disabled={!manualInputDraft.trim()}
                >
                  💾 Save
                </button>
              </div>
            </div>
            <textarea
              value={manualInputDraft}
              onChange={(e) => setManualInputDraft(e.target.value)}
              placeholder="Ví dụ: Viết script 15k ký tự về chủ đề ABC, tone tự nhiên, có mini story, CTA mềm..."
            />
          </section>
        </div>
      )}

      {showOriginalScriptModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal-card original-script-modal">
            <div className="panel-head">
              <div>
                <h2>Nội dung gốc / ý tưởng đã nhập</h2>
                <p>{countChars(originalScript)} ký tự</p>
              </div>
              <button onClick={() => setShowOriginalScriptModal(false)}>Đóng</button>
            </div>
            <textarea
              value={originalScript}
              readOnly
              placeholder="Chưa có nội dung. Hãy import mẫu đối thủ hoặc nhập ý tưởng của bạn trước."
            />
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
