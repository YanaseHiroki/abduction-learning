import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { ConsultDialog, type ConsultedTargets } from "@/components/inquiry/ConsultDialog";
import { NewInquiryDialog } from "@/components/inquiry/NewInquiryDialog";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { ProgressStrip } from "@/components/ProgressStrip";
import { Button } from "@/components/ui/button";
import { ButtonRow, NavRow } from "@/components/ui/button-row";
import { Disclosure } from "@/components/ui/disclosure";
import { Recommended, RecommendedBadge } from "@/components/ui/recommended";
import { Carousel } from "@/components/ui/carousel";
import { LanguageFields } from "@/components/LanguageFields";
import { Coach, Welcome } from "@/components/tutorial/Welcome";
import { ANALYTICS_ENABLED } from "@/lib/analytics";
import { courses, languageName, showsTargetList, type CourseGroup } from "@/lib/courses";
import { db, deleteInquiry } from "@/lib/db";
import type { Inquiry } from "@/lib/types";
import { languageWord, useT } from "@/lib/i18n";
import { useProgress } from "@/lib/progress";
import { NATIVE_LANGUAGE, setTutorial, useSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/text";
import { cn } from "@/lib/utils";

/**
 * How far a course group has got in these languages. Its inquiries are the ones started from its card (or the
 * tutorial), recognized by their group label; "done" once they have covered every word of the group between them.
 */
function groupProgress(g: CourseGroup, inquiries: Inquiry[], l1: string, l2: string) {
  // The l1 label, because that is what was saved as groupLabel; the card above shows the uiLang one.
  const label = g.label[l1] ?? g.label.en;
  const own = inquiries.filter((inq) => inq.l1 === l1 && inq.l2 === l2 && inq.groupLabel === label);
  const covered = new Set(own.flatMap((inq) => inq.targets.map((x) => x.label)));
  const remaining = g.targets.map((x) => x.label).filter((x) => !covered.has(x));
  // inquiries come newest first, so own[0] is the one to reopen
  return { latest: remaining.length === 0 ? own[0] : undefined, started: own.length > 0, remaining, covered };
}

/** A language name shown like a picked dropdown value, in the "🌐 Language" hint. */
function LangPill({ children }: { children: ReactNode }) {
  return <span className="rounded-md border bg-muted px-1.5 py-0.5">{children}</span>;
}

/** A card in the course row: a ready-made combination of words. */
function EntryCard({ recommended, onClick, children }: { recommended: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-xl border p-4 text-left shadow-xs transition",
        recommended ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "bg-background hover:border-primary/50 hover:shadow-sm",
      )}
    >
      {recommended && <RecommendedBadge />}
      {children}
    </button>
  );
}

/** The book this notebook follows (the publisher's official page). */
const BOOK_URL = "https://bookplus.nikkei.com/atcl/catalog/26/03/23/02546/";

