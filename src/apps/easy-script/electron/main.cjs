const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const packageJson = require('../package.json');

const isDev = !app.isPackaged;

// Reduce Chromium/Electron GPU cache permission warning spam on Windows dev machines.
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-gpu-program-cache');

function createWindow() {
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon', 'easy-script-studio-logo.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(false);
  if (isDev) win.loadURL('http://127.0.0.1:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

function settingsPath() {
  return path.join(app.getPath('userData'), 'easy-script-settings.json');
}

const PROMPT_STEP_IDS = ['structure', 'expand', 'natural', 'standardize', 'conversation', 'translateVi'];

function sanitizeCustomPrompts(value = {}) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  for (const stepId of PROMPT_STEP_IDS) {
    if (typeof value[stepId] === 'string' && value[stepId].trim()) out[stepId] = value[stepId];
  }
  return out;
}

function sanitizeSettings(settings = {}) {
  return {
    provider: settings.provider === 'openai' ? 'openai' : 'gemini',
    geminiApiKey: typeof settings.geminiApiKey === 'string' ? settings.geminiApiKey : '',
    geminiModel: typeof settings.geminiModel === 'string' && settings.geminiModel.trim() ? settings.geminiModel : 'gemini-2.5-flash-lite',
    openaiApiKey: typeof settings.openaiApiKey === 'string' ? settings.openaiApiKey : '',
    openaiModel: typeof settings.openaiModel === 'string' && settings.openaiModel.trim() ? settings.openaiModel : 'gpt-4.1-mini',
    qualityMode: ['fast', 'balanced', 'highQuality'].includes(settings.qualityMode) ? settings.qualityMode : 'fast',
    updateManifestUrl: typeof settings.updateManifestUrl === 'string' ? settings.updateManifestUrl : '',
    customPrompts: sanitizeCustomPrompts(settings.customPrompts)
  };
}

function formatNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(fallback);
}

function blockPresetText(blockPresets = []) {
  const fallback = [
    { tag: '#HOOK', pauseSeconds: 6, aSpeed: 0.96, aPitch: 0.1, aPause: 0.22, rSpeed: 1.0, rPitch: 0.1, rPause: 0.18 },
    { tag: '#CTA_INTRO', pauseSeconds: 3, aSpeed: 0.96, aPitch: 0.08, aPause: 0.2, rSpeed: 1.0, rPitch: 0.1, rPause: 0.18 },
    { tag: '#INTRO', pauseSeconds: 4, aSpeed: 0.98, aPitch: 0.08, aPause: 0.2, rSpeed: 1.0, rPitch: 0.1, rPause: 0.18 },
    { tag: '#BODY', pauseSeconds: 3, aSpeed: 1.0, aPitch: 0.05, aPause: 0.18, rSpeed: 1.02, rPitch: 0.08, rPause: 0.18 },
    { tag: '#CTA_MID', pauseSeconds: 3, aSpeed: 0.96, aPitch: 0.08, aPause: 0.2, rSpeed: 1.0, rPitch: 0.1, rPause: 0.18 },
    { tag: '#CTA_END', pauseSeconds: 5, aSpeed: 0.96, aPitch: 0.08, aPause: 0.22, rSpeed: 1.0, rPitch: 0.1, rPause: 0.2 }
  ];
  const list = Array.isArray(blockPresets) && blockPresets.length ? blockPresets : fallback;
  return list.map((item, index) => {
    const fallbackItem = fallback[index] || fallback[2];
    const tag = item.tag || fallbackItem.tag;
    const pauseSeconds = formatNumber(item.pauseSeconds, fallbackItem.pauseSeconds);
    const aSpeed = formatNumber(item.aSpeed, fallbackItem.aSpeed);
    const aPitch = formatNumber(item.aPitch, fallbackItem.aPitch);
    const aPause = formatNumber(item.aPause, fallbackItem.aPause);
    const rSpeed = formatNumber(item.rSpeed, fallbackItem.rSpeed);
    const rPitch = formatNumber(item.rPitch, fallbackItem.rPitch);
    const rPause = formatNumber(item.rPause, fallbackItem.rPause);
    return `${tag} - ${pauseSeconds}s - A ${aSpeed},${aPitch},${aPause}; R ${rSpeed},${rPitch},${rPause}`;
  }).join('\n');
}

