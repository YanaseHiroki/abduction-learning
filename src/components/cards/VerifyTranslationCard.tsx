import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Play } from "lucide-react";
import { CardShell } from "@/components/inquiry/CardShell";
import { ErrorText } from "@/components/inquiry/ErrorText";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteCard, updateCardPayload } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { describeError } from "@/lib/llm/client";
import { translateTest } from "@/lib/llm/prompts";
import { useSettings } from "@/lib/settings";
import { circled, markersIn } from "@/lib/text";
import { speak, hasVoiceFor } from "@/lib/tts";
import type { Card, Inquiry } from "@/lib/types";
import { cn } from "@/lib/utils";

const NONE = "__none";

export function VerifyTranslationCard({ card, inquiry }: { card: Card<"verify_translation">; inquiry: Inquiry }) {
  const t = useT();
  const { ttsRate } = useSettings();
  const p = card.payload;
  const [text, setText] = useState(p.l1Text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const cursor = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (cursor.current === null || !ta.current) return;
    ta.current.focus();
    ta.current.setSelectionRange(cursor.current, cursor.current);
    cursor.current = null;
  }, [text]);
  const markers = useMemo(() => markersIn(text), [text]);
  const predictions = new Map(p.markers.map((m) => [m.index, m.predictedTargetId]));
  const ready = markers.length > 0 && markers.every((i) => predictions.get(i));
  const dirty = text !== p.l1Text;

  function insertMarker() {
    const next = circled[markers.length] ?? circled[9];
    const el = ta.current;
    if (!el) return;
    const start = el.selectionStart ?? text.length;
    const nt = text.slice(0, start) + next + text.slice(start);
    cursor.current = start + 1;
    setText(nt);
    updateCardPayload(card, { l1Text: nt });
  }

  function setPrediction(index: number, targetId: string | null) {
    const others = p.markers.filter((m) => m.index !== index);
    updateCardPayload(card, { markers: [...others, { index, predictedTargetId: targetId }].sort((a, b) => a.index - b.index) });
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await translateTest({
        l1: inquiry.l1,
        l2: inquiry.l2,
        l1Text: text,
        targets: inquiry.targets,
        restrictToTargets: p.restrictToTargets,
        fixedGloss: p.fixedGloss,
        feasibilityTarget: inquiry.targets.find((x) => x.id === p.feasibilityTargetId) ?? null,
      });
      const alignments = res.alignments.map((a) => ({
        index: a.index,
        word: a.word,
        targetId: inquiry.targets.find((x) => a.word.toLowerCase().includes(x.label.split(" ")[0].toLowerCase().replace(/e$/, "")))?.id ?? null,
      }));
      const result = { l2Text: res.l2_text, alignments, note: res.note, meta: res.meta };
      await updateCardPayload(card, {
        l1Text: text,
        result,
        revealed: true,
        history: p.result ? [...p.history, { l1Text: p.l1Text, result: p.result }] : p.history,
      });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CardShell kind="verify_translation" id={card.id} createdAt={card.createdAt} onDelete={() => deleteCard(card.id)}>
      <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-sm text-muted-foreground">
        <li>{t({ ja: "仮説を試す母語の文を書く（会話形式や、1文に複数回でもOK）", en: "Write a sentence in your language that tests the hypothesis" })}</li>
        <li>{t({ ja: "対象になる語の直前に ①②③ を入れ、どの語が出るかを予想する", en: "Insert ①②③ before each target expression and predict the word" })}</li>
        <li>{t({ ja: "翻訳させて、予想と比べる", en: "Translate and compare" })}</li>
      </ol>
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        <div>
          <Textarea
            ref={ta}
            rows={4}
            lang={inquiry.l1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => dirty && updateCardPayload(card, { l1Text: text })}
            placeholder={t({ ja: "例: 嫌な意見も①聞くべきだし、噂は自然と②聞こえてくる。", en: "e.g. You should ①listen to harsh opinions; rumors just ②reach your ears." })}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Button size="xs" variant="outline" onClick={insertMarker}>{t({ ja: `${circled[markers.length] ?? "①"} を挿入`, en: `Insert ${circled[markers.length] ?? "①"}` })}</Button>
            <span className="text-xs text-muted-foreground">{t({ ja: "カーソル位置に番号を入れます", en: "Inserts at the cursor" })}</span>
          </div>
          {markers.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {markers.map((i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-lg leading-none">{circled[i - 1]}</span>
                  <span className="text-muted-foreground">{t({ ja: "予想:", en: "predict:" })}</span>
                  <Select items={[{ value: NONE, label: "—" }, ...inquiry.targets.map((x) => ({ value: x.id, label: x.label }))]} value={predictions.get(i) ?? NONE} onValueChange={(v) => setPrediction(i, v === NONE ? null : v)}>
                    <SelectTrigger size="sm" className="w-44"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {inquiry.targets.map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-3 rounded-lg border p-3 text-sm">
          <label className="flex items-center justify-between gap-2">
            <span>{t({ ja: "候補語を限定する", en: "Restrict to candidates" })}</span>
            <Switch size="sm" checked={p.restrictToTargets} onCheckedChange={(v) => updateCardPayload(card, { restrictToTargets: v })} />
          </label>
          <div className="grid gap-1">
            <Label className="text-xs">{t({ ja: "訳語を固定（例: 思う）", en: "Fixed gloss (e.g. 'think')" })}</Label>
            <Input className="h-7" defaultValue={p.fixedGloss} onBlur={(e) => e.target.value !== p.fixedGloss && updateCardPayload(card, { fixedGloss: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">{t({ ja: "可否質問「この語で訳せる？」", en: "Feasibility: can it use…?" })}</Label>
            <Select items={[{ value: NONE, label: t({ ja: "なし", en: "none" }) }, ...inquiry.targets.map((x) => ({ value: x.id, label: x.label }))]} value={p.feasibilityTargetId ?? NONE} onValueChange={(v) => updateCardPayload(card, { feasibilityTargetId: v === NONE ? null : v })}>
              <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t({ ja: "なし", en: "none" })}</SelectItem>
                {inquiry.targets.map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" disabled={busy || !ready} onClick={run}>
            {busy ? <Loader2 className="animate-spin" /> : <Play />}
            {p.result ? t({ ja: "もう一度翻訳させる", en: "Translate again" }) : t({ ja: "翻訳させる", en: "Translate" })}
          </Button>
          {!ready && <p className="text-xs text-muted-foreground">{t({ ja: "番号を入れて、すべてに予想を付けると実行できます。", en: "Add markers and predict each one to run." })}</p>}
        </div>
      </div>
      <ErrorText code={error} />
      {p.result && (
        <div className="mt-4 rounded-lg bg-muted/40 p-3">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-[15px] leading-7" lang={inquiry.l2}>{p.result.l2Text}</p>
            {hasVoiceFor(inquiry.l2) && <Button size="icon-sm" variant="ghost" onClick={() => speak(p.result!.l2Text, inquiry.l2, ttsRate)}>▶</Button>}
          </div>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1"></th><th className="py-1">{t({ ja: "予想", en: "Predicted" })}</th><th className="py-1">{t({ ja: "実際", en: "Actual" })}</th><th className="py-1"></th></tr></thead>
            <tbody>
              {p.result.alignments.map((a) => {
                const pred = inquiry.targets.find((x) => x.id === predictions.get(a.index));
                const match = pred && a.targetId === pred.id;
                return (
                  <tr key={a.index} className="border-t">
                    <td className="py-1 text-lg leading-none">{circled[a.index - 1]}</td>
                    <td className="py-1">{pred ? <TargetBadge target={pred} index={inquiry.targets.indexOf(pred)} /> : "—"}</td>
                    <td className="py-1 font-medium">{a.word}</td>
                    <td className={cn("py-1 text-xs font-semibold", match ? "text-emerald-600" : "text-rose-600")}>
                      {match ? t({ ja: "一致", en: "match" }) : t({ ja: "不一致 → 仮説を見直す材料", en: "mismatch → revisit the hypothesis" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {p.result.note && (
            <Collapsible className="mt-2">
              <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground"><ChevronDown className="size-3" />{t({ ja: "AIの補足を見る", en: "Show the AI's note" })}</CollapsibleTrigger>
              <CollapsibleContent className="mt-1 text-sm">{p.result.note}</CollapsibleContent>
            </Collapsible>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{p.result.meta.model}</p>
        </div>
      )}
      {p.history.length > 0 && (
        <Collapsible className="mt-2">
          <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground"><ChevronDown className="size-3" />{t({ ja: `過去の試行 (${p.history.length})`, en: `Previous attempts (${p.history.length})` })}</CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-2 text-sm">
            {p.history.map((h, i) => (
              <div key={i} className="rounded border p-2">
                <div className="text-muted-foreground">{h.l1Text}</div>
                <div>{h.result.l2Text}</div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </CardShell>
  );
}
