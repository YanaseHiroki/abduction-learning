import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Recommended } from "@/components/ui/recommended";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { sendFeedback, type FeedbackKind } from "@/lib/llm/client";
import { useT, type Localized } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";

const kinds: { value: FeedbackKind; label: Localized }[] = [
  { value: "usage", label: { ja: "🤔 使い方が分からない", en: "🤔 How do I…?" } },
  { value: "bug", label: { ja: "🐞 うまく動かない", en: "🐞 Something's broken" } },
  { value: "request", label: { ja: "💡 こうしてほしい", en: "💡 Suggestion" } },
  { value: "other", label: { ja: "💬 その他", en: "💬 Other" } },
];

const MAX_CHARS = 4000;

/**
 * Sends a message to the owner by email (through the proxy; nothing is stored). The screen the
 * learner was on and a few settings go along, so a report can be understood without a back-and-forth.
 */
export function FeedbackDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const s = useSettings();
  const { pathname, search } = useLocation();
  const [kind, setKind] = useState<FeedbackKind>("usage");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "quota" | "error">("idle");

  const context = {
    screen: pathname + search,
    uiLang: s.uiLang,
    ai: s.provider === "shared" ? "shared (free tier)" : `${s.provider} / ${s.providers[s.provider].model}`,
    languages: `${s.defaultL1} → ${s.defaultL2}`,
    tutorial: s.tutorial.status,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    browser: navigator.userAgent,
  };

  function close(o: boolean) {
    onOpenChange(o);
    // Keep a draft when the dialog is dismissed; clear it only after it has gone out.
    if (!o && state === "sent") {
      setMessage("");
      setState("idle");
    }
  }

  async function submit() {
    setState("sending");
    setState(await sendFeedback({ kind, message: message.trim(), email: email.trim(), website, context }).then((r) => (r === "ok" ? "sent" : r)));
  }

  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t({ ja: "✉️ ご意見・不具合の報告", en: "✉️ Feedback & bug reports" })}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {t({ ja: "分かりにくい所、うまく動かない所、こうしてほしい所を教えてください。\n開発者にメールで届きます。", en: "Tell us what was confusing, what didn't work, or what you'd like changed.\nIt reaches the developer by email." })}
          </DialogDescription>
        </DialogHeader>

        {state === "sent" ? (
          <p className="rounded-lg bg-muted/60 p-4 text-sm whitespace-pre-line">
            {email.trim()
              ? t({ ja: "送信しました。ありがとうございます！\n返信はメールでお送りします（数日かかることがあります）。", en: "Sent. Thank you!\nWe'll reply by email (it may take a few days)." })
              : t({ ja: "送信しました。ありがとうございます！", en: "Sent. Thank you!" })}
          </p>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>{t({ ja: "種類", en: "Type" })}</Label>
              <ToggleGroup value={[kind]} onValueChange={(v) => v[0] && setKind(v[0] as FeedbackKind)} variant="outline" className="flex-wrap">
                {kinds.map((k) => (
                  <ToggleGroupItem key={k.value} value={k.value} className="h-8 px-2.5 text-sm">{t(k.label)}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="feedback-message">{t({ ja: "内容", en: "Message" })}</Label>
              <Textarea
                id="feedback-message"
                value={message}
                maxLength={MAX_CHARS}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-32"
                placeholder={
                  kind === "bug"
                    ? t({ ja: "何をしたら、どうなったか（期待していた動きも）", en: "What you did, what happened, and what you expected" })
                    : kind === "usage"
                      ? t({ ja: "どこで、何が分からなかったか", en: "Where you got stuck, and what was unclear" })
                      : t({ ja: "自由にお書きください", en: "Anything you'd like to tell us" })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="feedback-email">{t({ ja: "返信先メールアドレス（任意）", en: "Your email for a reply (optional)" })}</Label>
              <Input id="feedback-email" type="email" autoComplete="email" value={email} aria-invalid={!emailOk} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <p className="text-xs text-muted-foreground">{t({ ja: "返信が必要なときだけ入力してください。返信以外には使いません。", en: "Only if you'd like a reply. It's used for nothing else." })}</p>
            </div>
            {/* Honeypot: hidden from people, filled in by bots. */}
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] size-px opacity-0" />
            <Disclosure label={t({ ja: "📎 一緒に送られる情報", en: "📎 Also sent with your message" })}>
              <p className="pb-2 text-xs text-muted-foreground">{t({ ja: "状況を把握するために使います。探究の内容やAPIキーは送られません。", en: "Used to understand the situation. Your inquiries and API keys are not sent." })}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                {Object.entries(context).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="break-all">{v}</dd>
                  </div>
                ))}
              </dl>
              {/* The Worker adds the sender's IP to the mail (it is what the daily send limit counts); say so here. */}
              <p className="pt-2 text-xs text-muted-foreground">{t({ ja: "このほかに、送信元のIPアドレスが付きます（大量送信を防ぐために使います）。", en: "Your IP address is added as well (it is what the daily send limit counts)." })}</p>
            </Disclosure>
            {state === "quota" && <p className="text-sm text-destructive">{t({ ja: "今日はこれ以上送れません。明日もう一度お試しください。", en: "No more messages can be sent today. Please try again tomorrow." })}</p>}
            {state === "error" && <p className="text-sm text-destructive">{t({ ja: "送信できませんでした。時間をおいてもう一度お試しください。", en: "Couldn't send. Please try again later." })}</p>}
          </div>
        )}

        <DialogFooter>
          {state === "sent" ? (
            <Button variant="outline" onClick={() => close(false)}>{t({ ja: "閉じる", en: "Close" })}</Button>
          ) : (
            <Recommended>
              <Button variant="recommended" disabled={!message.trim() || !emailOk || state === "sending"} onClick={submit}>
                {state === "sending" ? t({ ja: "送信中…", en: "Sending…" }) : t({ ja: "📨 送信する", en: "📨 Send" })}
              </Button>
            </Recommended>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
