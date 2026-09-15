import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { genres, levels, type ExampleSettings } from "@/lib/courses";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** The one decision shown up front when generating examples: which kind of scene. */
export function GenreTiles({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { uiLang } = useSettings();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {genres.map((g) => (
        <button
          key={g.id}
          type="button"
          aria-pressed={value === g.id}
          onClick={() => onChange(g.id)}
          className={cn(
            "flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition",
            value === g.id ? "border-blue-600 bg-blue-50 font-medium text-blue-900 dark:bg-blue-950/40 dark:text-blue-100" : "border-border hover:border-blue-300",
          )}
        >
          <span className="text-xl leading-none">{g.emoji}</span>
          <span>{uiLang === "ja" ? g.ja : g.en}</span>
        </button>
      ))}
    </div>
  );
}

/** The folded-away details: level, number of sentences, length limit, adverbs. */
export function ExampleSettingsFields({ value, onChange }: { value: ExampleSettings; onChange: (v: ExampleSettings) => void }) {
  const t = useT();
  const { uiLang } = useSettings();
  const set = (patch: Partial<ExampleSettings>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 grid gap-1.5">
          <Label>{t({ ja: "レベル", en: "Level" })}</Label>
          <Select items={levels.map((l) => ({ value: l.id, label: uiLang === "ja" ? l.ja : l.en }))} value={value.level} onValueChange={(v) => v && set({ level: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{levels.map((l) => <SelectItem key={l.id} value={l.id}>{uiLang === "ja" ? l.ja : l.en}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>{t({ ja: "1語あたりの例文数", en: "Sentences per target" })}</Label>
          <Input type="number" min={3} max={20} value={value.count} onChange={(e) => set({ count: Number(e.target.value) })} />
        </div>
        <div className="grid gap-1.5">
          <Label>{t({ ja: "語数上限（任意）", en: "Max words (optional)" })}</Label>
          <Input type="number" min={4} placeholder="—" value={value.maxWords} onChange={(e) => set({ maxWords: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <div>
          <div className="text-sm font-medium">{t({ ja: "違いがわかる副詞を全文に入れる", en: "Add a distinguishing adverb to every sentence" })}</div>
          <div className="text-xs text-muted-foreground">{t({ ja: "動詞のニュアンスの差を強調したいときに", en: "Highlights nuance differences between verbs" })}</div>
        </div>
        <Switch checked={value.adverbs} onCheckedChange={(v) => set({ adverbs: v })} />
      </label>
    </div>
  );
}
