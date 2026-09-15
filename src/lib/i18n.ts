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