function presetLineMap(blockPresets = []) {
  const lines = blockPresetText(blockPresets).split('\n').filter(Boolean);
  return Object.fromEntries(lines.map((line) => [line.split(' - ')[0], line]));
}

function normalizeScriptPresetLines(text = '', blockPresets = []) {
  const lineMap = presetLineMap(blockPresets);
  return String(text)
    .replace(/\*\*Speaker\s*A\s*\([^)]*\):\*\*/gi, 'A:')
    .replace(/\*\*Speaker\s*B\s*\([^)]*\):\*\*/gi, 'R:')
    .replace(/^Speaker\s*A\s*\([^)]*\):/gim, 'A:')
    .replace(/^Speaker\s*B\s*\([^)]*\):/gim, 'R:')
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^(#HOOK|#CTA_INTRO|#INTRO|#BODY|#CTA_MID|#CTA_END|#CTA)(?:\b.*)?$/i);
      if (!match) return line;
      let tag = match[1].toUpperCase();
      if (tag === '#CTA') tag = '#CTA_END';
      return lineMap[tag] || line;
    })
    .join('\n');
}

const CTA_TEMPLATE_SETS = [
  {
    id: 'CTA_SET_01_SOFT_CURIOSITY',
    style: 'Mở đầu bằng tò mò nhẹ, không bán hàng.',
    intro: [
      'A: You know what? Before we get into it, try to listen like this is a real conversation, not a lesson.',
      'R: Yeah. And if this kind of calm English practice feels useful, you can stay with us for the full episode.'
    ],
    mid: [
      'R: Quick pause. Are you still following the story?',
      'A: If you are, nice. Save this one and come back later, because the phrases will feel easier the second time.'
    ],
    end: [
      'A: If this conversation made English feel a little easier, that is exactly the point of this channel.',
      'R: So stay around for the next one. We will keep it simple, natural, and useful.'
    ]
  },
  {
    id: 'CTA_SET_02_RETENTION',
    style: 'Giữ chân người xem bằng lời nhắc luyện tập tự nhiên.',
    intro: [
      'R: One little suggestion before we start.',
      'A: Hmm?',
      'R: Do not try to understand every single word. Just follow the feeling of the conversation first.'
    ],
    mid: [
      'A: By the way, if one line sounded useful, repeat just that one line out loud.',
      'R: Just one line. That is how speaking starts to feel more natural.'
    ],
    end: [
      'R: Thanks for practicing with us today.',
      'A: And if you want another easy conversation like this, you know where to find us.'
    ]
  },
  {
    id: 'CTA_SET_03_HIDDEN_SUBSCRIBE',
    style: 'CTA ẩn, gần như lời trò chuyện thân mật.',
    intro: [
      'A: I like lessons that do not feel like lessons.',
      'R: Same. More like two friends talking slowly and clearly.',
      'A: Exactly. That is what we are doing here.'
    ],
    mid: [
      'R: If this pace works for you, keep this episode somewhere easy to find.',
      'A: Yeah, because practicing again later is where the real improvement happens.'
    ],
    end: [
      'A: Next time, we will make the conversation a little different but still easy to follow.',
      'R: So come back and practice with us again.'
    ]
  },
  {
    id: 'CTA_SET_04_COMMUNITY',
    style: 'CTA hướng cộng đồng, mềm và ít quảng cáo.',
    intro: [
      'R: As you listen, think about one phrase you would actually use in real life.',
      'A: Yeah, not ten phrases. Just one useful line is already a win.'
    ],
    mid: [
      'A: If you have a phrase you want us to explain in another episode, keep it in mind.',
      'R: Comments like that help us choose better conversations for you.'
    ],
    end: [
      'R: Tell us which line felt most useful today.',
      'A: And we will build more simple conversations around what you need.'
    ]
  }
];

function ctaTemplateText() {
  return CTA_TEMPLATE_SETS.map((set) => {
    return `${set.id}\n#CTA_INTRO\n${set.intro.join('\n')}\n#CTA_MID\n${set.mid.join('\n')}\n#CTA_END\n${set.end.join('\n')}`;
  }).join('\n\n');
}

