import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { NewInquiryDialog } from "@/components/inquiry/NewInquiryDialog";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { ButtonRow, NavRow } from "@/components/ui/button-row";
import { Disclosure } from "@/components/ui/disclosure";
import { Recommended, RecommendedBadge } from "@/components/ui/recommended";
import { Carousel } from "@/components/ui/carousel";
import { LanguageFields } from "@/components/LanguageFields";
import { Welcome } from "@/components/tutorial/Welcome";
import { courses, languageName, showsTargetList, type CourseGroup } from "@/lib/courses";
import { db, deleteInquiry } from "@/lib/db";
import type { Inquiry } from "@/lib/types";
import { useT } from "@/lib/i18n";
import { setTutorial, useSettings } from "@/lib/settings";
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

/** A language name shown like a picked dropdown value, in the "🌐 学習する言語を変更する" hint. */
function LangPill({ children }: { children: ReactNode }) {
  return <span className="rounded-md border bg-muted px-1.5 py-0.5">{children}</span>;
}

/** A card in the course row: a course group, or free inquiry. */
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
  const { uiLang, defaultL1, defaultL2, tutorial } = useSettings();
  const [dialog, setDialog] = useState<{ group: CourseGroup | null; preselect?: string[] } | null>(null);
  const loadedInquiries = useLiveQuery(() => db.inquiries.orderBy("updatedAt").reverse().toArray(), []);
  const loadedNotes = useLiveQuery(() => db.schemaNotes.orderBy("createdAt").reverse().limit(1).toArray(), []);
  const inquiries = loadedInquiries ?? [];
  const notes = loadedNotes ?? [];
  const noteCount = useLiveQuery(() => db.schemaNotes.count(), []) ?? 0;
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
  const cards = ownCourses.flatMap((course) => course.groups).map((g) => ({ g, ...groupProgress(g, inquiries, defaultL1, defaultL2) }));
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

  // Once every group is finished, free inquiry is what is left to recommend.
  const freeRecommended = !nextGroup && !tutorialInquiry;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <section className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t({ ja: "例文から自分で仮説を立てて、確かめる。", en: "Form your own hypotheses from examples, then test them." })}</h1>
        <div className="mt-4 grid items-start gap-3 sm:grid-cols-2">
          <Disclosure
            label={t({ ja: "🌐 学習する言語を変更する", en: "🌐 Change study languages" })}
            hint={
              <span className="flex items-center gap-1 text-foreground">
                {uiLang === "ja" ? (
                  <>
                    <LangPill>{languageName(defaultL1, uiLang)}</LangPill>
                    <span>で</span>
                    <LangPill>{languageName(defaultL2, uiLang)}</LangPill>
                    <span>を学習する</span>
                  </>
                ) : (
                  <>
                    <span>Learning</span>
                    <LangPill>{languageName(defaultL2, uiLang)}</LangPill>
                    <span>in</span>
                    <LangPill>{languageName(defaultL1, uiLang)}</LangPill>
                  </>
                )}
              </span>
            }
          >
            <LanguageFields />
          </Disclosure>
          <Disclosure label={t({ ja: "📖 このアプリについて", en: "📖 About this app" })}>
            <p className="text-sm whitespace-pre-line text-muted-foreground">
              {t({ ja: "似た意味の語を並べ、AIに例文だけを出させて比較し、仮説を立てて翻訳テストで検証する。\n今井むつみ先生の", en: "Line up similar words, have the AI produce examples only, compare, hypothesize, and test by translation.\nAn unofficial, fan-made notebook following the method in Professor Mutsumi Imai's book " })}
              <a href={BOOK_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                {t({ ja: "『アブダクション英語学習法』", en: "Abduction English Learning Method" })}
              </a>
              {t({ ja: "の手順をなぞる非公式ファンメイドの練習帳です。", en: "." })}
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
          </Disclosure>
        </div>
      </section>

      {tutorialInquiry && (
        <section className="mb-8 rounded-xl border border-blue-600/40 bg-blue-50 p-4 dark:bg-blue-950/30">
          <h2 className="text-sm font-semibold">{t({ ja: "🎓 チュートリアルの途中です", en: "🎓 You are partway through the tutorial" })}</h2>
          <NavRow className="pt-3" back={<Button variant="ghost" className="text-muted-foreground" onClick={() => setTutorial({ status: "done" })}>{t({ ja: "⏭️ チュートリアルを終える", en: "⏭️ End the tutorial" })}</Button>}>
            <Recommended>
              <Button variant="recommended" render={<Link to={`/inquiry/${tutorialInquiry.id}`} />} nativeButton={false}>{t({ ja: "続きへ ▶", en: "Continue ▶" })}</Button>
            </Recommended>
          </NavRow>
        </section>
      )}

      {cards.length > 0 ? (
        <section className="mb-8 rounded-2xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground">{t({ ja: "🧭 基本コース", en: "🧭 Basic course" })}</h2>
          <Carousel>
            {cards.map((card) => {
              const { g, latest, started, remaining } = card;
              // The course order decides the recommended entry point: the first group not yet finished
              // (unless the tutorial is still running: then its "continue" is the one recommendation).
              const recommended = g === nextGroup && !tutorialInquiry;
              return (
                <EntryCard key={g.id} recommended={recommended} onClick={() => openGroup(card)}>
                  <div className="text-lg font-semibold"><span className="mr-2">{g.emoji}</span>{g.label[uiLang] ?? g.label.en}</div>
                  {showsTargetList(g, uiLang) && <div className={cn("mt-1 text-sm", recommended ? "text-blue-100" : "text-muted-foreground")}>{g.targets.map((x) => x.label).join(" · ")}</div>}
                  {latest ? (
                    <div className="mt-2 text-xs font-medium text-muted-foreground">{t({ ja: "▶ 探究を再開する", en: "▶ Resume inquiry" })}</div>
                  ) : started && (
                    <div className={cn("mt-2 text-xs font-medium", recommended ? "text-blue-100" : "text-muted-foreground")}>{t({ ja: `▶ 次は ${remaining.join(" · ")}`, en: `▶ Next: ${remaining.join(" · ")}` })}</div>
                  )}
                </EntryCard>
              );
            })}
          </Carousel>
          {/* Free inquiry gets its own heading so that everything in the row above reads as "a prepared set of words".
              The grid matches the carousel's card widths (1 / 2 / 3 per row) so the card is the same size as those. */}
          <h2 className="mt-6 text-sm font-semibold text-muted-foreground">{t({ ja: "✏️ オリジナルのコース", en: "✏️ Your own course" })}</h2>
          <div className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            <EntryCard recommended={freeRecommended} onClick={() => setDialog({ group: null })}>
              <div className="text-lg font-semibold"><span className="mr-2">✨</span>{t({ ja: "自由に探究する", en: "Custom inquiry" })}</div>
              <div className={cn("mt-1 text-sm", freeRecommended ? "text-blue-100" : "text-muted-foreground")}>{t({ ja: "2つ以上の英単語を自由に選べる", en: "Pick any two or more English words" })}</div>
            </EntryCard>
          </div>
        </section>
      ) : (
        <section className="mb-8">
          <p className="text-sm whitespace-pre-line text-muted-foreground">{t({ ja: "この言語には既定コースがまだありません。\n「自由に探究する」から始めてください。", en: "No default course for this language yet.\nStart with a custom inquiry." })}</p>
          <ButtonRow className="pt-6">
            <Recommended>
              <Button variant="recommended" onClick={() => setDialog({ group: null })}>{t({ ja: "✨ 自由に探究する", en: "✨ Custom inquiry" })}</Button>
            </Recommended>
          </ButtonRow>
        </section>
      )}

      {notes[0] && (
        <section className="mb-8 rounded-xl border border-dashed border-foreground/20 bg-card p-4">
          <div className="mb-1 text-xs font-semibold text-muted-foreground">{t({ ja: "🔁 前に立てたスキーマ", en: "🔁 A schema you built" })}</div>
          <div className="flex flex-wrap gap-2 text-sm">
            {notes[0].lines.map((l) => {
              const tg = notes[0].targets.find((x) => x.id === l.targetId);
              return tg ? <span key={l.targetId}><b>{tg.label}</b> = {l.text}</span> : null;
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t({ ja: "今日も1文、このスキーマで書いてみませんか？", en: "Write one more sentence with it today?" })} <Link to={`/inquiry/${notes[0].inquiryId}`} className="underline">{t({ ja: "探究を開く", en: "Open" })}</Link></p>
          <ButtonRow className="pt-3">
            <Button variant="outline" size="sm" render={<Link to="/notes" />} nativeButton={false}>{t({ ja: `📒 気づきノートを見る（${noteCount}件）`, en: `📒 See your notes (${noteCount})` })}</Button>
          </ButtonRow>
        </section>
      )}

      {inquiries.length > 0 && (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t({ ja: "📚 探究を再開する", en: "📚 Resume an inquiry" })}</h2>
          <ul className="divide-y rounded-xl border bg-background">
            {inquiries.map((inq) => (
              <li key={inq.id} className="flex items-center gap-6 px-4 py-3">
                <Link to={`/inquiry/${inq.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  {inq.groupLabel && <span className="text-sm text-muted-foreground">{inq.groupLabel}</span>}
                  {inq.targets.map((x, i) => <TargetBadge key={x.id} target={x} index={i} />)}
                  {inq.question && <span className="truncate text-sm text-muted-foreground">— {inq.question}</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{inq.l1}→{inq.l2} · {fmtDate(inq.updatedAt, uiLang)}</span>
                </Link>
                <Button variant="ghost" size="icon-sm" aria-label="delete" onClick={() => confirm(t({ ja: "この探究を削除しますか？", en: "Delete this inquiry?" })) && deleteInquiry(inq.id)}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dialog && <NewInquiryDialog key={dialog.group?.id ?? "custom"} l1={defaultL1} l2={defaultL2} group={dialog.group} preselect={dialog.preselect} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
