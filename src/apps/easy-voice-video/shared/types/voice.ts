export type VoiceFormat = "podcast" | "single";
export type LanguageOption = "en";
export type VoiceProfileOption = "default" | "warm" | "clear" | "story";

export type VoiceTypeOption =
  | "podcast"
  | "englishMale"
  | "englishFemale";

export type VoiceCatalogItem = {
  id: string;
  apiId?: string | null;
  label: string;
  description?: string;
  mode?: string;
  language?: string;
  gender?: string;
  formatId?: string;
  speakers?: {
    A?: string;
    R?: string;
  };
};

export type VoiceCatalog = Partial<Record<VoiceTypeOption, VoiceCatalogItem[]>>;

export type CustomVoiceForm = {
  voiceType: VoiceTypeOption;
  id: string;
  apiId: string;
  label: string;
  description: string;
};