function interpolatePromptTemplate(template = '', variables = {}) {
  return String(template)
    .replace(/\{\{SOURCE_TEXT\}\}/g, variables.sourceText || '')
    .replace(/\{\{COMMON\}\}/g, variables.common || '')
    .replace(/\{\{TARGET_LENGTH\}\}/g, variables.target || '')
    .replace(/\{\{LEVEL\}\}/g, variables.level || '')
    .replace(/\{\{TOPIC\}\}/g, variables.topic || '')
    .replace(/\{\{SCRIPT_FORMAT\}\}/g, variables.scriptFormat || '')
    .replace(/\{\{SCRIPT_LENGTH_MODE\}\}/g, variables.scriptLengthMode || '')
    .replace(/\{\{INPUT_MODE\}\}/g, variables.inputMode || '')
    .replace(/\{\{BLOCK_PRESETS\}\}/g, variables.presetMap || '');
}

function buildUserPrompt(step, sourceText, settings) {
  const target = settings?.targetLength || '12000-15000';
  const level = settings?.level || 'A2-B1';
  const topic = settings?.topic || 'Daily English conversation';
  const scriptLengthMode = settings?.scriptLengthMode || 'short';
  const inputMode = settings?.inputMode || 'competitor';
  const scriptFormat = settings?.scriptFormat || 'Podcast 2 speakers - A/R';
  const isLongMode = scriptLengthMode === 'long';
  const isTwoSpeakerMode = /podcast|A\/R|2 speakers/i.test(scriptFormat);
  const formatRule = isTwoSpeakerMode
    ? `- Format hiện tại: Podcast 2 speakers. Chỉ dùng label thoại A:, R:, BOTH:. A = Adam, R = Raychel.`
    : `- Format hiện tại: ${scriptFormat}. Không bắt buộc A/R. Hãy dùng label phù hợp với format này, ví dụ NARRATOR:, VOICEOVER:, SCENE:, ON_SCREEN_TEXT: nếu hợp lý.`;
  const longModeRule = isLongMode
    ? `LONG SCRIPT MODE:
- Trước hết phải tạo/giữ Master Outline rõ ràng.
- Toàn script chỉ có 1 HOOK, 1 INTRO, 1 ENDING/CTA_END.
- Không lặp HOOK/INTRO/CTA trong từng chương.
- Các chương dài phải là BODY_PART_1, BODY_PART_2, BODY_PART_3...
- Mỗi BODY_PART phải nối tiếp ý trước, không reset lại từ đầu.
- Có thể đặt CTA_MID ở giữa toàn script, không lặp nhiều lần.`
    : `SHORT SCRIPT MODE:
- Dùng cấu trúc gọn: HOOK, INTRO, BODY, CTA_MID nếu cần, ENDING/CTA_END.`;
  const inputRule = inputMode === 'idea'
    ? `INPUT TYPE: Ý tưởng của user. Hãy tự dựng cấu trúc mới từ ý tưởng, không cần bám theo cấu trúc đối thủ.`
    : `INPUT TYPE: Script mẫu/đối thủ. Chỉ lấy ý tưởng, flow, nhịp nội dung; không copy nguyên văn câu chữ.`;
  const presetMap = blockPresetText(settings?.blockPresets);
  const common = `
================ SCRIPT FORMAT / VOICE APP MAPPING ================
${formatRule}
- Mỗi dòng thoại = 1 câu ngắn, ưu tiên 6–14 từ nếu là hội thoại.
- Nếu dùng BOTH:, chỉ dùng khi hai người phản ứng cùng lúc, không lạm dụng.
- Mỗi block nên bắt đầu bằng metadata để app voice dễ map.
- Với Podcast A/R, dùng preset dạng:
  #TÊN_BLOCK - pause - A speed,pitch,pause; R speed,pitch,pause
- Với mode không phải A/R, dùng block rõ ràng như #HOOK, #INTRO, #BODY_PART_1, #VOICEOVER, #SCENE, #CTA_END tùy format.
- Dùng các dòng preset mặc định này khi cần block A/R tương ứng:
${presetMap}
- Không dịch hoặc giải thích bằng tiếng Việt trong output script tiếng Anh.

================ REACTION FORMAT RULES ================
- Không dùng thẻ vuông như [laugh], [laughs], [pause], [sigh], [music].
- Reaction phải voice-friendly, ví dụ: haha, hahaha, heh, oh man, wait—, seriously?, no way, (laughs), (chuckles).
- Không spam reaction; chỉ thêm khi tự nhiên theo ngữ cảnh.

================ SERIES CONTEXT ================
- Series/topic: ${topic}.
- Target length: ${target}.
- Script format: ${scriptFormat}.
- Mode: ${scriptLengthMode}.
- ${inputRule}
- ${longModeRule}
- Nếu có logic video trước/sau trong script gốc thì giữ tự nhiên.
- Gần cuối có thể gợi mở video tiếp theo, nhưng không nói kiểu quảng cáo.

================ PHONG CÁCH CHÍNH ================
- Hai người bạn nói chuyện thật, không phải bài giảng.
- Spoken English, casual rhythm, câu hơi imperfect tự nhiên.
- Có reaction nhỏ: oh, wait, really, hmm, exactly, haha.
- Có ngắt lời nhẹ, tự sửa câu nhẹ, phản ứng vui nhẹ nếu hợp lý.
- Không biến thành văn viết, bài blog, bài luận hoặc script dạy học khô cứng.
`;

  const prompts = {
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
${common}
SCRIPT GỐC / Ý TƯỞNG:
${sourceText}`,

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
- Ít nhất ${target} ký tự nếu nội dung cho phép.
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
${common}
SCRIPT:
${sourceText}`,

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
${common}
SCRIPT:
${sourceText}`,

    standardize: `Make this conversation sound like real bilingual friends talking naturally.

IMPORTANT:
- Fix unnatural Vietnamese-English mixing.
- Keep one main language per sentence.
- Remove any word-by-word translation feeling.
- Remove direct translation structure.
- Remove remaining teaching tone.
- Remove podcast-host energy.
- Add tiny playful reactions or small disagreements when natural.
- Make sentences slightly imperfect.
- Let the conversation feel casual and spontaneous.

BILINGUAL RULES:
- Do NOT mirror Vietnamese and English sentence structure.
- Do NOT translate phrases too literally.
- Do NOT force balanced bilingual usage.
- Real bilingual speakers naturally:
  - switch rhythm
  - simplify wording
  - keep some phrases in one language
  - avoid textbook-perfect phrasing
- Some ideas may sound shorter or more casual in one language.

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

MAKE IT FEEL:
- casual
- slightly messy
- warm
- spontaneous
- human
- lightly imperfect

KEEP:
- Block structure.
- Timing preset metadata.
- Speaker labels.
- Core meaning.

OUTPUT:
- Only output the script.
- No explanation outside the script.
${common}
SCRIPT:
${sourceText}`,

    conversation: `Make the conversation sound like real human speech, but do NOT simply add "uh", "hmm", or "haha".

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
${common}
SCRIPT:
${sourceText}`,

    translateVi: `Hãy dịch script tiếng Anh dưới đây sang tiếng Việt để người sản xuất dễ kiểm tra nội dung.

YÊU CẦU:
- Giữ nguyên 100% các dòng metadata preset dạng: #HOOK - 6s - A 0.96,0.1,0.22; R 1.0,0.1,0.18. Tuyệt đối không dịch các dòng này.
- Giữ nguyên label thoại A:, R:, BOTH: hoặc label format khác nếu có.
- Chỉ dịch nội dung sau speaker label sang tiếng Việt.
- Dịch tự nhiên, dễ hiểu, không dịch từng chữ máy móc.
- Không thêm giải thích ngoài bản dịch.

SCRIPT CẦN DỊCH:
${sourceText}`
  };
  const customPrompt = settings?.customPrompts?.[step];
  if (typeof customPrompt === 'string' && customPrompt.trim()) {
    return interpolatePromptTemplate(customPrompt, {
      sourceText,
      common,
      target,
      level,
      topic,
      scriptFormat,
      scriptLengthMode,
      inputMode,
      presetMap
    });
  }

  return prompts[step] || prompts.structure;
}

function parseGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n').trim();
}

function parseOpenAiText(data) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  const chunks = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && content?.text) chunks.push(content.text);
      if (content?.text) chunks.push(content.text);
    }
  }
  if (chunks.length) return chunks.join('\n').trim();
  return data?.choices?.[0]?.message?.content?.trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const providerCooldownUntil = new Map();

function cooldownKey(provider, model = 'provider') {
  return `${provider}:${model}`;
}

function isCoolingDown(provider, model) {
  const modelUntil = providerCooldownUntil.get(cooldownKey(provider, model)) || 0;
  const providerUntil = providerCooldownUntil.get(cooldownKey(provider)) || 0;
  return Math.max(modelUntil, providerUntil) > Date.now();
}

function markCooldown(provider, model, error) {
  if (!isTransientAiError(error)) return;
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  const baseMs = status === 429 || message.includes('quota') || message.includes('rate limit')
    ? 90_000
    : status >= 500 || message.includes('high demand') || message.includes('unavailable')
      ? 45_000
      : 25_000;
  const retryAfterMs = Number(error?.retryAfterMs || 0);
  const until = Date.now() + Math.max(baseMs, retryAfterMs);
  providerCooldownUntil.set(cooldownKey(provider, model), until);
}

function clearExpiredCooldowns() {
  const now = Date.now();
  for (const [key, until] of providerCooldownUntil.entries()) {
    if (until <= now) providerCooldownUntil.delete(key);
  }
}

function parseRetryAfterMs(response) {
  const retryAfter = response?.headers?.get?.('retry-after');
  if (!retryAfter) return 0;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return 0;
}

function makeProviderError(provider, model, response, data) {
  const status = response?.status;
  const message =
    data?.error?.message ||
    data?.error?.details?.[0]?.reason ||
    `${provider} HTTP ${status || 'UNKNOWN'}`;
  const error = new Error(`[${provider}:${model}] ${message}`);
  error.provider = provider;
  error.model = model;
  error.status = status;
  error.retryAfterMs = parseRetryAfterMs(response);
  error.isTransient = isTransientAiError(error);
  return error;
}

function isTransientAiError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    message.includes('high demand') ||
    message.includes('currently experiencing high demand') ||
    message.includes('spikes in demand') ||
    message.includes('try again later') ||
    message.includes('temporarily unavailable') ||
    message.includes('temporary') ||
    message.includes('overloaded') ||
    message.includes('server overloaded') ||
    message.includes('capacity') ||
    message.includes('busy') ||
    message.includes('unavailable') ||
    message.includes('resource exhausted') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota') ||
    message.includes('deadline') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('fetch failed') ||
    message.includes('socket hang up') ||
    message.includes('econnreset') ||
    message.includes('server error')
  );
}

function isModelUnavailableError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 404 ||
    message.includes('is not found for api version') ||
    message.includes('not supported for generatecontent') ||
    message.includes('model is not found') ||
    message.includes('models/') && message.includes('not found')
  );
}

function uniqueList(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function geminiFallbackModels(primaryModel, qualityMode = 'fast') {
  // Gemini 1.5 / 2.0 names are no longer reliable on v1beta for many API keys.
  // Use current Gemini API model names: 2.5 Flash-Lite for speed, 2.5 Flash for quality,
  // and gemini-flash-latest as a rolling fallback alias.
  const fastList = [
    primaryModel,
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-2.5-flash'
  ];

  const balancedList = [
    primaryModel,
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-flash-latest'
  ];

  const highQualityList = [
    primaryModel,
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest'
  ];

  if (qualityMode === 'highQuality') return uniqueList(highQualityList);
  if (qualityMode === 'balanced') return uniqueList(balancedList);
  return uniqueList(fastList);
}

function openAiFallbackModels(primaryModel) {
  return uniqueList([
    primaryModel,
    'gpt-4.1-mini',
    'gpt-4o-mini',
    'gpt-4o'
  ]);
}

async function withRetry(label, fn, options = {}) {
  const maxAttempts = options.maxAttempts || 2;
  const baseDelayMs = options.baseDelayMs || 1800;
  const maxDelayMs = options.maxDelayMs || 4500;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) console.log(`[AI Retry] ${label} attempt ${attempt}/${maxAttempts}`);
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const transient = isTransientAiError(error);
      if (!transient || attempt >= maxAttempts) break;
      const retryAfterMs = Number(error?.retryAfterMs || 0);
      const jitterMs = Math.floor(Math.random() * 700);
      // Do not let one overloaded model block the creator workflow for 10-20 seconds.
      // Try briefly, then fallback to the next model/provider.
      const requestedDelay = Math.max(Math.min(retryAfterMs, 2500), baseDelayMs * attempt);
      const delayMs = Math.min(requestedDelay + jitterMs, maxDelayMs);
      console.warn(`[AI Retry] ${label} failed: ${error.message}. Quick retry after ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

async function generateWithGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, topP: 0.95, maxOutputTokens: 24576 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw makeProviderError('Gemini', model, response, data);
  const text = parseGeminiText(data);
  if (!text) throw new Error(`[Gemini:${model}] Gemini không trả về text.`);
  return text;
}

async function generateWithOpenAi(apiKey, model, prompt) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: prompt, temperature: 0.75, max_output_tokens: 24576 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw makeProviderError('OpenAI', model, response, data);
  const text = parseOpenAiText(data);
  if (!text) throw new Error(`[OpenAI:${model}] OpenAI không trả về text.`);
  return text;
}

