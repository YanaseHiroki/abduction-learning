import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { genres } from "@/lib/courses";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/text";
import type { Card, Inquiry } from "@/lib/types";

/** Choose which example set a STEP 2 card works on. */
export function ExamplesPicker({
  cards,
  inquiry,
  value,
  onChange,
}: {
  cards: Card[];
  inquiry: Inquiry;
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const { uiLang } = useSettings();
  const sets = cards.filter((c): c is Card<"examples"> => c.kind === "examples");
  const labelOf = (c: Card<"examples">) => {
    const g = genres.find((x) => x.id === c.payload.params.genre);
    const labels = c.payload.sets.map((s) => inquiry.targets.find((x) => x.id === s.targetId)?.label).filter(Boolean).join(" / ");
    return `${labels} · ${g ? (uiLang === "ja" ? g.ja : g.en) : c.payload.params.genre} · ${fmtDate(c.createdAt, uiLang)}`;
  };
  return (
    <Select items={sets.map((c) => ({ value: c.id, label: labelOf(c) }))} value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger size="sm" className="max-w-full">
        <SelectValue placeholder={t({ ja: "例文セットを選ぶ", en: "Pick an example set" })} />
      </SelectTrigger>
      <SelectContent>
        {sets.map((c) => (
          <SelectItem key={c.id} value={c.id}>{labelOf(c)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
