export type VoiceGender = "male" | "female";
export type VoiceLocale = "vi-VN" | "en-US" | "other";
export type VoiceUseCase = "single" | "podcast" | "all";

export type VoiceOption = {
  id: string;
  label: string;
  shortLabel?: string;
  gender: VoiceGender;
  locale: VoiceLocale;
  useCase: VoiceUseCase;
  engine?: string;
  notes?: string;
};

export const VOICE_CATALOG: VoiceOption[] = [
  {
    id: "Zephyr",
    label: "Zephyr",
    shortLabel: "Zephyr",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Bright, friendly"
  },
  {
    id: "Kore",
    label: "Kore",
    shortLabel: "Kore",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Clear, professional"
  },
  {
    id: "Leda",
    label: "Leda",
    shortLabel: "Leda",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Soft, natural"
  },
  {
    id: "Aoede",
    label: "Aoede",
    shortLabel: "Aoede",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Warm, expressive"
  },
  {
    id: "Callirrhoe",
    label: "Callirrhoe",
    shortLabel: "Callirrhoe",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Elegant, clear"
  },
  {
    id: "Autonoe",
    label: "Autonoe",
    shortLabel: "Autonoe",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Light, conversational"
  },
  {
    id: "Despina",
    label: "Despina",
    shortLabel: "Despina",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Smooth, friendly"
  },
  {
    id: "Erinome",
    label: "Erinome",
    shortLabel: "Erinome",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Gentle, calm"
  },
  {
    id: "Laomedeia",
    label: "Laomedeia",
    shortLabel: "Laomedeia",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Natural, storytelling"
  },
  {
    id: "Achernar",
    label: "Achernar",
    shortLabel: "Achernar",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Bright, polished"
  },
  {
    id: "Sadachbia",
    label: "Sadachbia",
    shortLabel: "Sadachbia",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Soft, clean"
  },
  {
    id: "Sulafat",
    label: "Sulafat",
    shortLabel: "Sulafat",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Clear, balanced"
  },
  {
    id: "Vindemiatrix",
    label: "Vindemiatrix",
    shortLabel: "Vindemiatrix",
    gender: "female",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Warm, mature"
  },
  {
    id: "Puck",
    label: "Puck",
    shortLabel: "Puck",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Energetic, friendly"
  },
  {
    id: "Charon",
    label: "Charon",
    shortLabel: "Charon",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Deep, strong"
  },
  {
    id: "Fenrir",
    label: "Fenrir",
    shortLabel: "Fenrir",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Warm, storytelling"
  },
  {
    id: "Orus",
    label: "Orus",
    shortLabel: "Orus",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Confident, clear"
  },
  {
    id: "Enceladus",
    label: "Enceladus",
    shortLabel: "Enceladus",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Natural, grounded"
  },
  {
    id: "Iapetus",
    label: "Iapetus",
    shortLabel: "Iapetus",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Deep, calm"
  },
  {
    id: "Umbriel",
    label: "Umbriel",
    shortLabel: "Umbriel",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Smooth, serious"
  },
  {
    id: "Algieba",
    label: "Algieba",
    shortLabel: "Algieba",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Warm, professional"
  },
  {
    id: "Algenib",
    label: "Algenib",
    shortLabel: "Algenib",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Clear, direct"
  },
  {
    id: "Alnilam",
    label: "Alnilam",
    shortLabel: "Alnilam",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Balanced, narration"
  },
  {
    id: "Rasalgethi",
    label: "Rasalgethi",
    shortLabel: "Rasalgethi",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Rich, storytelling"
  },
  {
    id: "Sadaltager",
    label: "Sadaltager",
    shortLabel: "Sadaltager",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Calm, measured"
  },
  {
    id: "Schedar",
    label: "Schedar",
    shortLabel: "Schedar",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Warm, stable"
  },
  {
    id: "Zubenelgenubi",
    label: "Zubenelgenubi",
    shortLabel: "Zubenelgenubi",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Distinct, conversational"
  },
  {
    id: "Achird",
    label: "Achird",
    shortLabel: "Achird",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Friendly, casual"
  },
  {
    id: "Gacrux",
    label: "Gacrux",
    shortLabel: "Gacrux",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Deep, dramatic"
  },
  {
    id: "Pulcherrima",
    label: "Pulcherrima",
    shortLabel: "Pulcherrima",
    gender: "male",
    locale: "en-US",
    useCase: "all",
    engine: "Vertex AI Gemini TTS",
    notes: "Bright, energetic"
  }
];

export function getVoiceById(id?: string | null) {
  if (!id) return null;
  return VOICE_CATALOG.find((voice) => voice.id === id) ?? null;
}

export function getVoicesByLocale(locale: VoiceLocale) {
  return VOICE_CATALOG.filter((voice) => voice.locale === locale);
}

export function getVoicesByGender(gender: VoiceGender) {
  return VOICE_CATALOG.filter((voice) => voice.gender === gender);
}

export function getVoicesForUseCase(useCase: VoiceUseCase) {
  if (useCase === "all") return VOICE_CATALOG;
  return VOICE_CATALOG.filter(
    (voice) => voice.useCase === "all" || voice.useCase === useCase
  );
}