async function tryGeminiModels(settings, prompt) {
  const key = settings.geminiApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Thiếu Gemini API key.');
  let lastError;
  clearExpiredCooldowns();
  for (const model of geminiFallbackModels(settings.geminiModel, settings.qualityMode)) {
    if (isCoolingDown('gemini', model)) {
      console.warn(`[AI Cooldown] Skip Gemini model still cooling down: ${model}`);
      continue;
    }
    try {
      console.log(`[AI Provider] Gemini model: ${model}`);
      const text = await withRetry(`Gemini ${model}`, () => generateWithGemini(key, model, prompt), { maxAttempts: 2, baseDelayMs: 1800 });
      providerCooldownUntil.delete(cooldownKey('gemini', model));
      return text;
    } catch (error) {
      lastError = error;
      if (isModelUnavailableError(error)) {
        console.warn(`[AI Fallback] Gemini model ${model} is unavailable on this API version/key. Trying next model.`);
        continue;
      }
      markCooldown('gemini', model, error);
      if (!isTransientAiError(error)) break;
      console.warn(`[AI Fallback] Gemini model ${model} failed: ${error.message}`);
    }
  }
  throw lastError;
}

async function tryOpenAiModels(settings, prompt) {
  const key = settings.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Thiếu OpenAI API key.');
  let lastError;
  clearExpiredCooldowns();
  for (const model of openAiFallbackModels(settings.openaiModel)) {
    if (isCoolingDown('openai', model)) {
      console.warn(`[AI Cooldown] Skip OpenAI model still cooling down: ${model}`);
      continue;
    }
    try {
      console.log(`[AI Provider] OpenAI model: ${model}`);
      const text = await withRetry(`OpenAI ${model}`, () => generateWithOpenAi(key, model, prompt), { maxAttempts: 2, baseDelayMs: 1800 });
      providerCooldownUntil.delete(cooldownKey('openai', model));
      return text;
    } catch (error) {
      lastError = error;
      markCooldown('openai', model, error);
      if (!isTransientAiError(error)) break;
      console.warn(`[AI Fallback] OpenAI model ${model} failed: ${error.message}`);
    }
  }
  throw lastError;
}

