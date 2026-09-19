import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/lib/i18n";
import { describeError, setActiveInquiry } from "@/lib/llm/client";
import { consultTargets, type ConsultReply, type ConsultTurn } from "@/lib/llm/prompts";
import type { Target } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ErrorText } from "./ErrorText";
import { FreeTierFullNote } from "./FreeTierFullNote";
import { NoCredentialNote } from "./NoCredentialNote";
import { targetColor } from "./target-color";

export type ConsultedTargets = Omit<Target, "id">[];

/**
 * A chat for learners who do not know which words to compare yet. It ends by handing a combination to
 * the new-inquiry dialog, together with the inquiry id the chat's AI calls were charged to: the free tier
 * counts per inquiry, so the consultation and the inquiry it leads to cost one of today's inquiries, not two.
 */
export function ConsultDialog({
  l1,
  l2,
  open,
  onOpenChange,
  onStart,
}: {
  l1: string;
  l2: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onStart: (targets: ConsultedTargets, inquiryId: string) => void;
}) {
  const t = useT();
  const [inquiryId] = useState(() => nanoid(10));
  const [turns, setTurns] = useState<(ConsultTurn & { suggestion?: ConsultReply["suggestion"] })[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveInquiry(inquiryId);
    return () => setActiveInquiry(null);
  }, [inquiryId]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [turns, busy]);

  // The opening question always has the same shape, so the learner only types the words it is about.
  // Later turns answer the AI's follow-up questions, which that shape would not fit, so they stay free text.
  const opening = turns.length === 0;
  const suffix = t({ ja: "はどう言い分ければいい？", en: ": how do I say it in different ways?" });

  async function send() {
    const typed = draft.trim();
    if (!typed || busy) return;
    const text = opening ? `${typed}${suffix}` : typed;
    const history = [...turns, { role: "learner" as const, text }];
    setTurns(history);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const { data } = await consultTargets(l1, l2, history.map(({ role, text }) => ({ role, text })));
      setTurns([...history, { role: "assistant", text: data.reply, suggestion: data.suggestion && data.suggestion.length >= 2 ? data.suggestion.slice(0, 4) : null }]);
    } catch (e) {
      setError(describeError(e));
      // Give the message back so it can be sent again as it was.
      setTurns(turns);
      setDraft(typed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t({ ja: "💬 相談して決める", en: "💬 Decide in a chat" })}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {t({
              ja: "言いたいことや、迷っていることばを書いてください。\n比べるとよい組み合わせを一緒に考えます。違いの答えは教えませんよ。",
              en: "Write what you want to say, or which words confuse you.\nWe will work out a combination worth comparing together. I will not tell you how they differ, though.",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-24 gap-3 overflow-y-auto" aria-live="polite">
          {turns.map((x, i) => (
            <div key={i} className={cn("grid gap-2", x.role === "learner" && "justify-items-end")}>
              <p lang={l1} className={cn("max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-line", x.role === "learner" ? "bg-primary text-primary-foreground" : "bg-muted")}>{x.text}</p>
              {x.suggestion && (
                <div className="grid max-w-[85%] gap-2 rounded-xl border p-3">
                  <div className="flex flex-wrap gap-2">
                    {x.suggestion.map((s, j) => (
                      <span key={j} lang={l2} className={cn("rounded-lg border px-3 py-1 text-base", targetColor(j))}>{s.label}</span>
                    ))}
                  </div>
                  <Button size="sm" onClick={() => onStart(x.suggestion!, inquiryId)}>{t({ ja: "🚀 この組み合わせで始める", en: "🚀 Start with these" })}</Button>
                </div>
              )}
            </div>
          ))}
          {busy && <p className="text-sm text-muted-foreground">{t({ ja: "考えています…", en: "Thinking…" })}</p>}
          <div ref={bottom} />
        </div>

        {error && <ErrorText code={error} className="text-sm text-destructive" />}
        <FreeTierFullNote active={open} />
        <NoCredentialNote />
        <DialogFooter>
          <form className="flex w-full items-end gap-2" onSubmit={(e) => { e.preventDefault(); void send(); }}>
            {opening ? (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Input
                  lang={l1}
                  className="min-w-32 flex-1"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t({ ja: "例: 「思う」", en: "e.g. 'think'" })}
                  aria-label={t({ ja: "言い分けを知りたいことば", en: "The word you want to say in different ways" })}
                />
                {/* Wraps on a phone rather than squeezing the box the learner types in. */}
                <span className="min-w-0 text-sm text-muted-foreground">{suffix}</span>
              </div>
            ) : (
              <Textarea
                lang={l1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                // Enter sends; Shift+Enter and IME confirmation do not.
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }}
              />
            )}
            <Button type="submit" size="icon" className="shrink-0" disabled={busy || !draft.trim()} aria-label={t({ ja: "送信", en: "Send" })}><Send /></Button>
          </form>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
