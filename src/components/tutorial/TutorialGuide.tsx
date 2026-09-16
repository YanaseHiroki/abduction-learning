import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavRow } from "@/components/ui/button-row";
import { Recommended } from "@/components/ui/recommended";
import { StepDots } from "@/components/ui/step-dots";
import { cardHint } from "@/lib/guide";
import { useT } from "@/lib/i18n";
import { setTutorial, useSettings } from "@/lib/settings";
import { scrollToCard, translationSampleFor } from "@/lib/tutorial";
import type { Card, CardKind, Inquiry } from "@/lib/types";

type L = { ja: string; en: string };

interface GuideStep {
  title: L;
  body: L;
  /** the one button forward: add this step's card, or retry the examples */
  action?: { label: L; run: () => void };
  /** "進む ▶" shows once there is no action left; it is enabled when this is true */
  canNext: boolean;
}

/**
 * The tutorial's coach panel on the inquiry page: one instruction and one button at a time,
 * walking through examples → observation → hypothesis → translation test → summary.
 * It only adds cards through the page's own `onPick`; once a card is out, its body is the card's own hint (lib/guide),
 * which the card stops showing while this panel is open.
 */
export function TutorialGuide({
  inquiry,
  cards,
  busy,
  error,
  onPick,
}: {
  inquiry: Inquiry;
  cards: Card[];
  busy: boolean;
  error: string | null;
  onPick: (kind: CardKind) => Promise<void>;
}) {
  const t = useT();
  const nav = useNavigate();
  const { tutorial } = useSettings();
  const [open, setOpen] = useState(true);
  const step = tutorial.step;

  const latest = (k: CardKind) => cards.filter((c) => c.kind === k).at(-1);
  const hasExamples = cards.some((c) => c.kind === "examples" && (c as Card<"examples">).payload.sets.length > 0);
  const translation = latest("verify_translation") as Card<"verify_translation"> | undefined;
  const summary = latest("summary") as Card<"summary"> | undefined;

  const add = (kind: CardKind) => () => {
    const existing = latest(kind);
    if (existing) scrollToCard(existing.id);
    else onPick(kind);
  };

  // The course's pair gets a ready-made sentence for the translation test (the page fills it in); the learner only predicts.
  const sample = translationSampleFor(inquiry);

  const hint = (k: CardKind) => {
    const c = latest(k);
    return c ? cardHint(c, inquiry) : null;
  };
  const withTail = (l: L, tail: L | null): L => (tail ? { ja: `${l.ja}\n${tail.ja}`, en: `${l.en}\n${tail.en}` } : l);

  const failed = !busy && (!!error || (!hasExamples && cards.some((c) => c.kind === "examples")));
  const steps: GuideStep[] = [
    busy
      ? { title: { ja: "📘 例文を作っています", en: "📘 Making examples" }, body: { ja: "AIが例文を作っています。\n1分ほどかかることがあります。", en: "The AI is writing examples.\nThis can take a minute." }, canNext: false }
      : failed && !hasExamples
        ? { title: { ja: "📘 例文を出せませんでした", en: "📘 No examples yet" }, body: { ja: "上のメッセージを確かめてから、もう一度出してみてください。", en: "Check the message above, then try again." }, action: { label: { ja: "🔁 もう一度出す", en: "🔁 Try again" }, run: () => onPick("examples") }, canNext: false }
        : // Nothing running and nothing to read: the learner closed the example dialog, so offer it again.
          !hasExamples
          ? { title: { ja: "📘 まず例文を出す", en: "📘 Start with examples" }, body: { ja: "比べる2語の例文を出すところから始めます。", en: "Start by generating examples of the two words you are comparing." }, action: { label: { ja: "📝 例文を出す", en: "📝 Generate examples" }, run: () => onPick("examples") }, canNext: false }
          : {
            title: { ja: "📘 例文を眺める", en: "📘 Look over the examples" },
            body: hint("examples")!,
            canNext: true,
          },
    {
      title: { ja: "👀 観察する", en: "👀 Observe" },
      body: hint("observation") ?? { ja: "次は、違いの手がかりを集めます。", en: "Next, collect clues to the difference." },
      action: latest("observation") ? undefined : { label: { ja: "👀 観察カードを出す", en: "👀 Add an observation card" }, run: add("observation") },
      canNext: true,
    },
    {
      title: { ja: "✍️ 仮説を書く", en: "✍️ Write a hypothesis" },
      body: hint("hypothesis") ?? { ja: "集めた手がかりから、自分の考えを言葉にします。", en: "Put what you noticed into words." },
      action: latest("hypothesis") ? undefined : { label: { ja: "✍️ 仮説カードを出す", en: "✍️ Add a hypothesis card" }, run: add("hypothesis") },
      canNext: true,
    },
    {
      title: { ja: "🧪 翻訳テストで確かめる", en: "🧪 Test by translation" },
      body: translation
        ? withTail(hint("verify_translation")!, !translation.payload.result && sample ? { ja: "文は書き換えても構いません。", en: "Feel free to rewrite the sentence." } : null)
        : { ja: "仮説が正しいかを、翻訳で確かめます。", en: "Check the hypothesis with a translation." },
      action: translation ? undefined : { label: { ja: "🧪 翻訳テストを出す", en: "🧪 Add a translation test" }, run: add("verify_translation") },
      canNext: !!translation?.payload.result,
    },
    {
      title: { ja: "📝 まとめる", en: "📝 Wrap up" },
      body: hint("summary") ?? { ja: "わかったことを、まとめとして残します。", en: "Keep what you found as a summary." },
      action: summary ? undefined : { label: { ja: "📝 まとめカードを出す", en: "📝 Add a summary card" }, run: add("summary") },
      canNext: !!summary?.payload.savedNoteId,
    },
    {
      title: { ja: "🎉 チュートリアルはここまでです", en: "🎉 That's the tutorial" },
      body: { ja: "観察 → 仮説 → 確かめる、を繰り返すのがこのアプリの使い方です。\nこの探究はホームの「📚 続きから」に残ります。", en: "Observe → hypothesize → test, again and again: that is how this app works.\nThis inquiry stays under \"📚 Pick up where you left off\" on Home." },
      canNext: false,
    },
  ];
  const current = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  const go = (n: number) => setTutorial({ step: n });
  const finish = () => {
    setTutorial({ status: "done" });
    nav("/");
  };

  if (!open) {
    return (
      <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <Button variant="outline" className="shadow-md" onClick={() => setOpen(true)}>{t(current.title)}<ChevronUp /></Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3">
      <section className="mx-auto max-w-2xl rounded-xl border border-blue-600/40 bg-card p-4 shadow-lg" aria-live="polite">
        <div className="flex items-center gap-3">
          <StepDots total={steps.length} current={step} />
          <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={t({ ja: "たたむ", en: "Collapse" })} onClick={() => setOpen(false)}><ChevronDown /></Button>
        </div>
        <h2 className="mt-2 font-semibold">{t(current.title)}</h2>
        <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{t(current.body)}</p>
        <NavRow
          className="pt-3"
          back={<>
            {step > 0 && <Button variant="outline" onClick={() => go(step - 1)}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>}
            {!last && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={finish}>{t({ ja: "⏭️ チュートリアルを終える", en: "⏭️ End the tutorial" })}</Button>}
          </>}
        >
          {last ? (
            <Recommended><Button variant="recommended" onClick={finish}>{t({ ja: "🏠 ホームへ", en: "🏠 Go to Home" })}</Button></Recommended>
          ) : current.action ? (
            <Recommended><Button variant="recommended" onClick={current.action.run}>{t(current.action.label)}</Button></Recommended>
          ) : (
            <Recommended><Button variant="recommended" disabled={!current.canNext} onClick={() => go(step + 1)}>{t({ ja: "進む ▶", en: "Next ▶" })}</Button></Recommended>
          )}
        </NavRow>
      </section>
    </div>
  );
}