async function runProvider(apiSettings, prompt) {
  const settings = sanitizeSettings(apiSettings || {});
  const providers = settings.provider === 'openai' ? ['openai', 'gemini'] : ['gemini', 'openai'];
  const errors = [];
  for (const provider of providers) {
    try {
      if (provider === 'openai') {
        if (!(settings.openaiApiKey || process.env.OPENAI_API_KEY)) continue;
        return await tryOpenAiModels(settings, prompt);
      }
      if (!(settings.geminiApiKey || process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY)) continue;
      return await tryGeminiModels(settings, prompt);
    } catch (error) {
      errors.push(error?.message || String(error));
      if (!isTransientAiError(error)) break;
      console.warn(`[AI Fallback] Provider ${provider} failed. Trying next provider if available.`);
    }
  }
  if (!errors.length) throw new Error('Thiếu API key. Hãy nhập Gemini hoặc OpenAI API key trong API Settings.');
  throw new Error(`AI provider tạm thời không khả dụng sau retry/fallback. Chi tiết: ${errors.join(' | ')}`);
}

async function generatePipelineStep(payload = {}) {
  const step = payload.step || 'structure';
  const inputText = payload.inputText || '';
  const settings = payload.settings || {};
  const userPrompt = buildUserPrompt(step, inputText, settings);
  const apiSettings = sanitizeSettings(settings.apiSettings || {});

  // Speed-first routing for creator UX:
  // - Steps 1-4 and translation use Gemini 2.5 Flash-Lite by default.
  // - Step 5 only prefers 2.5 Flash when High Quality mode is selected.
  // - If 2.5 is busy, fallback quickly to Flash-Lite instead of waiting forever.
  if (apiSettings.provider === 'gemini') {
    if (step === 'translateVi') {
      apiSettings.qualityMode = 'fast';
      apiSettings.geminiModel = 'gemini-2.5-flash-lite';
    } else if (step === 'conversation' && apiSettings.qualityMode === 'highQuality') {
      apiSettings.geminiModel = 'gemini-2.5-flash';
    } else if (apiSettings.qualityMode !== 'highQuality') {
      apiSettings.geminiModel = 'gemini-2.5-flash-lite';
    }
  }

  const rawText = await runProvider(apiSettings, userPrompt);
  return step === 'translateVi'
    ? rawText
    : normalizeScriptPresetLines(rawText, settings.blockPresets);
}

