import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Loader2, PanelRight } from "lucide-react";
import { ExamplesCard } from "@/components/cards/ExamplesCard";
import { HypothesisCard } from "@/components/cards/HypothesisCard";
import { ObservationCard } from "@/components/cards/ObservationCard";
import { SummaryCard } from "@/components/cards/SummaryCard";
import { SyntaxCard } from "@/components/cards/SyntaxCard";
import { VerifyFrameCard } from "@/components/cards/VerifyFrameCard";
import { VerifyTranslationCard } from "@/components/cards/VerifyTranslationCard";
import { HintedCardContext } from "@/components/inquiry/hintedCard";
import { ExamplesDialog } from "@/components/inquiry/ExamplesDialog";
import type { StartState } from "@/components/inquiry/NewInquiryDialog";
import { HypothesisPanel } from "@/components/inquiry/HypothesisPanel";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { TutorialGuide } from "@/components/tutorial/TutorialGuide";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Recommended } from "@/components/ui/recommended";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { latestHypothesis, useCards, useInquiry } from "@/hooks/useInquiry";
import { createExamplesCard, type ExamplesProgress } from "@/lib/actions";
import { genres } from "@/lib/courses";
import { addCard } from "@/lib/db";
import { cardReady, nextSteps } from "@/lib/guide";
import { useT } from "@/lib/i18n";
import { describeError, hasCredential, setActiveInquiry } from "@/lib/llm/client";
import { ErrorText } from "@/components/inquiry/ErrorText";
import { getLangPack } from "@/lib/langpacks";
import { useSettings } from "@/lib/settings";
import { scrollToCard, translationSampleFor, useGuidedInquiry } from "@/lib/tutorial";
import type { Card, CardKind, ExamplesParams, Inquiry } from "@/lib/types";

/**
 * What to do after the last card: one recommended step, stated with why, and the rest folded away.
 * While the last card is still unfinished it stays a quiet line, so the card itself holds the attention.
 */
