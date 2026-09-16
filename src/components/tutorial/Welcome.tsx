import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FreeTierFullNote } from "@/components/inquiry/FreeTierFullNote";
import { NoCredentialNote } from "@/components/inquiry/NoCredentialNote";
import type { StartState } from "@/components/inquiry/NewInquiryDialog";
import { targetColor } from "@/components/inquiry/target-color";
import { LanguageFields } from "@/components/LanguageFields";
import { Button } from "@/components/ui/button";
import { NavRow } from "@/components/ui/button-row";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Recommended } from "@/components/ui/recommended";
import { StepDots } from "@/components/ui/step-dots";
import { importAll } from "@/lib/backup";
import { showsTargetList } from "@/lib/courses";
import { useT } from "@/lib/i18n";
import { setTutorial, useSettings } from "@/lib/settings";
import { startTutorial, tutorialGroup } from "@/lib/tutorial";
import { cn } from "@/lib/utils";

/**
 * What a first-time visitor sees instead of the home menu: one screen at a time, one button forward.
 * ① welcome → ② today's task → start (the inquiry page then guides the rest, see TutorialGuide).
 * A separate branch at the bottom brings data over from another device instead.
 */
export function Welcome() {
  const t = useT();
  const { uiLang, defaultL1, defaultL2, provider } = useSettings();
  const nav = useNavigate();
  const [mode, setMode] = useState<"tour" | "import">("tour");
  const [step, setStep] = useState(0);
  const [words, setWords] = useState(["", ""]);
  const [starting, setStarting] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const [importError, setImportError] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const group = tutorialGroup(defaultL2);
  const customReady = words.every((w) => w.trim());

  async function start() {
    setStarting(true);
    const custom = group ? null : words.map((w) => ({ label: w.trim(), kind: w.trim().includes(" ") ? ("phrase" as const) : ("word" as const) }));
    const { id, generate } = await startTutorial(defaultL1, defaultL2, custom);
    nav(`/inquiry/${id}`, { state: { generate } satisfies StartState });
  }

  // Home shows its usual menu from here on.
  function finish() {
    setTutorial({ status: "done" });
  }

  async function onFile(f: File) {
    setImportError(false);
    try {
      setImported(await importAll(f));
    } catch {
      setImportError(true);
    }
  }

  if (mode === "import") {
    return (
      <Screen>
        <h1 className="text-2xl font-semibold tracking-tight">{t({ ja: "📦 データを引き継ぐ", en: "📦 Bring your data over" })}</h1>
        {imported === null ? (
          <>
            <p className="mt-4 text-sm whitespace-pre-line text-muted-foreground">
              {t({ ja: "前の端末の「設定 → 💾 データのバックアップ → 📤 JSONに書き出す」で作ったファイルを選びます。\nAPIキーは引き継がれません。", en: "Pick the file you made on the other device with Settings → 💾 Back up your data → 📤 Export JSON.\nAPI keys are not included." })}
            </p>
            {importError && <p className="mt-4 text-sm whitespace-pre-line text-destructive">{t({ ja: "このファイルは読み込めませんでした。\nバックアップのJSONファイルを選んでください。", en: "Could not read this file.\nPick a backup JSON file." })}</p>}
            <NavRow className="pt-6" back={<Button variant="outline" onClick={() => { setMode("tour"); setImportError(false); }}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>}>
              <Button size="lg" onClick={() => file.current?.click()}>{t({ ja: "📥 JSONファイルを選ぶ", en: "📥 Choose a JSON file" })}</Button>
              <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            </NavRow>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm whitespace-pre-line">{t({ ja: `✅ ${imported} 件の探究を読み込みました。\nホームから続きを始められます。`, en: `✅ Imported ${imported} inquiries.\nPick up where you left off from Home.` })}</p>
            <NavRow className="pt-6">
              <Button size="lg" onClick={finish}>{t({ ja: "🏠 ホームへ", en: "🏠 Go to Home" })}</Button>
            </NavRow>
          </>
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      <StepDots total={2} current={step} className="mb-6" />
      {step === 0 ? (
        <div key="welcome" className="animate-in fade-in slide-in-from-left-4">
          <div className="text-5xl">🌱</div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t({ ja: "例文から自分で仮説を立てて、確かめる。", en: "Form your own hypotheses from examples, then test them." })}</h1>
          <p className="mt-4 text-sm whitespace-pre-line text-muted-foreground">
            {t({ ja: "AIには例文だけを出してもらい、似た語の違いを自分で見つけます。\n最初の探究を、順番に案内します。", en: "The AI only gives you examples; you find how similar words differ.\nWe will walk you through your first inquiry." })}
          </p>
          <NavRow className="pt-6">
            <Recommended>
              <Button variant="recommended" size="lg" onClick={() => setStep(1)}>{t({ ja: "🚀 はじめる", en: "🚀 Get started" })}</Button>
            </Recommended>
          </NavRow>
          <Disclosure className="mt-8" label="🌐 学習する言語を変更する / Language">
            <LanguageFields />
          </Disclosure>
        </div>
      ) : (
        <div key="task" className="animate-in fade-in slide-in-from-right-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t({ ja: "🎯 最初の課題", en: "🎯 Your first task" })}</h1>
          {group ? (
            <div className="mt-6 rounded-xl border border-blue-600/40 bg-blue-50 p-4 shadow-xs dark:bg-blue-950/30">
              <div className="text-lg font-semibold"><span className="mr-2">{group.emoji}</span>{group.label[uiLang] ?? group.label.en}</div>
              {showsTargetList(group, uiLang) && <div className="mt-1 text-sm text-muted-foreground">{group.targets.map((x) => x.label).join(" · ")}</div>}
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {words.map((w, i) => (
                <Input key={i} lang={defaultL2} value={w} onChange={(e) => setWords(words.map((x, j) => (j === i ? e.target.value : x)))} placeholder={t({ ja: `比べる語 ${i + 1}`, en: `Expression ${i + 1}` })} className={cn(w.trim() && targetColor(i))} />
              ))}
            </div>
          )}
          <p className="mt-4 text-sm whitespace-pre-line text-muted-foreground">
            {group
              ? t({ ja: "似た2語の違いを、例文から自分で見つけます。\n本の最初の課題です。", en: "Find how two similar words differ, from examples alone.\nIt is the book's first task." })
              : t({ ja: "意味の似た2つの語を書いてください。\n違いを例文から自分で見つけます。", en: "Write two expressions with similar meanings.\nYou will find how they differ from examples alone." })}
          </p>
          {provider === "shared" && (
            <p className="mt-4 text-xs whitespace-pre-line text-muted-foreground">
              {t({ ja: "無料枠では、今日始められる探究の1つ分を使います。\nこの探究はそのまま最初の探究として残ります。", en: "On the free tier, this uses one of today's inquiries.\nIt stays as your first inquiry." })}
            </p>
          )}
          <div className="mt-4 grid gap-3"><NoCredentialNote /><FreeTierFullNote /></div>
          <NavRow className="pt-6" back={<Button variant="outline" onClick={() => setStep(0)}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>}>
            <Button size="lg" disabled={starting || (!group && !customReady)} onClick={start}>{t({ ja: "🚀 例文を出す", en: "🚀 Show examples" })}</Button>
          </NavRow>
        </div>
      )}

      {step === 0 && (
        <div className="mt-12 grid justify-items-start gap-3 border-t pt-6">
          <Button variant="ghost" onClick={() => setMode("import")}>{t({ ja: "📦 データを引き継ぐ場合はこちら", en: "📦 Bringing data from another device?" })}</Button>
          <Button variant="ghost" className="text-muted-foreground" onClick={finish}>{t({ ja: "⏭️ チュートリアルを飛ばす", en: "⏭️ Skip the tutorial" })}</Button>
        </div>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-10">{children}</div>;
}