export function Home() {
  const t = useT();
  const nav = useNavigate();
  const { uiLang, defaultL2, tutorial } = useSettings();
  const [dialog, setDialog] = useState<{ group: CourseGroup | null; preselect?: string[]; initialTargets?: ConsultedTargets; inquiryId?: string } | null>(null);
  const [consulting, setConsulting] = useState(false);
  // "No, I have no combination in mind": the ready-made combinations come out.
  const [browsing, setBrowsing] = useState(false);
  const loadedInquiries = useLiveQuery(() => db.inquiries.orderBy("updatedAt").reverse().toArray(), []);
  const loadedNotes = useLiveQuery(() => db.schemaNotes.orderBy("createdAt").reverse().limit(1).toArray(), []);
  const inquiries = loadedInquiries ?? [];
  const notes = loadedNotes ?? [];
  const noteCount = useLiveQuery(() => db.schemaNotes.count(), []) ?? 0;
  const progress = useProgress();
  const ownCourses = courses.filter((c) => c.l2 === defaultL2);

  // No data and no finished tutorial = a first-time visitor: show the one-way welcome instead of the menu.
  // Once shown it stays up until the tutorial is started, skipped or data is imported (importing adds data
  // while the welcome is still showing its result).
  const loaded = loadedInquiries !== undefined && loadedNotes !== undefined;
  const empty = loaded && inquiries.length === 0 && notes.length === 0;
  const [welcomed, setWelcomed] = useState(false);
  if (!welcomed && empty && tutorial.status !== "done") setWelcomed(true);
  const showWelcome = welcomed && tutorial.status !== "done";

  // Learners who already have data (from before the tutorial existed) never need it. A tutorial whose
  // inquiry was deleted is over too, or its state would stay "running" with nothing left to guide.
  useEffect(() => {
    if (!loaded) return;
    if (!empty && !welcomed && tutorial.status === "new") setTutorial({ status: "done" });
    if (tutorial.status === "running" && !inquiries.some((x) => x.id === tutorial.inquiryId)) setTutorial({ status: "done" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, empty, welcomed, tutorial.status, tutorial.inquiryId, inquiries]);

  if (!loaded) return null;
  if (showWelcome) return <Welcome />;

  const tutorialInquiry = tutorial.status === "running" ? inquiries.find((x) => x.id === tutorial.inquiryId) : undefined;

  // Every course's groups share one row. A group whose words have all been explored (the tutorial's included)
  // reopens its latest inquiry instead of starting another: a new genre or verification goes into the same inquiry,
  // so the hypothesis keeps growing in one place. Those groups move to the end. A group explored only partway
  // (say & tell of four) stays in place and starts its next inquiry with the words not yet compared.
  const cards = ownCourses.flatMap((course) => course.groups).map((g) => ({ g, ...groupProgress(g, inquiries, NATIVE_LANGUAGE, defaultL2) }));
  cards.sort((a, b) => Number(!!a.latest) - Number(!!b.latest));
  // Courses come in the order they are recommended, so the next group is the first unfinished one.
  const nextGroup = cards.find((x) => !x.latest)?.g;

  function openGroup({ g, latest, started, remaining, covered }: (typeof cards)[number]) {
    if (latest) return nav(`/inquiry/${latest.id}`);
    if (!started) return setDialog({ group: g });
    // Compare two at a time: the words left, topped up with one already explored when only one is left.
    const preselect = [...remaining, ...g.targets.map((x) => x.label).filter((x) => covered.has(x))].slice(0, Math.max(2, remaining.length));
    setDialog({ group: g, preselect });
  }

  // The greeting follows the streak, so coming back every day is what gets noticed first.
  const streak = progress?.streak;
  const greeting = !streak || streak.current === 0
    ? t({ ja: "こんにちは！今日も、ことばの違いを1つ見つけにいきましょう。", en: "Hello! Let's find one more difference between words today." })
    : streak.today
      ? t({ ja: `${streak.current}日連続、いい調子です！もう1つ見つけてみますか？`, en: `${streak.current} days in a row, nice going! One more?` })
      : t({ ja: `${streak.current}日連続まで来ています。今日も1つやって、つなげましょう！`, en: `You are on a ${streak.current}-day streak. Do one today and keep it going!` });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <ProgressStrip className="mb-6" />

      {tutorialInquiry ? (
        <section className="mb-8 rounded-2xl border border-blue-600/40 bg-blue-50 p-5 dark:bg-blue-950/30">
          <Coach>{t({ ja: "最初の探究が途中です。\n続きをやりましょう！", en: "Your first inquiry is partway through.\nLet's carry on!" })}</Coach>
          <NavRow className="pt-4" back={<Button variant="ghost" className="text-muted-foreground" onClick={() => setTutorial({ status: "done" })}>{t({ ja: "⏭️ 案内を終える", en: "⏭️ End the guide" })}</Button>}>
            <Recommended>
              <Button variant="recommended" size="lg" render={<Link to={`/inquiry/${tutorialInquiry.id}`} />} nativeButton={false}>{t({ ja: "続きへ ▶", en: "Continue ▶" })}</Button>
            </Recommended>
          </NavRow>
        </section>
      ) : !browsing ? (
        <section key="ask" className="mb-8 rounded-2xl border bg-card p-5 animate-in fade-in slide-in-from-left-4">
          <p className="mb-4 text-sm text-muted-foreground">{greeting}</p>
          <Coach>{t({ ja: "例文で意味の違いを探究したい、ことばの組み合わせはありますか？", en: "Do you have a combination of words in mind, whose difference you want to explore through examples?" })}</Coach>
          <ButtonRow className="pt-5">
            <Button size="lg" onClick={() => setDialog({ group: null })}>{t({ ja: "はい", en: "Yes" })}</Button>
            <Button size="lg" variant="outline" onClick={() => setBrowsing(true)}>{t({ ja: "いいえ", en: "No" })}</Button>
          </ButtonRow>
        </section>
      ) : (
        <section key="browse" className="mb-8 rounded-2xl border bg-card p-5 animate-in fade-in slide-in-from-right-4">
          <Coach>
            {cards.length > 0
              ? t({ ja: "この中に気になる組み合わせがあれば、選んでください。", en: "If one of these combinations catches your eye, pick it." })
              : t({ ja: "この言語には、用意した組み合わせがまだありません。\n相談して決めましょう。", en: "There are no ready-made combinations for this language yet.\nLet's decide together." })}
          </Coach>
          {cards.length > 0 && (
            <Carousel>
              {cards.map((card) => {
                const { g, latest, started, remaining } = card;
                // The course order decides the recommended entry point: the first group not yet finished.
                const recommended = g === nextGroup;
                return (
                  <EntryCard key={g.id} recommended={recommended} onClick={() => openGroup(card)}>
                    <div className="text-lg font-semibold"><span className="mr-2">{g.emoji}</span>{g.label[uiLang] ?? g.label.en}</div>
                    {showsTargetList(g, uiLang) && <div className={cn("mt-1 text-sm", recommended ? "text-blue-100" : "text-muted-foreground")}>{g.targets.map((x) => x.label).join(" · ")}</div>}
                    {latest ? (
                      <div className="mt-2 text-xs font-medium text-muted-foreground">{t({ ja: "▶ 続きをやる", en: "▶ Pick it up again" })}</div>
                    ) : started && (
                      <div className={cn("mt-2 text-xs font-medium", recommended ? "text-blue-100" : "text-muted-foreground")}>{t({ ja: `▶ 次は ${remaining.join(" · ")}`, en: `▶ Next: ${remaining.join(" · ")}` })}</div>
                    )}
                  </EntryCard>
                );
              })}
            </Carousel>
          )}
          <NavRow className="pt-5" back={<Button variant="ghost" className="text-muted-foreground" onClick={() => setBrowsing(false)}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>}>
            <Button size="lg" variant={cards.length > 0 ? "outline" : "default"} onClick={() => setConsulting(true)}>{t({ ja: "💬 相談して決める", en: "💬 Decide in a chat" })}</Button>
          </NavRow>
        </section>
      )}

      {inquiries.length > 0 && (
        <Disclosure className="mb-4" label={t({ ja: "📚 前の探究にもどる", en: "📚 Go back to an inquiry" })} hint={t({ ja: `${inquiries.length}件`, en: `${inquiries.length}` })}>
          <ul className="divide-y rounded-xl border bg-background">
            {inquiries.map((inq) => (
              <li key={inq.id} className="flex items-center gap-6 px-4 py-3">
                <Link to={`/inquiry/${inq.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {inq.groupLabel && <span className="text-sm text-muted-foreground">{inq.groupLabel}</span>}
                  {inq.targets.map((x, i) => <TargetBadge key={x.id} target={x} index={i} />)}
                  {inq.question && <span className="truncate text-sm text-muted-foreground">— {inq.question}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{inq.l1}→{inq.l2} · {fmtDate(inq.updatedAt, uiLang)}</span>
                </Link>
                <Button variant="ghost" size="icon-sm" aria-label="delete" onClick={() => confirm(t({ ja: "この探究を消しますか？", en: "Delete this inquiry?" })) && deleteInquiry(inq.id)}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}

      {notes[0] && (
        <Disclosure className="mb-4" label={t({ ja: "🔁 前にわかったこと", en: "🔁 What you found before" })} hint={t({ ja: `ノート ${noteCount}件`, en: `${noteCount} notes` })}>
          <div className="flex flex-wrap gap-2 text-sm">
            {notes[0].lines.map((l) => {
              const tg = notes[0].targets.find((x) => x.id === l.targetId);
              return tg ? <span key={l.targetId}><b>{tg.label}</b> = {l.text}</span> : null;
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t({ ja: "今日も1文、これを使って書いてみませんか？", en: "Write one more sentence with it today?" })} <Link to={`/inquiry/${notes[0].inquiryId}`} className="underline">{t({ ja: "探究を開く", en: "Open" })}</Link></p>
          <ButtonRow className="pt-3">
            <Button variant="outline" size="sm" render={<Link to="/notes" />} nativeButton={false}>{t({ ja: `📒 気づきノートを見る（${noteCount}件）`, en: `📒 See your notes (${noteCount})` })}</Button>
          </ButtonRow>
        </Disclosure>
      )}

      <div className="mt-8 grid items-start gap-3 sm:grid-cols-2">
        <Disclosure
          label={`🌐 ${languageWord()}`}
          hint={
            <span className="text-foreground">
              {uiLang === "ja" ? (
                <>
                  <LangPill>{languageName(NATIVE_LANGUAGE, uiLang)}</LangPill>で<LangPill>{languageName(defaultL2, uiLang)}</LangPill>を学習する
                </>
              ) : (
                <>
                  Learning <LangPill>{languageName(defaultL2, uiLang)}</LangPill> in <LangPill>{languageName(NATIVE_LANGUAGE, uiLang)}</LangPill>
                </>
              )}
            </span>
          }
        >
          <LanguageFields />
        </Disclosure>
        <Disclosure label={t({ ja: "📖 このアプリについて", en: "📖 About this app" })}>
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {t({ ja: "似た意味のことばを並べて、AIには例文だけを出してもらいます。\n違いは自分で見つけて、訳して確かめる。\n今井むつみ先生の", en: "Line up similar words and have the AI give you examples only.\nFind the difference yourself, then check it by translating.\nAn unofficial, fan-made notebook following the method in Professor Mutsumi Imai's book " })}
            <a href={BOOK_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
              {t({ ja: "『アブダクション英語学習法』", en: "Abduction English Learning Method" })}
            </a>
            {t({ ja: "のやり方をなぞる、非公式ファンメイドの練習帳です。本を読んでいなくても使えます。", en: ". You do not need to have read the book." })}
          </p>
          {/* The app is a hobby project that one person can't grow alone, so invite people to build on it. */}
          <p className="mt-3 text-sm whitespace-pre-line text-muted-foreground">
            {t({
              ja: "ソースコードは公開リポジトリにあります。\n一緒に開発したい方、続きを開発したい方は大歓迎です（非営利に限ります）。",
              en: "The source code is in a public repository.\nAnyone who wants to develop it with us, or carry it on, is very welcome (non-commercial use only).",
            })}
            <br />
            <a className="underline underline-offset-2 hover:text-foreground" href="https://github.com/YanaseHiroki/abduction-learning" target="_blank" rel="noreferrer">
              {t({ ja: "🛠️ GitHub で見る", en: "🛠️ View on GitHub" })}
            </a>
          </p>
          {ANALYTICS_ENABLED && (
            <p className="mt-3 text-sm whitespace-pre-line text-muted-foreground">
              {t({
                ja: "開かれた回数だけを、Cookie を使わない Cloudflare Web Analytics で数えています。\n個人を特定する情報や、探究の内容は送られません。",
                en: "Only how often the app is opened is counted, with Cloudflare Web Analytics, which uses no cookies.\nNothing that identifies you, and none of your inquiries, is sent.",
              })}
            </p>
          )}
        </Disclosure>
      </div>

      {consulting && (
        <ConsultDialog
          l1={NATIVE_LANGUAGE}
          l2={defaultL2}
          open
          onOpenChange={setConsulting}
          onStart={(initialTargets, inquiryId) => { setConsulting(false); setDialog({ group: null, initialTargets, inquiryId }); }}
        />
      )}
      {dialog && <NewInquiryDialog key={dialog.inquiryId ?? dialog.group?.id ?? "custom"} l1={NATIVE_LANGUAGE} l2={defaultL2} group={dialog.group} preselect={dialog.preselect} initialTargets={dialog.initialTargets} inquiryId={dialog.inquiryId} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
