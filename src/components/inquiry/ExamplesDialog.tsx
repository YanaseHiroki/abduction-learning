import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { genres, levels } from "@/lib/courses";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { ExamplesParams, Inquiry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { targetColor } from "./TargetBadge";

export function ExamplesDialog({
  inquiry,
  open,
  onOpenChange,
  onSubmit,
  busy,
}: {
  inquiry: Inquiry;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (p: ExamplesParams) => void;
  busy: boolean;
}) {
  const t = useT();
  const { uiLang } = useSettings();
  const [targetIds, setTargetIds] = useState<string[]>(inquiry.targets.map((x) => x.id));
  const [count, setCount] = useState(10);
  const [level, setLevel] = useState(inquiry.level);
  const [genre, setGenre] = useState(inquiry.genre);
  const [maxWords, setMaxWords] = useState<string>("");
  const [adverbs, setAdverbs] = useState(false);

  const contrastWith = inquiry.targets.filter((x) => !targetIds.includes(x.id)).map((x) => x.label);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t({ ja: "例文セットを出力する", en: "Generate an example set" })}</DialogTitle>
          <DialogDescription>{t({ ja: "AIには「頼むまで解説しない」という指示が常に付きます。", en: "The AI is always told not to explain until asked." })}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t({ ja: "対象", en: "Targets" })}</Label>
            <div className="flex flex-wrap gap-1.5">
              {inquiry.targets.map((x, i) => {
                const on = targetIds.includes(x.id);
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setTargetIds(on ? targetIds.filter((id) => id !== x.id) : [...targetIds, x.id])}
                    className={cn("rounded-md border px-2 py-0.5 text-sm", on ? targetColor(i) : "text-muted-foreground line-through opacity-60")}
                  >
                    {x.label}
                  </button>
                );
              })}
            </div>
            {contrastWith.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t({ ja: "外した語との違いがわかるように生成します: ", en: "Contrasted against: " })}
                {contrastWith.join(", ")}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t({ ja: "ジャンル", en: "Genre" })}</Label>
              <Select items={genres.map((g) => ({ value: g.id, label: uiLang === "ja" ? g.ja : g.en }))} value={genre} onValueChange={(v) => v && setGenre(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {genres.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{uiLang === "ja" ? g.ja : g.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t({ ja: "レベル", en: "Level" })}</Label>
              <Select items={levels.map((l) => ({ value: l.id, label: uiLang === "ja" ? l.ja : l.en }))} value={level} onValueChange={(v) => v && setLevel(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{uiLang === "ja" ? l.ja : l.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t({ ja: "1語あたりの例文数", en: "Sentences per target" })}</Label>
              <Input type="number" min={3} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
            <div className="grid gap-1.5">
              <Label>{t({ ja: "語数上限（任意）", en: "Max words (optional)" })}</Label>
              <Input type="number" min={4} placeholder="—" value={maxWords} onChange={(e) => setMaxWords(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">{t({ ja: "違いがわかる副詞を全文に入れる", en: "Add a distinguishing adverb to every sentence" })}</div>
              <div className="text-xs text-muted-foreground">{t({ ja: "動詞のニュアンスの差を強調したいときに", en: "Highlights nuance differences between verbs" })}</div>
            </div>
            <Switch checked={adverbs} onCheckedChange={setAdverbs} />
          </label>
        </div>
        <DialogFooter>
          <Button
            disabled={busy || targetIds.length === 0}
            onClick={() =>
              onSubmit({
                targetIds,
                count,
                level,
                genre,
                maxWords: maxWords ? Number(maxWords) : null,
                adverbs,
                contrastWith,
              })
            }
          >
            {busy && <Loader2 className="animate-spin" />}
            {t({ ja: "出力する", en: "Generate" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
