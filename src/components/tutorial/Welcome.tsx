import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { FreeTierFullNote } from "@/components/inquiry/FreeTierFullNote";
import { NoCredentialNote } from "@/components/inquiry/NoCredentialNote";
import type { StartState } from "@/components/inquiry/NewInquiryDialog";
import { targetColor } from "@/components/inquiry/target-color";
import { LanguageFields } from "@/components/LanguageFields";
import { Button } from "@/components/ui/button";
import { ButtonRow, NavRow } from "@/components/ui/button-row";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { importAll } from "@/lib/backup";
import { showsTargetList } from "@/lib/courses";
import { languageWord, useT } from "@/lib/i18n";
import { NATIVE_LANGUAGE, setTutorial, useSettings } from "@/lib/settings";
import { startTutorial, tutorialGroup } from "@/lib/tutorial";
import { cn } from "@/lib/utils";

type Screen = "ask" | "task" | "returning" | "import";

/**
 * What a first-time visitor sees instead of the home menu. One question per screen, answered with a
 * button: "first time here?" → yes: today's task → start (the inquiry page guides the rest, see TutorialGuide);
 * no: "got data from before?" → bring a backup file over, or go straight to Home.
 */
export function Welcome() {
  const t = useT();
  const { uiLang, defaultL2, provider } = useSettings();
  const nav = useNavigate();
  const [screen, setScreen] = useState<Screen>("ask");
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
    const { id, generate } = await startTutorial(NATIVE_LANGUAGE, defaultL2, custom);
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

  if (screen === "import") {
    return (
      <Screen>
        <Coach>{t({ ja: "前のデータを持ってきましょう。", en: "Let's bring your data over." })}</Coach>
        {imported === null ? (
          <>
            <p className="mt-4 text-sm whitespace-pre-line text-muted-foreground">
              {t({ ja: "前の端末の「設定 → 💾 データのバックアップ → 📤 JSONに書き出す」で作ったファイルを選んでください。\nAPIキーは引き継がれません。", en: "Pick the file you made on the other device with Settings → 💾 Back up your data → 📤 Export JSON.\nAPI keys are not included." })}
            </p>
            {importError && <p className="mt-4 text-sm whitespace-pre-line text-destructive">{t({ ja: "うーん、このファイルは読めませんでした。\nバックアップのJSONファイルを選んでください。", en: "Hmm, I could not read that file.\nPick a backup JSON file." })}</p>}
            <NavRow className="pt-6" back={<Button variant="outline" onClick={() => { setScreen("returning"); setImportError(false); }}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>}>
              <Button size="lg" onClick={() => file.current?.click()}>{t({ ja: "📥 JSONファイルを選ぶ", en: "📥 Choose a JSON file" })}</Button>
              <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            </NavRow>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm whitespace-pre-line">{t({ ja: `✅ ${imported} 件の探究を読み込みました。\nおかえりなさい！続きはホームからどうぞ。`, en: `✅ Imported ${imported} inquiries.\nWelcome back! Pick up where you left off from Home.` })}</p>
            <NavRow className="pt-6">
              <Button size="lg" onClick={finish}>{t({ ja: "🏠 ホームへ", en: "🏠 Go to Home" })}</Button>
            </NavRow>
          </>
        )}
      </Screen>
    );
  }

  if (screen === "returning") {
    return (
      <Screen>
        <div key="returning" className="animate-in fade-in slide-in-from-right-4">
          <Coach>{t({ ja: "おかえりなさい！\n前に使っていたデータはありますか？", en: "Welcome back!\nDo you have data from before?" })}</Coach>
          <ButtonRow className="pt-6">
            <Button size="lg" onClick={() => setScreen("import")}>{t({ ja: "📦 ファイルから引き継ぐ", en: "📦 Bring it over from a file" })}</Button>
            <Button size="lg" variant="outline" onClick={finish}>{t({ ja: "ないので、このまま始める", en: "No, just start" })}</Button>
          </ButtonRow>
          <NavRow className="pt-6" back={<Button variant="ghost" className="text-muted-foreground" onClick={() => setScreen("ask")}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>} />
        </div>
      </Screen>
    );
  }

  if (screen === "task") {
    return (
      <Screen>
        <div key="task" className="animate-in fade-in slide-in-from-right-4">
          <Coach>
            {group
              ? t({ ja: "最初のお題はこれです。\n似た2つのことばが、どう違うのか。例文を見て、自分で見つけてみましょう。", en: "Here is your first task.\nTwo similar words: how do they differ? Look at some examples and find out for yourself." })
              : t({ ja: "意味の似た2つのことばを書いてください。\nどう違うのか、例文を見て自分で見つけてみましょう。", en: "Write two words with similar meanings.\nYou will find how they differ from examples alone." })}
          </Coach>
          {group ? (
            <div className="mt-6 rounded-xl border border-blue-600/40 bg-blue-50 p-4 shadow-xs dark:bg-blue-950/30">
              <div className="text-lg font-semibold"><span className="mr-2">{group.emoji}</span>{group.label[uiLang] ?? group.label.en}</div>
              {showsTargetList(group, uiLang) && <div className="mt-1 text-sm text-muted-foreground">{group.targets.map((x) => x.label).join(" · ")}</div>}
            </div>
          ) : (
            <div className="mt-6 grid gap-3">
              {words.map((w, i) => (
                <Input key={i} lang={defaultL2} value={w} onChange={(e) => setWords(words.map((x, j) => (j === i ? e.target.value : x)))} placeholder={t({ ja: `比べることば ${i + 1}`, en: `Expression ${i + 1}` })} className={cn(w.trim() && targetColor(i))} />
              ))}
            </div>
          )}
          {provider === "shared" && (
            <p className="mt-4 text-xs whitespace-pre-line text-muted-foreground">
              {t({ ja: "無料枠では、今日始められる探究の1つ分を使います。\nこの探究は、そのままあなたの最初の探究として残ります。", en: "On the free tier, this uses one of today's inquiries.\nIt stays as your first inquiry." })}
            </p>
          )}
          <div className="mt-4 grid gap-3"><NoCredentialNote /><FreeTierFullNote /></div>
          <NavRow className="pt-6" back={<Button variant="outline" onClick={() => setScreen("ask")}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>}>
            <Button size="lg" disabled={starting || (!group && !customReady)} onClick={start}>{t({ ja: "🚀 例文を出す", en: "🚀 Show examples" })}</Button>
          </NavRow>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <div key="ask" className="animate-in fade-in slide-in-from-left-4">
        <Coach>{t({ ja: "はじめまして！\nはじめて使いますか？", en: "Hi there!\nIs this your first time here?" })}</Coach>
        <ButtonRow className="pt-6">
          <Button size="lg" onClick={() => setScreen("task")}>{t({ ja: "はい", en: "Yes" })}</Button>
          <Button size="lg" variant="outline" onClick={() => setScreen("returning")}>{t({ ja: "いいえ", en: "No" })}</Button>
        </ButtonRow>
        <Disclosure className="mt-10" label={`🌐 ${languageWord()}`}>
          <LanguageFields />
        </Disclosure>
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-md px-4 py-10">{children}</div>;
}

/** The guide's line: a sprout and a speech bubble, the same voice as the coach on Home. */
export function Coach({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-4xl leading-none select-none" aria-hidden>🌱</span>
      <p className="rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-lg font-semibold whitespace-pre-line">{children}</p>
    </div>
  );
}
