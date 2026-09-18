import { useState } from "react";
import { Link } from "react-router-dom";
import { BookMarked, Check, Loader2, Sparkles } from "lucide-react";
import { CardShell } from "@/components/inquiry/CardShell";
import { ErrorText } from "@/components/inquiry/ErrorText";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { ButtonRow, NavRow } from "@/components/ui/button-row";
import { Textarea } from "@/components/ui/textarea";
import { saveSchemaNote } from "@/lib/actions";
import { updateCardPayload } from "@/lib/db";
import { cardHint } from "@/lib/guide";
import { useT } from "@/lib/i18n";
import { describeError } from "@/lib/llm/client";
import { writingFeedback } from "@/lib/llm/prompts";
import type { Card, Inquiry } from "@/lib/types";

export function SummaryCard({ card, inquiry }: { card: Card<"summary">; inquiry: Inquiry }) {
  const t = useT();
  const p = card.payload;
  const [writing, setWriting] = useState<string[]>(p.writing.length ? p.writing : ["", "", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function feedback() {
    setBusy(true);
    setError(null);
    try {
      const hyp = p.lines.map((l) => `${inquiry.targets.find((x) => x.id === l.targetId)?.label}: ${l.text}${l.uncertain ? " (?)" : ""}`).join("\n");
      const sentences = writing.filter((s) => s.trim());
      const res = await writingFeedback(inquiry.l1, inquiry.l2, inquiry.targets, hyp, sentences);
      await updateCardPayload(card, { writing, feedback: res });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const id = await saveSchemaNote(inquiry, p.lines);
    await updateCardPayload(card, { savedNoteId: id });
  }

  return (
    <CardShell card={card} hint={cardHint(card, inquiry)}>
      <h4 className="mb-1 text-sm font-semibold">{t({ ja: "🧠 わかったこと（最後の仮説）", en: "🧠 What you found (final hypothesis)" })}</h4>
      <div className="space-y-1.5">
        {p.lines.map((l) => {
          const tg = inquiry.targets.find((x) => x.id === l.targetId);
          if (!tg) return null;
          return (
            <div key={l.targetId} className="flex items-start gap-2">
              <TargetBadge target={tg} index={inquiry.targets.indexOf(tg)} />
              <Textarea rows={1} className="min-h-8" value={l.text} onChange={(e) => updateCardPayload(card, { lines: p.lines.map((x) => (x.targetId === l.targetId ? { ...x, text: e.target.value } : x)) })} />
              {l.uncertain && <span className="pt-1.5 text-amber-600">?</span>}
            </div>
          );
        })}
      </div>
      <NavRow className="mt-4">
        {p.savedNoteId ? (
          <Link to="/notes" className="inline-flex items-center gap-1 text-sm text-emerald-700 underline-offset-2 hover:underline"><Check className="size-4" />{t({ ja: "気づきノートに保存済み（見る ▶）", en: "Saved to notes (see ▶)" })}</Link>
        ) : (
          <Button onClick={save}><BookMarked />{t({ ja: "気づきノートに保存", en: "Save to notes" })}</Button>
        )}
      </NavRow>

      {(p.savedNoteId || p.writing.some((x) => x.trim())) && (
        <>
          <h4 className="mt-5 mb-1 text-sm font-semibold">{t({ ja: "✍️ わかったことを使って、自分の場面で書いてみましょう", en: "✍️ Use what you found in your own situations" })}</h4>
          <p className="mb-2 text-xs text-muted-foreground">{t({ ja: "仕事や趣味など、自分が実際に使いそうな場面の文を3つ書いてください。", en: "Write three sentences from situations you would actually use." })}</p>
          <div className="space-y-2">
            {writing.map((w, i) => (
              <div key={i}>
                <Textarea rows={1} lang={inquiry.l2} value={w} onChange={(e) => setWriting(writing.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => updateCardPayload(card, { writing })} placeholder={`${i + 1}. ${inquiry.targets[i % inquiry.targets.length]?.label ?? ""} …`} />
                {p.feedback?.comments.find((c) => c.index === i) && (
                  <p className="mt-1 pl-2 text-sm text-muted-foreground">
                    <Sparkles className="mr-1 inline size-3" />
                    {p.feedback.comments.find((c) => c.index === i)!.comment}
                    <span className="ml-1 text-xs">({p.feedback.comments.find((c) => c.index === i)!.confidence})</span>
                  </p>
                )}
              </div>
            ))}
          </div>
          <ButtonRow className="mt-4">
            <Button size="sm" variant="outline" disabled={busy || !writing.some((s) => s.trim())} onClick={feedback}>
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {t({ ja: "相棒のコメントをもらう", en: "Get partner comments" })}
            </Button>
            <span className="text-xs text-muted-foreground">{t({ ja: "正解・不正解ではなく、根拠と確信度を返します", en: "Evidence and confidence, not verdicts" })}</span>
          </ButtonRow>
        </>
      )}
      <ErrorText code={error} />
    </CardShell>
  );
}