function NextSteps({ inquiry, cards, hasHypothesis, onPick }: { inquiry: Inquiry; cards: Card[]; hasHypothesis: boolean; onPick: (k: CardKind) => void }) {
  const t = useT();
  const last = cards[cards.length - 1];
  const [primary, ...others] = nextSteps(last, hasHypothesis);
  // Which card the learner chose to move on from early; a new card is quiet again until it is worked on.
  const [early, setEarly] = useState<string | null>(null);

  if (!cardReady(last, inquiry) && early !== last.id) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-dashed px-5 py-3 text-sm text-muted-foreground">
        <span>{t({ ja: "上のカードを進めると、ここに次の一手が出ます。", en: "Work on the card above and the next step appears here." })}</span>
        <Button variant="link" size="sm" className="h-auto px-0 text-muted-foreground" onClick={() => setEarly(last.id)}>{t({ ja: "先に次へ進む ▸", en: "Move on anyway ▸" })}</Button>
      </div>
    );
  }
  return (
    <section className="rounded-xl border-2 border-blue-500/60 bg-card px-5 py-5 shadow-sm sm:px-6" aria-live="polite">
      <div className="text-sm font-semibold">{t({ ja: "👉 次の一手", en: "👉 Next step" })}</div>
      <p className="mt-1 text-sm text-muted-foreground">{t(primary.why)}</p>
      <ButtonRow className="mt-4">
        <Recommended>
          <Button variant="recommended" onClick={() => onPick(primary.kind)}>{t(primary.label)}</Button>
        </Recommended>
      </ButtonRow>
      <Collapsible className="mt-4">
        <CollapsibleTrigger className="group flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {t({ ja: "ほかの一手", en: "Other steps" })}<ChevronDown className="size-3.5 transition-transform group-data-panel-open:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <ButtonRow className="mt-3">
            {others.map((s) => (
              <Button key={s.kind + t(s.label)} size="sm" variant="outline" onClick={() => onPick(s.kind)}>{t(s.label)}</Button>
            ))}
          </ButtonRow>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

export function InquiryPage() {
  const { id } = useParams();
  const t = useT();
  const { uiLang } = useSettings();
  const inquiry = useInquiry(id);
  const cards = useCards(id);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState<{ cardId: string; progress: ExamplesProgress } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoOpened = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const guided = useGuidedInquiry(id);

  // The free tier charges every AI call on this page to this inquiry.
  useEffect(() => {
    setActiveInquiry(id ?? null);
    return () => setActiveInquiry(null);
  }, [id]);

  // Bring a newly added card into view (the next-step panel adds it just above itself).
  const count = useRef<number | null>(null);
  useEffect(() => {
    if (!cards) return;
    if (count.current !== null && cards.length > count.current) scrollToCard(cards.at(-1)!.id);
    count.current = cards.length;
  }, [cards]);

  // A fresh inquiry always starts with STEP 1 (once per inquiry): generate right away when the
  // new-inquiry dialog already chose the settings, otherwise open the example dialog.
  useEffect(() => {
    if (!inquiry || !cards) return;
    if (cards.length === 0 && autoOpened.current !== inquiry.id) {
      autoOpened.current = inquiry.id;
      const start = (location.state as StartState | null)?.generate;
      if (start) {
        navigate(location.pathname, { replace: true, state: null }); // a reload must not generate again
        generate(start);
      } else {
        setDialog(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inquiry, cards]);

  if (!inquiry || !cards) return <div className="p-8 text-muted-foreground">…</div>;

  const latest = latestHypothesis(cards);
  const lastExamples = cards.filter((c) => c.kind === "examples").at(-1);
  const genre = genres.find((g) => g.id === inquiry.genre);

  async function generate(params: ExamplesParams) {
    if (!inquiry) return;
    setBusy(true);
    setError(null);
    setDialog(false); // the card itself shows per-target progress from here on
    try {
      await createExamplesCard(inquiry, params, (cardId, progress) => setGenerating({ cardId, progress }));
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
      setGenerating(null);
    }
  }

  async function pick(kind: CardKind) {
    if (!inquiry) return;
    const blank = (targetId: string) => ({ targetId, text: "", uncertain: false });
    switch (kind) {
      case "examples":
        setDialog(true);
        return;
      case "observation": {
        // Suggest the first perspective this inquiry has not looked from yet.
        const used = new Set(cards!.filter((c) => c.kind === "observation").map((c) => (c as Card<"observation">).payload.perspective));
        const perspectives = getLangPack(inquiry.l2).perspectives.filter((x) => x.usesExamples && x.id !== "free");
        const perspective = (perspectives.find((x) => !used.has(x.id)) ?? perspectives[0]).id;
        await addCard(inquiry.id, "observation", { perspective, examplesCardId: lastExamples?.id ?? "", marks: [], notes: "", aiExtraction: null, aiRevealed: false });
        return;
      }
      case "syntax":
        await addCard(inquiry.id, "syntax", { examplesCardId: lastExamples?.id ?? "", analyses: {}, patterns: {}, aiAnalysis: null, aiRevealed: false, notes: "" });
        return;
      case "hypothesis":
        await addCard(inquiry.id, "hypothesis", { version: (latest?.payload.version ?? 0) + 1, lines: latest ? structuredClone(latest.payload.lines) : inquiry.targets.map((x) => blank(x.id)), notes: "", basedOn: latest ? [latest.id] : [] });
        return;
      case "verify_translation":
        await addCard(inquiry.id, "verify_translation", { l1Text: cards!.some((c) => c.kind === "verify_translation") ? "" : translationSampleFor(inquiry), markers: [], restrictToTargets: true, fixedGloss: "", feasibilityTargetId: null, result: null, revealed: false, history: [] });
        return;
      case "verify_frame":
        await addCard(inquiry.id, "verify_frame", { frames: [], result: null, revealed: false });
        return;
      case "summary":
        await addCard(inquiry.id, "summary", { lines: latest ? structuredClone(latest.payload.lines) : inquiry.targets.map((x) => blank(x.id)), writing: [], feedback: null, savedNoteId: null });
        return;
    }
  }

  function render(c: Card) {
    switch (c.kind) {
      case "examples": return <ExamplesCard key={c.id} card={c as Card<"examples">} inquiry={inquiry!} progress={generating?.cardId === c.id ? generating.progress : undefined} />;
      case "observation": return <ObservationCard key={c.id} card={c as Card<"observation">} inquiry={inquiry!} cards={cards!} />;
      case "syntax": return <SyntaxCard key={c.id} card={c as Card<"syntax">} inquiry={inquiry!} cards={cards!} />;
      case "hypothesis": return <HypothesisCard key={c.id} card={c as Card<"hypothesis">} inquiry={inquiry!} cards={cards!} />;
      case "verify_translation": return <VerifyTranslationCard key={c.id} card={c as Card<"verify_translation">} inquiry={inquiry!} />;
      case "verify_frame": return <VerifyFrameCard key={c.id} card={c as Card<"verify_frame">} inquiry={inquiry!} />;
      case "summary": return <SummaryCard key={c.id} card={c as Card<"summary">} inquiry={inquiry!} />;
    }
  }

  return (
    <HintedCardContext.Provider value={guided ? null : (cards.at(-1)?.id ?? null)}>
      <div className={guided ? "mx-auto max-w-6xl px-4 pb-56" : "mx-auto max-w-6xl px-4 pb-24"}>
        <div className="flex flex-wrap items-center gap-6 py-4">
          <Button render={<Link to="/" />} nativeButton={false} variant="ghost" size="sm"><ArrowLeft />{t({ ja: "ホーム", en: "Home" })}</Button>
          {inquiry.groupLabel && <span className="text-sm text-muted-foreground">{inquiry.groupLabel}</span>}
          <div className="flex flex-wrap gap-1.5">
            {inquiry.targets.map((x, i) => <TargetBadge key={x.id} target={x} index={i} className="text-base" />)}
          </div>
          <span className="text-xs text-muted-foreground">{inquiry.l1} → {inquiry.l2} · {genre ? (uiLang === "ja" ? genre.ja : genre.en) : inquiry.genre}</span>
          <div className="ml-auto lg:hidden">
            <Sheet>
              <SheetTrigger render={<Button variant="outline" size="sm" />}><PanelRight />{t({ ja: "仮説", en: "Hypothesis" })}</SheetTrigger>
              <SheetContent><SheetTitle className="sr-only">hypothesis</SheetTitle><div className="mt-6"><HypothesisPanel inquiry={inquiry} latest={latest} cards={cards} /></div></SheetContent>
            </Sheet>
          </div>
        </div>
        {inquiry.question && <p className="mb-4 rounded-lg border border-dashed px-3 py-2 text-sm"><span className="mr-2 text-muted-foreground">{t({ ja: "問い", en: "Question" })}</span>{inquiry.question}</p>}
        {!hasCredential() && (
          <Alert className="mb-4">
            <AlertTitle>{t({ ja: "AIの接続先が未設定です", en: "No AI connection configured" })}</AlertTitle>
            <AlertDescription>{t({ ja: "例文の生成や翻訳テストには、無料枠か自分のAPIキー（Anthropic / OpenAI / Gemini）が必要です。", en: "Generating examples and running tests needs the free tier or your own key (Anthropic / OpenAI / Gemini)." })} <Link className="underline" to="/settings">{t({ ja: "設定へ", en: "Settings" })}</Link></AlertDescription>
          </Alert>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            {cards.length === 0 && (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm whitespace-pre-line text-muted-foreground">
                {t({ ja: "まずは STEP 1: 例文セットを出力しましょう。\n訳もついていますが、単語の使い分けの解説はあえていたしません。", en: "Start with STEP 1: generate an example set.\nTranslations are included, but how the words differ is deliberately not explained." })}
              </div>
            )}
            {cards.map(render)}
            {cards.length > 0 && !busy && !guided && (
              <NextSteps key={cards.at(-1)!.id} inquiry={inquiry} cards={cards} hasHypothesis={!!latest} onPick={pick} />
            )}
            {busy && !generating && (
              <div className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground"><Loader2 className="animate-spin" />{t({ ja: "例文の生成を始めています…", en: "Starting generation…" })}</div>
            )}
            <ErrorText code={error} className="text-sm text-destructive" />
          </div>
          <div className="hidden lg:block"><div className="sticky top-16"><HypothesisPanel inquiry={inquiry} latest={latest} cards={cards} /></div></div>
        </div>
        {guided && <TutorialGuide inquiry={inquiry} cards={cards} busy={busy} error={error} onPick={pick} />}
        {dialog && <ExamplesDialog inquiry={inquiry} open={dialog} onOpenChange={setDialog} onSubmit={generate} busy={busy} />}
      </div>
    </HintedCardContext.Provider>
  );
}
