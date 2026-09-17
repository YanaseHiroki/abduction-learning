import { useSettings } from "./settings";

export type Localized = { ja: string; en: string };

export function pick(l: Localized, lang: "ja" | "en") {
  return l[lang] ?? l.en;
}

/** Hook returning a translator for inline {ja, en} pairs. */
export function useT() {
  const { uiLang } = useSettings();
  return (l: Localized) => pick(l, uiLang);
}

/** "Language" in each language the app offers, keyed by primary subtag. */
const LANGUAGE_WORD: Record<string, string> = {
  ja: "言語", en: "Language", zh: "语言", ko: "언어", fr: "Langue", de: "Sprache", es: "Idioma",
  it: "Lingua", pt: "Idioma", ru: "Язык", vi: "Ngôn ngữ", th: "ภาษา", id: "Bahasa",
};

/**
 * Follows the browser's language rather than uiLang: someone who landed on a screen they can't read
 * still needs to recognise the control that switches it.
 */
export function languageWord() {
  const code = (navigator.languages?.[0] ?? navigator.language ?? "").split("-")[0].toLowerCase();
  return LANGUAGE_WORD[code] ?? "Language";
}
