import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BookMarked, GitBranch } from "lucide-react";
import { CardShell } from "@/components/inquiry/CardShell";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { addCard, db, updateCardPayload } from "@/lib/db";
import { cardHint } from "@/lib/guide";
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
  // What the observation cards collected for each target, offered as words to start a line with.
  const clues = new Map<string, string[]>();
  for (const c of cards) {
    if (c.kind !== "observation") continue;
    for (const m of (c as Card<"observation">).payload.marks) clues.set(m.targetId, [...new Set([...(clues.get(m.targetId) ?? []), m.text])]);
  }
  const written = lines.some((l) => l.text.trim());
  const maxVersion = Math.max(...cards.filter((c) => c.kind === "hypothesis").map((c) => (c as Card<"hypothesis">).payload.version));

  /** Replace one target's line, filling in blank lines for the others. */
  const withLine = (line: HypothesisLine) => inquiry.targets.map((x) => (x.id === line.targetId ? line : lines.find((l) => l.targetId === x.id) ?? { targetId: x.id, text: "", uncertain: false }));

  function commit(next: HypothesisLine[]) {
    setLines(next);
    updateCardPayload(card, { lines: next });
  }

  /** Put a collected word into an empty line and leave the cursor after it, so the learner writes the rest. */
  function startFrom(targetId: string, word: string) {
    const line = lines.find((l) => l.targetId === targetId) ?? { targetId, text: "", uncertain: false };
    commit(withLine({ ...line, text: `「${word}」` }));
    requestAnimationFrame(() => {
      const el = document.getElementById(`hyp-${card.id}-${targetId}`) as HTMLTextAreaElement | null;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    });
  }

  async function branch() {
    await addCard(inquiry.id, "hypothesis", { version: maxVersion + 1, lines: structuredClone(lines), notes: "", basedOn: [card.id] });
  }

  return (
    <CardShell
      card={card}
      title={t({ ja: `私たちのアブダクション v${p.version}`, en: `Our abduction v${p.version}` })}
      hint={cardHint({ ...card, payload: { ...p, lines } }, inquiry)}
      actions={
        <div className="flex items-center gap-2">
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
              <div className="flex items-start gap-4 pt-1.5">
                <TargetBadge target={tg} index={ti} />
                <button
                  type="button"
                  title={t({ ja: "不確か（？）", en: "Uncertain (?)" })}
                  onClick={() => commit(withLine({ ...line, uncertain: !line.uncertain }))}
                  className={cn("rounded border px-1.5 text-sm font-bold", line.uncertain ? "border-amber-400 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" : "text-muted-foreground")}
                >
                  ?
                </button>
              </div>
              <div>
                <Textarea
                  id={`hyp-${card.id}-${tg.id}`}
                  rows={2}
                  className="min-h-9"
                  placeholder={t({ ja: `一行で: 例「${tg.label} は、〜するときに使う」`, en: `One line, e.g. "${tg.label} is used when …"` })}
                  value={line.text}
                  onChange={(e) => setLines(withLine({ ...line, text: e.target.value }))}
                  onBlur={() => commit(lines)}
                />
                {!line.text.trim() && !!clues.get(tg.id)?.length && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">{t({ ja: "観察で集めた語句から書き始める:", en: "Start from what you collected:" })}</span>
                    {clues.get(tg.id)!.slice(0, 6).map((x) => (
                      <Button key={x} size="xs" variant="outline" onClick={() => startFrom(tg.id, x)}>{x}</Button>
                    ))}
                  </div>
                )}
                {prev !== undefined && prev !== line.text && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    v{p.version - 1}: <span className="line-through">{prev || "—"}</span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {(written || p.notes) && (
          <Textarea
            placeholder={t({ ja: "根拠・メモ（どの観察からそう考えたか、構文との関係、包含関係の図の説明…）", en: "Evidence and notes: which observation led here, relation to syntax, inclusion diagram…" })}
            defaultValue={p.notes}
            onBlur={(e) => e.target.value !== p.notes && updateCardPayload(card, { notes: e.target.value })}
          />
        )}
      </div>
    </CardShell>
  );
}
