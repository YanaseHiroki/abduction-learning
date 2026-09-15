import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookMarked, GitBranch } from "lucide-react";
import { CardShell } from "@/components/inquiry/CardShell";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { addCard, db, deleteCard, updateCardPayload } from "@/lib/db";
import { useT } from "@/lib/i18n";
import type { Card, HypothesisLine, HypothesisPayload, Inquiry } from "@/lib/types";
import { cn } from "@/lib/utils";

export function HypothesisCard({ card, inquiry, cards }: { card: Card<"hypothesis">; inquiry: Inquiry; cards: Card[] }) {
  const t = useT();
  const p = card.payload;
  const [lines, setLines] = useState<HypothesisLine[]>(p.lines);
  const previous = cards
    .filter((c): c is Card<"hypothesis"> => c.kind === "hypothesis" && (c.payload as HypothesisPayload).version === p.version - 1)
    .at(0);
  const notes = useLiveQuery(() => db.schemaNotes.where("l2").equals(inquiry.l2).reverse().sortBy("createdAt"), [inquiry.l2]) ?? [];
  const maxVersion = Math.max(...cards.filter((c) => c.kind === "hypothesis").map((c) => (c as Card<"hypothesis">).payload.version));

  function commit(next: HypothesisLine[]) {
    setLines(next);
    updateCardPayload(card, { lines: next });
  }

  async function branch() {
    await addCard(inquiry.id, "hypothesis", { version: maxVersion + 1, lines: structuredClone(lines), notes: "", basedOn: [card.id] });
  }

  return (
    <CardShell
      kind="hypothesis"
      id={card.id}
      title={t({ ja: `私たちのアブダクション v${p.version}`, en: `Our abduction v${p.version}` })}
      createdAt={card.createdAt}
      onDelete={() => deleteCard(card.id)}
      actions={
        <div className="flex items-center gap-1">
          {notes.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="ghost" />}>
                <BookMarked />{t({ ja: "過去のスキーマを持ち込む", en: "Bring in a past schema" })}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-sm">
                {notes.map((n) => (
                  <DropdownMenuItem
                    key={n.id}
                    onClick={() => {
                      const text = n.lines.map((l) => `${n.targets.find((x) => x.id === l.targetId)?.label ?? ""}: ${l.text}`).join(" / ");
                      commit(lines.map((l) => ({ ...l, text: l.text || text, uncertain: true })));
                    }}
                  >
                    <span className="truncate">{n.targets.map((x) => x.label).join(" & ")} — {n.lines.map((l) => l.text).join(" / ")}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" variant="ghost" onClick={branch}><GitBranch />{t({ ja: "この版から次の版へ", en: "Next version from here" })}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {inquiry.targets.map((tg, ti) => {
          const line = lines.find((l) => l.targetId === tg.id) ?? { targetId: tg.id, text: "", uncertain: false };
          const prev = previous?.payload.lines.find((l) => l.targetId === tg.id)?.text;
          return (
            <div key={tg.id} className="grid gap-1 sm:grid-cols-[140px_1fr]">
              <div className="flex items-start gap-2 pt-1.5">
                <TargetBadge target={tg} index={ti} />
                <button
                  type="button"
                  title={t({ ja: "不確か（？）", en: "Uncertain (?)" })}
                  onClick={() => commit(inquiry.targets.map((x) => (x.id === tg.id ? { ...line, uncertain: !line.uncertain } : lines.find((l) => l.targetId === x.id) ?? { targetId: x.id, text: "", uncertain: false })))}
                  className={cn("rounded border px-1.5 text-sm font-bold", line.uncertain ? "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "text-muted-foreground")}
                >
                  ?
                </button>
              </div>
              <div>
                <Textarea
                  rows={2}
                  className="min-h-9"
                  placeholder={t({ ja: "一行で: 例「意図的に聞く → 耳を傾ける」", en: "One line, e.g. 'listening on purpose'" })}
                  value={line.text}
                  onChange={(e) => setLines(inquiry.targets.map((x) => (x.id === tg.id ? { ...line, text: e.target.value } : lines.find((l) => l.targetId === x.id) ?? { targetId: x.id, text: "", uncertain: false })))}
                  onBlur={() => commit(lines)}
                />
                {prev !== undefined && prev !== line.text && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    v{p.version - 1}: <span className="line-through">{prev || "—"}</span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <Textarea
          placeholder={t({ ja: "根拠・メモ（どの観察からそう考えたか、構文との関係、包含関係の図の説明…）", en: "Evidence and notes: which observation led here, relation to syntax, inclusion diagram…" })}
          defaultValue={p.notes}
          onBlur={(e) => e.target.value !== p.notes && updateCardPayload(card, { notes: e.target.value })}
        />
      </div>
    </CardShell>
  );
}
