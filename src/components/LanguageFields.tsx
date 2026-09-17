import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { languageName, languageOptions } from "@/lib/courses";
import { useT } from "@/lib/i18n";
import { NATIVE_LANGUAGE, setSettings, useSettings } from "@/lib/settings";

/** Language being learned and screen language (the body of "🌐 言語"). */
export function LanguageFields() {
  const t = useT();
  const { uiLang, defaultL2 } = useSettings();
  // the native language is fixed, and studying it would make no sense
  const learnable = languageOptions.filter((c) => c !== NATIVE_LANGUAGE);
  const langItems = learnable.map((c) => ({ value: c, label: languageName(c, uiLang) }));
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t({ ja: "学ぶ言語", en: "Learning" })}</span>
      <Select items={langItems} value={defaultL2} onValueChange={(v) => v && setSettings({ defaultL2: v })}>
        <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{learnable.map((c) => <SelectItem key={c} value={c}>{languageName(c, uiLang)}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">{t({ ja: "画面の言語", en: "Screen" })}</span>
      <Select items={[{ value: "ja", label: "日本語" }, { value: "en", label: "English" }]} value={uiLang} onValueChange={(v) => v && setSettings({ uiLang: v as "ja" | "en" })}>
        <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ja">日本語</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
      </Select>
    </div>
  );
}
