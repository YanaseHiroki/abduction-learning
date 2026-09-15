import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, PanelRight } from "lucide-react";
import { ExamplesCard } from "@/components/cards/ExamplesCard";
import { HypothesisCard } from "@/components/cards/HypothesisCard";
import { ObservationCard } from "@/components/cards/ObservationCard";
import { SummaryCard } from "@/components/cards/SummaryCard";
import { SyntaxCard } from "@/components/cards/SyntaxCard";
import { VerifyFrameCard } from "@/components/cards/VerifyFrameCard";
import { VerifyTranslationCard } from "@/components/cards/VerifyTranslationCard";
import { AddCardMenu } from "@/components/inquiry/AddCardMenu";
import { ExamplesDialog } from "@/components/inquiry/ExamplesDialog";
import { HypothesisPanel } from "@/components/inquiry/HypothesisPanel";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { latestHypothesis, useCards, useInquiry } from "@/hooks/useInquiry";
import { createExamplesCard } from "@/lib/actions";
import { genres } from "@/lib/courses";
import { addCard } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { describeError } from "@/lib/llm/client";
import { getLangPack } from "@/lib/langpacks";
import { useSettings } from "@/lib/settings";
import type { Card, CardKind, ExamplesParams } from "@/lib/types";

export function InquiryPage() {
  const { id } = useParams();
  const t = useT();
  const { uiLang, apiKey } = useSettings();
  const inquiry = useInquiry(id);
  const cards = useCards(id);
  const [dialog, setDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!inquiry || !cards) return <div className="p-8 text-muted-foreground">…</div>;

  const latest = latestHypothesis(cards);
  const examples = cards.filter((c) => c.kind === "examples");
  const lastExamples = examples.at(-1);
  const genre = genres.find((g) => g.id === inquiry.genre);

  async function generate(params: ExamplesParams) {
    if (!inquiry) return;
    setBusy(true);
    setError(null);
    try {
      await createExamplesCard(inquiry, params);
      setDialog(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function pick(kind: CardKind) {
    if (!inquiry) return;
    const blank = (targetId: string) => ({ targetId, text: "", uncertain: false });
    switch (kind) {
      case "examples":
        setDialog(true);
        return;
      case "observation":
        await addCard(inquiry.id, "observation", { perspective: getLangPack(inquiry.l2).perspectives[0].id, examplesCardId: lastExamples?.id ?? "", marks: [], notes: "", aiExtraction: null, aiRevealed: false });
        return;
      case "syntax":
        await addCard(inquiry.id, "syntax", { examplesCardId: lastExamples?.id ?? "", analyses: {}, patterns: {}, aiAnalysis: null, aiRevealed: false, notes: "" });
        return;
      case "hypothesis":
        await addCard(inquiry.id, "hypothesis", { version: (latest?.payload.version ?? 0) + 1, lines: latest ? structuredClone(latest.payload.lines) : inquiry.targets.map((x) => blank(x.id)), notes: "", basedOn: latest ? [latest.id] : [] });
        return;
      case "verify_translation":
        await addCard(inquiry.id, "verify_translation", { l1Text: "", markers: [], restrictToTargets: true, fixedGloss: "", feasibilityTargetId: null, result: null, revealed: false, history: [] });
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
      case "examples": return <ExamplesCard key={c.id} card={c as Card<"examples">} inquiry={inquiry!} />;
      case "observation": return <ObservationCard key={c.id} card={c as Card<"observation">} inquiry={inquiry!} cards={cards!} />;
      case "syntax": return <SyntaxCard key={c.id} card={c as Card<"syntax">} inquiry={inquiry!} cards={cards!} />;
      case "hypothesis": return <HypothesisCard key={c.id} card={c as Card<"hypothesis">} inquiry={inquiry!} cards={cards!} />;
      case "verify_translation": return <VerifyTranslationCard key={c.id} card={c as Card<"verify_translation">} inquiry={inquiry!} />;
      case "verify_frame": return <VerifyFrameCard key={c.id} card={c as Card<"verify_frame">} inquiry={inquiry!} />;
      case "summary": return <SummaryCard key={c.id} card={c as Card<"summary">} inquiry={inquiry!} />;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28">
      <div className="flex flex-wrap items-center gap-3 py-4">
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
      {!apiKey && (
        <Alert className="mb-4">
          <AlertTitle>{t({ ja: "APIキーが未設定です", en: "No API key set" })}</AlertTitle>
          <AlertDescription>{t({ ja: "例文の生成や翻訳テストには自分の Anthropic API キーが必要です。", en: "Generating examples and running tests needs your own Anthropic API key." })} <Link className="underline" to="/settings">{t({ ja: "設定へ", en: "Settings" })}</Link></AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-4">
          {cards.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t({ ja: "まずは STEP 1: 例文セットを出力しましょう。訳はついていますが、意味の解説はあえて出しません。", en: "Start with STEP 1: generate an example set. Translations are included; explanations are deliberately withheld." })}
            </div>
          )}
          {cards.map(render)}
          {busy && (
            <div className="flex items-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground"><Loader2 className="animate-spin" />{t({ ja: "例文を生成しています…（文法チェックも同時に行います）", en: "Generating examples… (with a grammar check)" })}</div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="hidden lg:block"><div className="sticky top-16"><HypothesisPanel inquiry={inquiry} latest={latest} cards={cards} /></div></div>
      </div>
      <div className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2">
        <AddCardMenu hasExamples={examples.length > 0} hasHypothesis={!!latest} onPick={pick} />
      </div>
      {dialog && <ExamplesDialog inquiry={inquiry} open={dialog} onOpenChange={setDialog} onSubmit={generate} busy={busy} />}
    </div>
  );
}
