import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHint } from "./CardHint";
import { deleteCard } from "@/lib/db";
import { cardHasContent } from "@/lib/guide";
import { useT, type Localized } from "@/lib/i18n";
import { fmtDate } from "@/lib/text";
import { useSettings } from "@/lib/settings";
import type { Card, CardKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const kindMeta: Record<CardKind, { emoji: string; ja: string; en: string; step: string; stripe: string }> = {
  examples: { emoji: "📝", ja: "例文", en: "Examples", step: "STEP 1", stripe: "border-l-sky-500" },
  observation: { emoji: "🔍", ja: "見比べる", en: "Compare", step: "STEP 2", stripe: "border-l-amber-500" },
  syntax: { emoji: "🧩", ja: "文の形を見る", en: "Sentence shapes", step: "STEP 2", stripe: "border-l-amber-600" },
  hypothesis: { emoji: "💡", ja: "仮説", en: "Hypothesis", step: "STEP 2", stripe: "border-l-rose-500" },
  verify_translation: { emoji: "🌐", ja: "訳して確かめる", en: "Check by translating", step: "STEP 3", stripe: "border-l-emerald-500" },
  verify_frame: { emoji: "🧪", ja: "型に当てはめて確かめる", en: "Check with frames", step: "STEP 3", stripe: "border-l-emerald-600" },
  summary: { emoji: "🏁", ja: "まとめ", en: "Summary", step: "STEP 4", stripe: "border-l-violet-500" },
};

export function CardShell({
  card,
  title,
  actions,
  children,
  hint,
}: {
  card: Card;
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** what to do on this card right now (from lib/guide) */
  hint?: Localized;
}) {
  const t = useT();
  const { uiLang } = useSettings();
  const meta = kindMeta[card.kind];
  const name = `${meta.emoji} ${uiLang === "ja" ? meta.ja : meta.en}`;

  // The trash sits next to the card's own switches, so a card holding work asks first: there is no undo.
  function remove() {
    if (cardHasContent(card) && !confirm(t({ ja: `${name} のカードを消しますか？\n書いた内容は元に戻せません。`, en: `Delete this ${name} card?\nWhat you wrote cannot be brought back.` }))) return;
    deleteCard(card.id);
  }

  return (
    <section id={`card-${card.id}`} className={cn("rounded-xl border border-l-4 bg-card shadow-xs", meta.stripe)}>
      <header className="flex flex-wrap items-center gap-4 border-b px-4 py-2.5">
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] tracking-wide text-muted-foreground">{meta.step}</span>
        <h3 className="font-semibold">{name}</h3>
        {title && <span className="text-sm text-muted-foreground">{title}</span>}
        <span className="ml-auto text-xs text-muted-foreground">{fmtDate(card.createdAt, uiLang)}</span>
        {actions}
        <Button variant="ghost" size="icon-sm" aria-label={t({ ja: "このカードを削除", en: "Delete this card" })} onClick={remove}>
          <Trash2 />
        </Button>
      </header>
      <div className="px-4 py-3">
        {hint && <CardHint cardId={card.id} hint={hint} />}
        {children}
      </div>
    </section>
  );
}
