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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSelectionIn } from "@/hooks/useInquiry";
import { updateCardPayload } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { getLangPack } from "@/lib/langpacks";
import { describeError } from "@/lib/llm/client";
import { extractForPerspective } from "@/lib/llm/prompts";
import { cardHint, markedTargets } from "@/lib/guide";
import { useSettings } from "@/lib/settings";
import type { Card, Inquiry, Mark } from "@/lib/types";

/** Feature tags offered on every item (after the ones already used on the card). */
const tagIdeas = {
  ja: ["意図的", "自然に", "動きあり", "一般論", "願望", "否定", "命令"],
  en: ["on purpose", "naturally", "movement", "general", "wish", "negative", "command"],
};

export function ObservationCard({ card, inquiry, cards }: { card: Card<"observation">; inquiry: Inquiry; cards: Card[] }) {
  const t = useT();
  const { uiLang } = useSettings();
  const p = card.payload;
  const pack = getLangPack(inquiry.l2);
  const ref = useRef<HTMLDivElement>(null);
  const readSel = useSelectionIn(ref);
  const [sel, setSel] = useState<Selection | null>(null);
  const [customPersp, setCustomPersp] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const perspective = pack.perspectives.find((x) => x.id === p.perspective);
  const perspLabel = perspective ? (uiLang === "ja" ? perspective.ja : perspective.en) : p.perspective;
  const usesExamples = perspective ? perspective.usesExamples : true;
  const examples = cards.find((c): c is Card<"examples"> => c.kind === "examples" && c.id === p.examplesCardId);
  const manySets = cards.filter((c) => c.kind === "examples").length > 1;

  // Stages: collect → the comparison table appears → once every target has items, the other views, notes and the AI.
  const comparable = !usesExamples || markedTargets(p).size >= inquiry.targets.length;
  const tagOptions = [...new Set([...p.marks.map((m) => m.tag).filter((x): x is string => !!x), ...tagIdeas[uiLang]])];
  const tagListId = `tags-${card.id}`;

  const marksByTarget = useMemo(() => {
    const m = new Map<string, Mark[]>();
    for (const mk of p.marks) m.set(mk.targetId, [...(m.get(mk.targetId) ?? []), mk]);
    return m;
  }, [p.marks]);

  // Pivot: items shared by several targets vs unique to one.
  const pivot = useMemo(() => {
    const byText = new Map<string, Set<string>>();
    for (const mk of p.marks) {
      const k = mk.text.toLowerCase();
      byText.set(k, (byText.get(k) ?? new Set()).add(mk.targetId));
    }
    const shared = [...byText.entries()].filter(([, s]) => s.size > 1).map(([k]) => k);
    const unique = inquiry.targets.map((tg) => ({
      target: tg,
      items: [...byText.entries()].filter(([, s]) => s.size === 1 && s.has(tg.id)).map(([k]) => k),
    }));
    return { shared, unique };
  }, [p.marks, inquiry.targets]);

  const tagSummary = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const mk of p.marks) {
      if (!mk.tag) continue;
      const row = m.get(mk.tag) ?? new Map();
      row.set(mk.targetId, (row.get(mk.targetId) ?? 0) + 1);
      m.set(mk.tag, row);
    }
    return m;
  }, [p.marks]);

  function addMark() {
    if (!sel) return;
    const mk: Mark = { id: nanoid(6), sentenceKey: sel.sentenceKey, targetId: sel.targetId, text: sel.text, side: sel.side };
    updateCardPayload(card, { marks: [...p.marks, mk] });
    window.getSelection()?.removeAllRanges();
    setSel(null);
  }

  function setTag(id: string, tag: string) {
    updateCardPayload(card, { marks: p.marks.map((m) => (m.id === id ? { ...m, tag } : m)) });
  }

  async function askAi() {
    if (!examples) return;
    setBusy(true);
    setError(null);
    try {
      const sets = examples.payload.sets.map((s) => ({ target: inquiry.targets.find((x) => x.id === s.targetId)!, sentences: s.sentences }));
      const { extraction } = await extractForPerspective(inquiry.l1, inquiry.l2, perspLabel, sets);
      const aiExtraction = extraction.map((e) => ({
        targetId: inquiry.targets.find((x) => x.label.toLowerCase() === e.target.toLowerCase())?.id ?? e.target,
        items: e.items,
      }));
      await updateCardPayload(card, { aiExtraction, aiRevealed: true });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CardShell card={card} title={perspLabel} hint={!usesExamples || examples ? cardHint(card, inquiry) : undefined}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t({ ja: "見るポイント", en: "What to look at" })}</span>
        <Select
          items={[...pack.perspectives.map((x) => ({ value: x.id, label: uiLang === "ja" ? x.ja : x.en })), ...(perspective ? [] : [{ value: p.perspective, label: p.perspective }])]}
          value={p.perspective}
          onValueChange={(v) => {
            if (!v) return;
            updateCardPayload(card, { perspective: v });
          }}
        >
          <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {pack.perspectives.map((x) => (
              <SelectItem key={x.id} value={x.id}>{uiLang === "ja" ? x.ja : x.en}</SelectItem>
            ))}
            {!perspective && <SelectItem value={p.perspective}>{p.perspective}</SelectItem>}
          </SelectContent>
        </Select>
        {customOpen ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (customPersp.trim()) updateCardPayload(card, { perspective: customPersp.trim() });
              setCustomPersp("");
              setCustomOpen(false);
            }}
          >
            <Input
              autoFocus
              className="h-7 w-40 text-sm"
              placeholder={t({ ja: "自分で決めたポイント（Enterで決定）", en: "Your own point (press Enter)" })}
              value={customPersp}
              onChange={(e) => setCustomPersp(e.target.value)}
              // clicking away commits too, so what was typed is never silently thrown away
              onBlur={() => {
                if (customPersp.trim()) updateCardPayload(card, { perspective: customPersp.trim() });
                setCustomPersp("");
                setCustomOpen(false);
              }}
            />
          </form>
        ) : (
          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setCustomOpen(true)}>{t({ ja: "✏️ 自分で決める", en: "✏️ Write my own" })}</Button>
        )}
        {p.marks.length === 0 && <span className="text-xs text-muted-foreground">{t({ ja: "おすすめのポイントを選んであります。", en: "A suggested point is preselected." })}</span>}
        {usesExamples && manySets && <ExamplesPicker cards={cards} inquiry={inquiry} value={p.examplesCardId} onChange={(id) => updateCardPayload(card, { examplesCardId: id })} />}
      </div>

      {usesExamples && examples && (
        <div ref={ref} onMouseUp={() => setSel(readSel())} onTouchEnd={() => setSel(readSel())} onKeyUp={() => setSel(readSel())}>
          <SelectionBar sel={sel} onAdd={addMark} />
          <div className="grid gap-4 md:grid-cols-2">
            {examples.payload.sets.map((set) => {
              const target = inquiry.targets.find((x) => x.id === set.targetId);
              if (!target) return null;
              return (
                <div key={set.targetId} className="min-w-0">
                  <TargetBadge target={target} index={inquiry.targets.indexOf(target)} className="mb-1" />
                  <ol className="divide-y rounded-lg border bg-background px-2">
                    {set.sentences.map((s, i) => (
                      <SentenceView key={i} s={s} index={i} l1={inquiry.l1} l2={inquiry.l2} targetId={set.targetId} showGuides={false} showTranslation />
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {usesExamples && !examples && <p className="text-sm text-muted-foreground">{t({ ja: "先に例文セットを出力してください。", en: "Generate an example set first." })}</p>}

      {p.marks.length > 0 && (
        <>
          <h4 className="mt-4 mb-1 text-sm font-semibold">{t({ ja: "📊 比較表", en: "📊 Comparison table" })}</h4>
          <Tabs defaultValue="list">
            <TabsList className={comparable ? undefined : "hidden"}>
              <TabsTrigger value="list">{t({ ja: "対象ごと", en: "By target" })}</TabsTrigger>
              <TabsTrigger value="pivot">{t({ ja: "共通／固有", en: "Shared / unique" })}</TabsTrigger>
              <TabsTrigger value="tags">{t({ ja: "タグ別", en: "By tag" })}</TabsTrigger>
            </TabsList>
            <TabsContent value="list">
              <div className="grid gap-3 md:grid-cols-2">
                {inquiry.targets.map((tg, ti) => (
                  <div key={tg.id} className="rounded-lg border bg-background p-2">
                    <TargetBadge target={tg} index={ti} className="mb-1" />
                    <ul className="space-y-1">
                      {(marksByTarget.get(tg.id) ?? []).map((mk) => (
                        <li key={mk.id} className="flex items-center gap-1.5 text-sm">
                          <span className="font-medium">{mk.text}</span>
                          <Input
                            className="h-6 w-28 text-xs"
                            list={tagListId}
                            placeholder={t({ ja: "特徴タグ", en: "tag" })}
                            defaultValue={mk.tag ?? ""}
                            onBlur={(e) => e.target.value !== (mk.tag ?? "") && setTag(mk.id, e.target.value)}
                          />
                          <button className="text-muted-foreground hover:text-foreground" aria-label="remove" onClick={() => updateCardPayload(card, { marks: p.marks.filter((m) => m.id !== mk.id) })}>
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                      {!(marksByTarget.get(tg.id) ?? []).length && <li className="text-xs text-muted-foreground">—</li>}
                    </ul>
                    {p.aiRevealed && p.aiExtraction && (
                      <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                        <div className="mb-0.5 flex items-center gap-1"><Sparkles className="size-3" />{t({ ja: "AIの抽出", en: "AI extraction" })}</div>
                        {(p.aiExtraction.find((x) => x.targetId === tg.id)?.items ?? []).join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="pivot">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border bg-background p-2">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{t({ ja: "🔗 複数の対象に共通", en: "🔗 Shared" })}</div>
                  <div className="text-sm">{pivot.shared.join(" · ") || "—"}</div>
                </div>
                {pivot.unique.map((u, ti) => (
                  <div key={u.target.id} className="rounded-lg border bg-background p-2">
                    <TargetBadge target={u.target} index={ti} className="mb-1" />
                    <div className="text-xs text-muted-foreground">{t({ ja: "この対象だけ", en: "Unique" })}</div>
                    <div className="text-sm">{u.items.join(" · ") || "—"}</div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="tags">
              {tagSummary.size === 0 ? (
                <p className="text-sm text-muted-foreground">{t({ ja: "項目に特徴タグ（動きあり／一般論／願望 など）を付けると、ここに集計されます。", en: "Add tags to items (e.g. moving / general / wish) to see counts here." })}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2">{t({ ja: "タグ", en: "Tag" })}</th>
                      {inquiry.targets.map((tg) => <th key={tg.id} className="py-1 pr-2">{tg.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {[...tagSummary.entries()].map(([tag, row]) => (
                      <tr key={tag} className="border-t">
                        <td className="py-1 pr-2 font-medium">{tag}</td>
                        {inquiry.targets.map((tg) => <td key={tg.id} className="py-1 pr-2 tabular-nums">{row.get(tg.id) ?? 0}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TabsContent>
          </Tabs>
          {comparable && <p className="mt-2 text-xs text-muted-foreground">{t({ ja: "「意図的」「自然に」のような特徴タグを付けると、「タグ別」で数を比べられます。", en: "Tag items (e.g. 'on purpose', 'naturally') to count them under \"By tag\"." })}</p>}
          <datalist id={tagListId}>{tagOptions.map((x) => <option key={x} value={x} />)}</datalist>
        </>
      )}

      {(comparable || p.notes) && (
        <Textarea
          className="mt-3"
          placeholder={t({ ja: "気づきメモ（表を見て気づいたこと、母語ではどう分けているか…）", en: "Notes: what you noticed, how your language divides it…" })}
          defaultValue={p.notes}
          onBlur={(e) => e.target.value !== p.notes && updateCardPayload(card, { notes: e.target.value })}
        />
      )}
      {usesExamples && examples && comparable && !p.aiRevealed && (
        <ButtonRow className="mt-4">
          <Button size="sm" variant="outline" disabled={busy} onClick={askAi}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {t({ ja: "AIにも抽出させて比べる", en: "Let the AI extract too, then compare" })}
          </Button>
        </ButtonRow>
      )}
      <ErrorText code={error} />
    </CardShell>
  );
}
