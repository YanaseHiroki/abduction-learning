import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chooseLanguage, languageName, languageOptions } from "@/lib/courses";
import { useT } from "@/lib/i18n";
import { setSettings, useSettings } from "@/lib/settings";

/** Native language, language being learned, and screen language (the body of "🌐 言語"). */
export function LanguageFields() {
  const t = useT();
  const { uiLang, defaultL1, defaultL2 } = useSettings();
  const langItems = languageOptions.map((c) => ({ value: c, label: languageName(c, uiLang) }));
  // picking one side may move the other, so both are written together
  const pick = (side: "l1" | "l2", v: string) => {
    const { l1, l2 } = chooseLanguage(side, v, { l1: defaultL1, l2: defaultL2 });
    setSettings({ defaultL1: l1, defaultL2: l2 });
  };
  return (
    <div className="grid grid-cols-[6rem_1fr] items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t({ ja: "母語", en: "I speak" })}</span>
      <Select items={langItems} value={defaultL1} onValueChange={(v) => v && pick("l1", v)}>
        <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{languageOptions.map((c) => <SelectItem key={c} value={c}>{languageName(c, uiLang)}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">{t({ ja: "学ぶ言語", en: "Learning" })}</span>
      <Select items={langItems} value={defaultL2} onValueChange={(v) => v && pick("l2", v)}>
        <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{languageOptions.map((c) => <SelectItem key={c} value={c}>{languageName(c, uiLang)}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">{t({ ja: "画面の言語", en: "Screen" })}</span>
      <Select items={[{ value: "ja", label: "日本語" }, { value: "en", label: "English" }]} value={uiLang} onValueChange={(v) => v && setSettings({ uiLang: v as "ja" | "en" })}>
        <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="ja">日本語</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
      </Select>
    </div>
  );
}
