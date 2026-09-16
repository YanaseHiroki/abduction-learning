import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { defaultExampleSettings, type ExampleSettings } from "@/lib/courses";
import { useT } from "@/lib/i18n";
import type { ExamplesParams, Inquiry } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExampleSettingsFields, GenreTiles } from "./ExampleOptions";
import { targetColor } from "./target-color";

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
  const [targetIds, setTargetIds] = useState<string[]>(inquiry.targets.map((x) => x.id));
  const [settings, setSettings] = useState<ExampleSettings>(() => defaultExampleSettings(inquiry.genre, inquiry.level));

  const contrastWith = inquiry.targets.filter((x) => !targetIds.includes(x.id)).map((x) => x.label);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t({ ja: "📝 例文セットを出力する", en: "📝 Generate an example set" })}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{t({ ja: "どんな場面の例文で比べるかを選びます。\nAIは頼むまで解説しません。", en: "Pick the kind of scene to compare in.\nThe AI will not explain until asked." })}</DialogDescription>
        </DialogHeader>
        <GenreTiles value={settings.genre} onChange={(genre) => setSettings({ ...settings, genre })} />
        <Disclosure label={t({ ja: "⚙️ オプションを変更する", en: "⚙️ Change options" })}>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>{t({ ja: "対象", en: "Targets" })}</Label>
              <div className="flex flex-wrap gap-3">
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
            <ExampleSettingsFields value={settings} onChange={setSettings} />
          </div>
        </Disclosure>
        <DialogFooter>
          <Button
            disabled={busy || targetIds.length === 0}
            onClick={() =>
              onSubmit({
                targetIds,
                count: settings.count,
                level: settings.level,
                genre: settings.genre,
                maxWords: settings.maxWords ? Number(settings.maxWords) : null,
                adverbs: settings.adverbs,
                contrastWith,
              })
            }
          >
            {busy && <Loader2 className="animate-spin" />}
            {t({ ja: "🚀 出力する", en: "🚀 Generate" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
