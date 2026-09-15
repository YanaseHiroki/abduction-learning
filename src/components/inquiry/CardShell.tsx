import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/text";
import { useSettings } from "@/lib/settings";
import type { CardKind } from "@/lib/types";
import { cn } from "@/lib/utils";

export const kindMeta: Record<CardKind, { emoji: string; ja: string; en: string; step: string; stripe: string }> = {
  examples: { emoji: "📝", ja: "例文セット", en: "Example set", step: "STEP 1", stripe: "border-l-sky-500" },
  observation: { emoji: "🔍", ja: "観察", en: "Observation", step: "STEP 2", stripe: "border-l-amber-500" },
  syntax: { emoji: "🧩", ja: "構文分析", en: "Syntax", step: "STEP 2", stripe: "border-l-amber-600" },
  hypothesis: { emoji: "💡", ja: "仮説", en: "Hypothesis", step: "STEP 2", stripe: "border-l-rose-500" },
  verify_translation: { emoji: "🌐", ja: "検証：翻訳テスト", en: "Verify: translation test", step: "STEP 3", stripe: "border-l-emerald-500" },
  verify_frame: { emoji: "🧪", ja: "検証：フレームテスト", en: "Verify: frame test", step: "STEP 3", stripe: "border-l-emerald-600" },
  summary: { emoji: "🏁", ja: "まとめ・出力", en: "Summary & writing", step: "OUTPUT", stripe: "border-l-violet-500" },
};

export function CardShell({
  kind,
  title,
  createdAt,
  onDelete,
  actions,
  children,
  id,
}: {
  kind: CardKind;
  title?: ReactNode;
  createdAt: number;
  onDelete: () => void;
  actions?: ReactNode;
  children: ReactNode;
  id: string;
}) {
  const { uiLang } = useSettings();
  const meta = kindMeta[kind];
  return (
    <section id={`card-${id}`} className={cn("rounded-xl border border-l-4 bg-card shadow-xs", meta.stripe)}>
      <header className="flex flex-wrap items-center gap-4 border-b px-4 py-2.5">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-muted-foreground">{meta.step}</span>
        <h3 className="font-semibold">{meta.emoji} {uiLang === "ja" ? meta.ja : meta.en}</h3>
        {title && <span className="text-sm text-muted-foreground">{title}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{fmtDate(createdAt, uiLang)}</span>
        {actions}
        <Button variant="ghost" size="icon-sm" aria-label="delete" onClick={onDelete}>
          <Trash2 />
        </Button>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}
