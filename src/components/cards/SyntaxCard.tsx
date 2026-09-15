import { useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { nanoid } from "nanoid";
import { CardShell } from "@/components/inquiry/CardShell";
import { ExamplesPicker } from "@/components/inquiry/ExamplesPicker";
import { SelectionBar, type Selection } from "@/components/inquiry/SelectionBar";
import { SentenceView } from "@/components/inquiry/SentenceView";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { useSelectionIn } from "@/hooks/useInquiry";
import { deleteCard, updateCardPayload } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { getLangPack } from "@/lib/langpacks";
import { describeError } from "@/lib/llm/client";
import { analyzeSyntax } from "@/lib/llm/prompts";
import { useSettings } from "@/lib/settings";
import { sentenceKey } from "@/lib/text";
import type { Card, Inquiry } from "@/lib/types";

export function SyntaxCard({ card, inquiry, cards }: { card: Card<"syntax">; inquiry: Inquiry; cards: Card[] }) {
  const t = useT();
  const { uiLang } = useSettings();
  const p = card.payload;
  const roles = getLangPack(inquiry.l2).syntaxRoles;
  const ref = useRef<HTMLDivElement>(null);
  const readSel = useSelectionIn(ref);
  const [sel, setSel] = useState<Selection | null>(null);
  const [role, setRole] = useState(roles[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const examples = cards.find((c): c is Card<"examples"> => c.kind === "examples" && c.id === p.examplesCardId);

  function addElement() {
    if (!sel) return;
    const list = p.analyses[sel.sentenceKey] ?? [];
    updateCardPayload(card, { analyses: { ...p.analyses, [sel.sentenceKey]: [...list, { id: nanoid(6), role, text: sel.text }] } });
    window.getSelection()?.removeAllRanges();
    setSel(null);
  }

  function patternOf(key: string) {
    if (p.patterns[key]) return p.patterns[key];
    return (p.analyses[key] ?? []).map((e) => e.role).join(" ");
  }

  const summary = useMemo(() => {
    const m = new Map<string, Map<string, number>>(); // targetId -> pattern -> count
    if (!examples) return m;
    for (const set of examples.payload.sets) {
      set.sentences.forEach((_, i) => {
        const key = sentenceKey(set.targetId, i);
        const pat = patternOf(key);
        if (!pat) return;
        const row = m.get(set.targetId) ?? new Map();
        row.set(pat, (row.get(pat) ?? 0) + 1);
        m.set(set.targetId, row);
      });
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.analyses, p.patterns, examples]);

  async function askAi() {
    if (!examples) return;
    setBusy(true);
    setError(null);
    try {
      const out: NonNullable<typeof p.aiAnalysis> = {};
      for (const set of examples.payload.sets) {
        const target = inquiry.targets.find((x) => x.id === set.targetId)!;
        const { analyses } = await analyzeSyntax(inquiry.l1, inquiry.l2, target, set.sentences, roles.map((r) => ({ id: r.id, label: r.en })));
        for (const a of analyses) out[sentenceKey(set.targetId, a.sentence_index)] = { elements: a.elements, pattern: a.pattern };
      }
      await updateCardPayload(card, { aiAnalysis: out, aiRevealed: true });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  const taggedCount = Object.values(p.analyses).filter((l) => l.length).length;

  return (
    <CardShell kind="syntax" id={card.id} createdAt={card.createdAt} onDelete={() => deleteCard(card.id)}>
      <div className="mb-3">
        <ExamplesPicker cards={cards} inquiry={inquiry} value={p.examplesCardId} onChange={(id) => updateCardPayload(card, { examplesCardId: id })} />
      </div>
      {examples ? (
        <div ref={ref} onMouseUp={() => setSel(readSel())} onTouchEnd={() => setSel(readSel())}>
          <SelectionBar
            sel={sel}
            onAdd={addElement}
            extra={
              <ToggleGroup size="sm" value={[role]} onValueChange={(v) => v[0] && setRole(v[0])} className="flex-wrap">
                {roles.map((r) => (
                  <ToggleGroupItem key={r.id} value={r.id} className="px-2 text-xs">{r.id}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            }
          />
          <div className="grid gap-4 md:grid-cols-2">
            {examples.payload.sets.map((set) => {
              const target = inquiry.targets.find((x) => x.id === set.targetId);
              if (!target) return null;
              return (
                <div key={set.targetId} className="min-w-0">
                  <TargetBadge target={target} index={inquiry.targets.indexOf(target)} className="mb-1" />
                  <ol className="divide-y">
                    {set.sentences.map((s, i) => {
                      const key = sentenceKey(set.targetId, i);
                      const els = p.analyses[key] ?? [];
                      const ai = p.aiRevealed ? p.aiAnalysis?.[key] : null;
                      return (
                        <div key={i}>
                          <SentenceView s={s} index={i} l1={inquiry.l1} l2={inquiry.l2} targetId={set.targetId} showGuides={false} showTranslation={false} />
                          {(els.length > 0 || ai) && (
                            <div className="mb-2 space-y-1 pl-9 text-xs">
                              <div className="flex flex-wrap items-center gap-1">
                                {els.map((e) => (
                                  <span key={e.id} className="inline-flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5">
                                    <b className="font-mono">{e.role}</b> {e.text}
                                    <button aria-label="remove" onClick={() => updateCardPayload(card, { analyses: { ...p.analyses, [key]: els.filter((x) => x.id !== e.id) } })}><X className="size-3" /></button>
                                  </span>
                                ))}
                                {els.length > 0 && (
                                  <Input
                                    className="h-6 w-40 font-mono text-xs"
                                    placeholder={t({ ja: "パターン名", en: "pattern" })}
                                    defaultValue={p.patterns[key] ?? ""}
                                    onBlur={(e) => e.target.value !== (p.patterns[key] ?? "") && updateCardPayload(card, { patterns: { ...p.patterns, [key]: e.target.value } })}
                                  />
                                )}
                              </div>
                              {ai && (
                                <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                                  <Sparkles className="size-3" />
                                  {ai.elements.map((e, j) => <span key={j}><b className="font-mono">{e.role}</b> {e.text}</span>)}
                                  <span className="font-mono">→ {ai.pattern}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
          <h4 className="mt-4 mb-1 text-sm font-semibold">{t({ ja: "構造パターン集計", en: "Pattern summary" })}</h4>
          <div className="grid gap-3 md:grid-cols-2">
            {inquiry.targets.map((tg, ti) => (
              <div key={tg.id} className="rounded-lg border p-2 text-sm">
                <TargetBadge target={tg} index={ti} className="mb-1" />
                <ul>
                  {[...(summary.get(tg.id) ?? new Map()).entries()].map(([pat, n]) => (
                    <li key={pat} className="flex justify-between"><span className="font-mono">{pat}</span><span className="tabular-nums text-muted-foreground">×{n}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t({ ja: "先に例文セットを出力してください。", en: "Generate an example set first." })}</p>
      )}
      <Textarea className="mt-3" placeholder={t({ ja: "構造について気づいたこと（目的語をとる／とらない、that節、前置詞…）", en: "Notes on structure (takes an object or not, that-clause, prepositions…)" })} defaultValue={p.notes} onBlur={(e) => e.target.value !== p.notes && updateCardPayload(card, { notes: e.target.value })} />
      {examples && !p.aiRevealed && (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy || taggedCount === 0} onClick={askAi}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {t({ ja: "AIの分析を見る", en: "Show the AI's analysis" })}
          </Button>
          {taggedCount === 0 && <span className="text-xs text-muted-foreground">{t({ ja: "まず自分でタグ付けしてから", en: "Tag at least one sentence first" })}</span>}
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <p className="mt-2 text-xs text-muted-foreground">{uiLang === "ja" ? "役割: " : "Roles: "}{roles.map((r) => `${r.id}=${uiLang === "ja" ? r.ja : r.en}`).join("、 ")}</p>
    </CardShell>
  );
}