ipcMain.handle('script:generate-step', async (_event, payload) => {
  try {
    const text = await generatePipelineStep(payload || {});
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('script:export-text', async (_event, payload) => {
  const defaultPath = path.join(app.getPath('documents'), payload?.filename || 'easy-english-final-script.txt');
  const result = await dialog.showSaveDialog({ defaultPath, filters: [{ name: 'Text', extensions: ['txt'] }] });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  await fs.writeFile(result.filePath, payload?.text || '', 'utf8');
  return { ok: true, path: result.filePath };
});

ipcMain.handle('script:import-text', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Text / Markdown', extensions: ['txt', 'md'] }, { name: 'All Files', extensions: ['*'] }] });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
  const text = await fs.readFile(result.filePaths[0], 'utf8');
  return { ok: true, text, path: result.filePaths[0] };
});

ipcMain.handle('script:save-project', async (_event, payload) => {
  const defaultPath = path.join(app.getPath('documents'), 'easy-script-project.json');
  const result = await dialog.showSaveDialog({ defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  await fs.writeFile(result.filePath, JSON.stringify(payload || {}, null, 2), 'utf8');
  return { ok: true, path: result.filePath };
});

ipcMain.handle('script:load-project', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
  const raw = await fs.readFile(result.filePaths[0], 'utf8');
  return { ok: true, data: JSON.parse(raw), path: result.filePaths[0] };
});

ipcMain.handle('settings:load', async () => {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    return { ok: true, settings: sanitizeSettings(JSON.parse(raw)) };
  } catch (_error) {
    return { ok: true, settings: sanitizeSettings({}) };
  }
});

ipcMain.handle('settings:save', async (_event, payload) => {
  try {
    await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
    await fs.writeFile(settingsPath(), JSON.stringify(sanitizeSettings(payload), null, 2), 'utf8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});

ipcMain.handle('settings:test-provider', async (_event, payload) => {
  try {
    await runProvider(payload, 'Reply with exactly: OK');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});


function compareSemver(a = '0.0.0', b = '0.0.0') {
  const pa = String(a).split('.').map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

ipcMain.handle('app:check-for-updates', async () => {
  try {
    const loaded = await fs.readFile(settingsPath(), 'utf8').then((raw) => sanitizeSettings(JSON.parse(raw))).catch(() => sanitizeSettings({}));
    const manifestUrl = loaded.updateManifestUrl;
    if (!manifestUrl) {
      return {
        ok: true,
        updateAvailable: false,
        message: `Auto update chưa cấu hình feed. Phiên bản hiện tại: v${packageJson.version}. Khi build installer chính thức, thêm updateManifestUrl trong Advanced Settings để app tự kiểm tra bản mới.`
      };
    }
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Không tải được update manifest: HTTP ${response.status}`);
    const manifest = await response.json();
    const latestVersion = String(manifest.version || '');
    if (!latestVersion) throw new Error('Update manifest thiếu trường version.');
    const updateAvailable = compareSemver(latestVersion, packageJson.version) > 0;
    return {
      ok: true,
      updateAvailable,
      version: latestVersion,
      url: manifest.url || manifest.downloadUrl || '',
      message: updateAvailable
        ? `Có bản mới v${latestVersion}. ${manifest.url || manifest.downloadUrl ? 'Mở link tải trong manifest để cập nhật.' : 'Manifest chưa có URL tải.'}`
        : `Bạn đang dùng bản mới nhất: v${packageJson.version}.`
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
});
