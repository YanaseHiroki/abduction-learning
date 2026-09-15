import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { Recommended } from "@/components/ui/recommended";
import { StepDots } from "@/components/ui/step-dots";
import { addCard } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { setTutorial, useSettings } from "@/lib/settings";
import { tutorialGroup, tutorialTranslationSample } from "@/lib/tutorial";
import type { Card, CardKind, Inquiry } from "@/lib/types";

type L = { ja: string; en: string };

/** Bring a card's header into view below the sticky top bar. */
function scrollToCard(id: string) {
  const el = document.getElementById(`card-${id}`);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64, behavior: "smooth" });
}
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
 * It only adds cards through the page's own `onPick` (or addCard); the cards themselves are unchanged.
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
  const [a, b] = inquiry.targets.map((x) => x.label);
  const pair = { a: a ?? "", b: b ?? "" };

  const latest = (k: CardKind) => cards.filter((c) => c.kind === k).at(-1);
  const hasExamples = cards.some((c) => c.kind === "examples" && (c as Card<"examples">).payload.sets.length > 0);
  const translation = latest("verify_translation") as Card<"verify_translation"> | undefined;
  const summary = latest("summary") as Card<"summary"> | undefined;

  // Scroll to a card as soon as the guide (or the learner) adds one.
  const count = useRef(cards.length);
  useEffect(() => {
    if (cards.length > count.current) scrollToCard(cards.at(-1)!.id);
    count.current = cards.length;
  }, [cards]);

  const add = (kind: CardKind) => () => {
    const existing = latest(kind);
    if (existing) scrollToCard(existing.id);
    else onPick(kind);
  };

  // The course's pair gets a ready-made sentence for the translation test; the learner only predicts.
  const group = tutorialGroup(inquiry.l2);
  const sample = group && group.targets.every((x, i) => inquiry.targets[i]?.label === x.label) ? tutorialTranslationSample[inquiry.l1] : undefined;
  const addTranslation = () => {
    if (translation || !sample) return add("verify_translation")();
    addCard(inquiry.id, "verify_translation", { l1Text: sample, markers: [], restrictToTargets: true, fixedGloss: "", feasibilityTargetId: null, result: null, revealed: false, history: [] });
  };

  const failed = !busy && (!!error || (!hasExamples && cards.some((c) => c.kind === "examples")));
  const steps: GuideStep[] = [
    busy || (!hasExamples && !failed)
      ? { title: { ja: "📘 例文を作っています", en: "📘 Making examples" }, body: { ja: "AIが例文を作っています。\n1分ほどかかることがあります。", en: "The AI is writing examples.\nThis can take a minute." }, canNext: false }
      : failed && !hasExamples
        ? { title: { ja: "📘 例文を出せませんでした", en: "📘 No examples yet" }, body: { ja: "上のメッセージを確かめてから、もう一度出してみてください。", en: "Check the message above, then try again." }, action: { label: { ja: "🔁 もう一度出す", en: "🔁 Try again" }, run: () => onPick("examples") }, canNext: false }
        : {
            title: { ja: "📘 例文を眺める", en: "📘 Look over the examples" },
            body: { ja: `${pair.a} と ${pair.b} の例文が並びました。\n訳も付いていますが、意味の解説はあえて出しません。\nどんな文で使われているか、ざっと眺めてください。`, en: `Examples of ${pair.a} and ${pair.b} are ready.\nTranslations are included; explanations are withheld on purpose.\nSkim how each word is used.` },
            canNext: true,
          },
    {
      title: { ja: "👀 観察する", en: "👀 Observe" },
      body: latest("observation")
        ? { ja: `訳文の中で ${pair.a} と ${pair.b} がどう訳されているかを探します。\n語句をなぞって選び、出てきた「追加」を押します。\n2〜3個集めたら進みましょう。`, en: `Look at how ${pair.a} and ${pair.b} are translated.\nSelect a phrase and press "Add".\nCollect two or three, then move on.` }
        : { ja: "次は、違いの手がかりを集めます。", en: "Next, collect clues to the difference." },
      action: latest("observation") ? undefined : { label: { ja: "👀 観察カードを出す", en: "👀 Add an observation card" }, run: add("observation") },
      canNext: true,
    },
    {
      title: { ja: "✍️ 仮説を書く", en: "✍️ Write a hypothesis" },
      body: latest("hypothesis")
        ? { ja: `${pair.a} と ${pair.b} の違いを、それぞれ1行で書きます。\n自信がなければ「？」を付けます。\n間違っていて構いません。`, en: `Write one line each on how ${pair.a} and ${pair.b} differ.\nMark "?" if unsure.\nIt is fine to be wrong.` }
        : { ja: "集めた手がかりから、自分の考えを言葉にします。", en: "Put what you noticed into words." },
      action: latest("hypothesis") ? undefined : { label: { ja: "✍️ 仮説カードを出す", en: "✍️ Add a hypothesis card" }, run: add("hypothesis") },
      canNext: true,
    },
    {
      title: { ja: "🧪 翻訳テストで確かめる", en: "🧪 Test by translation" },
      body: translation
        ? translation.payload.result
          ? { ja: "予想と実際を比べてみましょう。\n合わなかったところが、仮説を直す手がかりです。", en: "Compare your predictions with the result.\nMismatches are clues for revising the hypothesis." }
          : { ja: `①②に入るのが ${pair.a} か ${pair.b} かを予想して選びます。\n「翻訳させる」を押すと、AIの訳と答え合わせできます。${sample ? "\n文は書き換えても構いません。" : ""}`, en: `Predict whether ${pair.a} or ${pair.b} goes in each ①②.\nPress "Translate" to check against the AI's translation.${sample ? "\nFeel free to rewrite the sentence." : ""}` }
        : { ja: "仮説が正しいかを、翻訳で確かめます。", en: "Check the hypothesis with a translation." },
      action: translation ? undefined : { label: { ja: "🧪 翻訳テストを出す", en: "🧪 Add a translation test" }, run: addTranslation },
      canNext: !!translation?.payload.result,
    },
    {
      title: { ja: "📝 まとめる", en: "📝 Wrap up" },
      body: summary
        ? { ja: "結果を踏まえて、仮説の言葉を直します。\n「気づきノートに保存」を押すと、このまとめが残ります。", en: "Revise the wording with what you found.\nPress \"Save to notes\" to keep it." }
        : { ja: "わかったことを、まとめとして残します。", en: "Keep what you found as a summary." },
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
        <ButtonRow className="pt-3">
          {step > 0 && <Button variant="outline" onClick={() => go(step - 1)}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>}
          {last ? (
            <Recommended><Button variant="recommended" onClick={finish}>{t({ ja: "🏠 ホームへ", en: "🏠 Go to Home" })}</Button></Recommended>
          ) : current.action ? (
            <Recommended><Button variant="recommended" onClick={current.action.run}>{t(current.action.label)}</Button></Recommended>
          ) : (
            <Recommended><Button variant="recommended" disabled={!current.canNext} onClick={() => go(step + 1)}>{t({ ja: "進む ▶", en: "Next ▶" })}</Button></Recommended>
          )}
          {!last && <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={finish}>{t({ ja: "⏭️ チュートリアルを終える", en: "⏭️ End the tutorial" })}</Button>}
        </ButtonRow>
      </section>
    </div>
  );
}
