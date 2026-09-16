import { useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { nanoid } from "nanoid";
import { CardShell } from "@/components/inquiry/CardShell";
import { ErrorText } from "@/components/inquiry/ErrorText";
import { ExamplesPicker } from "@/components/inquiry/ExamplesPicker";
import { SelectionBar, type Selection } from "@/components/inquiry/SelectionBar";
import { SentenceView } from "@/components/inquiry/SentenceView";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { Input } from "@/components/ui/input";
import { Recommended } from "@/components/ui/recommended";
import { Textarea } from "@/components/ui/textarea";
import { useSelectionIn } from "@/hooks/useInquiry";
import { updateCardPayload } from "@/lib/db";
import { cardHint, suggestRole, taggedTargets } from "@/lib/guide";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const examples = cards.find((c): c is Card<"examples"> => c.kind === "examples" && c.id === p.examplesCardId);
  const manySets = cards.filter((c) => c.kind === "examples").length > 1;

  // Stages: pick words → the pattern summary appears → once every target has a pattern, notes and the AI's analysis.
  const tagged = taggedTargets(p);
  const comparable = tagged.size >= inquiry.targets.length;

  // The role the selection most likely plays, from the object / phrase spans the examples already carry.
  const suggested = useMemo(() => {
    if (!sel || !examples) return null;
    const i = Number(sel.sentenceKey.slice(sel.sentenceKey.lastIndexOf(":") + 1));
    const s = examples.payload.sets.find((x) => x.targetId === sel.targetId)?.sentences[i];
    return s ? suggestRole(s, sel.text, roles.map((r) => r.id)) : null;
  }, [sel, examples, roles]);

  const roleLabel = (r: (typeof roles)[number]) => {
    const name = uiLang === "ja" ? r.ja : r.en;
    // "S 主語" already carries its abbreviation; "主語" or "that節" gets the id the pattern summary uses.
    return /^\S{1,3} /.test(name) ? name : `${r.id} ${name}`;
  };

  function addElement(role: string) {
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

  return (
    <CardShell card={card} hint={examples ? cardHint(card, inquiry) : undefined}>
      {manySets && (
        <div className="mb-3">
          <ExamplesPicker cards={cards} inquiry={inquiry} value={p.examplesCardId} onChange={(id) => updateCardPayload(card, { examplesCardId: id })} />
        </div>
      )}
      {examples ? (
        <div ref={ref} onMouseUp={() => setSel(readSel())} onTouchEnd={() => setSel(readSel())} onKeyUp={() => setSel(readSel())}>
          <SelectionBar sel={sel} hint={{ ja: "例文の中の語句（動詞の後ろの部分など）をなぞって選ぶと、ここに役割のボタンが出ます。", en: "Select words in a sentence (e.g. what follows the verb) to get role buttons here." }}>
            <span className="text-muted-foreground">{t({ ja: "役割は？", en: "Role?" })}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-3 pt-1">
              {[...roles].sort((x, y) => Number(y.id === suggested) - Number(x.id === suggested)).map((r) =>
                r.id === suggested ? (
                  <Recommended key={r.id} className="mr-3"><Button size="xs" variant="recommended" onClick={() => addElement(r.id)}>{roleLabel(r)}</Button></Recommended>
                ) : (
                  <Button key={r.id} size="xs" variant="outline" onClick={() => addElement(r.id)}>{roleLabel(r)}</Button>
                ),
              )}
            </div>
          </SelectionBar>
          <div className="grid gap-4 md:grid-cols-2">
            {examples.payload.sets.map((set) => {
              const target = inquiry.targets.find((x) => x.id === set.targetId);
              if (!target) return null;
              return (
                <div key={set.targetId} className="min-w-0">
                  <TargetBadge target={target} index={inquiry.targets.indexOf(target)} className="mb-1" />
                  <ol className="divide-y rounded-lg border bg-background px-2">
                    {set.sentences.map((s, i) => {
                      const key = sentenceKey(set.targetId, i);
                      const els = p.analyses[key] ?? [];
                      const ai = p.aiRevealed ? p.aiAnalysis?.[key] : null;
                      const auto = els.map((e) => e.role).join(" ");
                      return (
                        <div key={i}>
                          <SentenceView s={s} index={i} l1={inquiry.l1} l2={inquiry.l2} targetId={set.targetId} showGuides={false} showTranslation={false} />
                          {(els.length > 0 || ai) && (
                            <div className="mb-2 space-y-1 pl-9 text-xs">
                              <div className="flex flex-wrap items-center gap-1">
                                {els.map((e) => (
                                  <span key={e.id} className="inline-flex items-center gap-1 rounded border bg-background px-1.5 py-0.5">
                                    <b className="font-mono">{e.role}</b> {e.text}
                                    <button aria-label="remove" onClick={() => updateCardPayload(card, { analyses: { ...p.analyses, [key]: els.filter((x) => x.id !== e.id) } })}><X className="size-3" /></button>
                                  </span>
                                ))}
                                {els.length > 0 && (
                                  <Input
                                    className="h-6 w-40 font-mono text-xs"
                                    title={t({ ja: "型の名前。空欄なら役割の並びを使います", en: "Pattern name. Empty uses the role order" })}
                                    placeholder={auto}
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
          {tagged.size > 0 && (
            <>
              <h4 className="mt-4 mb-1 text-sm font-semibold">{t({ ja: "📐 構造パターン集計", en: "📐 Pattern summary" })}</h4>
              <p className="mb-2 text-xs text-muted-foreground">{t({ ja: "役割の並びがそのまま型になります。名前を付けたいときは、各文の横の欄に書きます。", en: "The role order is the pattern. To name it, type in the box next to each sentence." })}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {inquiry.targets.map((tg, ti) => (
                  <div key={tg.id} className="rounded-lg border bg-background p-2 text-sm">
                    <TargetBadge target={tg} index={ti} className="mb-1" />
                    <ul>
                      {[...(summary.get(tg.id) ?? new Map()).entries()].map(([pat, n]) => (
                        <li key={pat} className="flex justify-between"><span className="font-mono">{pat}</span><span className="tabular-nums text-muted-foreground">×{n}</span></li>
                      ))}
                      {!summary.get(tg.id)?.size && <li className="text-xs text-muted-foreground">—</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t({ ja: "先に例文セットを出力してください。", en: "Generate an example set first." })}</p>
      )}
      {(comparable || p.notes) && (
        <Textarea className="mt-3" placeholder={t({ ja: "構造について気づいたこと（目的語をとる／とらない、that節、前置詞…）", en: "Notes on structure (takes an object or not, that-clause, prepositions…)" })} defaultValue={p.notes} onBlur={(e) => e.target.value !== p.notes && updateCardPayload(card, { notes: e.target.value })} />
      )}
      {examples && comparable && !p.aiRevealed && (
        <ButtonRow className="mt-4">
          <Button size="sm" variant="outline" disabled={busy} onClick={askAi}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {t({ ja: "AIの分析を見て比べる", en: "Compare with the AI's analysis" })}
          </Button>
        </ButtonRow>
      )}
      <ErrorText code={error} />
    </CardShell>
  );
}
