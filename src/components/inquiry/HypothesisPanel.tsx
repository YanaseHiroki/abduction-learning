import { TargetBadge } from "./TargetBadge";
import { useT } from "@/lib/i18n";
import type { Card, Inquiry } from "@/lib/types";

export function HypothesisPanel({ inquiry, latest, cards }: { inquiry: Inquiry; latest: Card<"hypothesis"> | null; cards: Card[] }) {
  const t = useT();
  const counts = {
    examples: cards.filter((c) => c.kind === "examples").length,
    observation: cards.filter((c) => c.kind === "observation" || c.kind === "syntax").length,
    hypothesis: cards.filter((c) => c.kind === "hypothesis").length,
    verify: cards.filter((c) => c.kind.startsWith("verify")).length,
  };
  return (
    <aside className="space-y-4">
      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-semibold">{t({ ja: "💡 いまの仮説", en: "💡 Your hypothesis so far" })}</h3>
          {latest && <a href={`#card-${latest.id}`} className="text-xs text-muted-foreground hover:underline">v{latest.payload.version}</a>}
        </div>
        {latest ? (
          <ul className="space-y-2">
            {inquiry.targets.map((tg, i) => {
              const line = latest.payload.lines.find((l) => l.targetId === tg.id);
              return (
                <li key={tg.id} className="text-sm">
                  <TargetBadge target={tg} index={i} className="mb-0.5" />
                  <div className="pl-1">{line?.text || <span className="text-muted-foreground">—</span>}{line?.uncertain && <span className="ml-1 text-amber-600">?</span>}</div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{t({ ja: "例文を眺めて、まずは1行、自分の考えを書いてみましょう。\n間違っていても大丈夫です。", en: "Look at the examples and write one line of your own idea.\nBeing wrong is fine." })}</p>
        )}
      </div>
      <div className="rounded-xl border bg-card p-4 text-sm shadow-xs">
        <h3 className="mb-2 font-semibold">{t({ ja: "🔄 ここまでの流れ", en: "🔄 So far" })}</h3>
        <ol className="space-y-1.5">
          <li className="flex justify-between"><span>1. {t({ ja: "例文を出す", en: "Get examples" })}</span><span className="tabular-nums text-muted-foreground">{counts.examples}</span></li>
          <li className="flex justify-between"><span>2. {t({ ja: "見比べて、仮説を書く", en: "Compare and write a hypothesis" })}</span><span className="tabular-nums text-muted-foreground">{counts.observation} / {counts.hypothesis}</span></li>
          <li className="flex justify-between"><span>3. {t({ ja: "確かめる", en: "Check it" })}</span><span className="tabular-nums text-muted-foreground">{counts.verify}</span></li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">{t({ ja: "外れた予想が、いちばん多くを教えてくれます。", en: "A wrong prediction teaches the most." })}</p>
      </div>
    </aside>
  );
}
