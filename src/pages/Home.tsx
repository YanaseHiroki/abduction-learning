import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Trash2 } from "lucide-react";
import { NewInquiryDialog } from "@/components/inquiry/NewInquiryDialog";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { Disclosure } from "@/components/ui/disclosure";
import { Recommended, RecommendedBadge } from "@/components/ui/recommended";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { courses, languageName, languageOptions, type CourseGroup } from "@/lib/courses";
import { db, deleteInquiry } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { setSettings, useSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/text";
import { cn } from "@/lib/utils";

/** The book this notebook follows (bookstore page). */
const BOOK_URL = "https://www.valuebooks.jp/bp/VS0095275901";

export function Home() {
  const t = useT();
  const { uiLang, defaultL1, defaultL2 } = useSettings();
  const [dialog, setDialog] = useState<{ group: CourseGroup | null } | null>(null);
  const inquiries = useLiveQuery(() => db.inquiries.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const notes = useLiveQuery(() => db.schemaNotes.orderBy("createdAt").reverse().limit(1).toArray(), []) ?? [];
  const course = courses.find((c) => c.l2 === defaultL2);

  const langItems = languageOptions.map((c) => ({ value: c, label: languageName(c, uiLang) }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <section className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{t({ ja: "例文から自分で仮説を立てて、確かめる。", en: "Form your own hypotheses from examples, then test them." })}</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Disclosure label={t({ ja: "🌐 言語を変更する", en: "🌐 Change languages" })} hint={`${languageName(defaultL1, uiLang)} → ${languageName(defaultL2, uiLang)}`}>
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-[6rem_1fr] items-center gap-2">
                <span className="text-muted-foreground">{t({ ja: "母語", en: "I speak" })}</span>
                <Select items={langItems} value={defaultL1} onValueChange={(v) => v && setSettings({ defaultL1: v })}>
                  <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{languageOptions.map((c) => <SelectItem key={c} value={c}>{languageName(c, uiLang)}</SelectItem>)}</SelectContent>
                </Select>
                <span className="text-muted-foreground">{t({ ja: "学ぶ言語", en: "Learning" })}</span>
                <Select items={langItems} value={defaultL2} onValueChange={(v) => v && setSettings({ defaultL2: v })}>
                  <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{languageOptions.map((c) => <SelectItem key={c} value={c}>{languageName(c, uiLang)}</SelectItem>)}</SelectContent>
                </Select>
                <span className="text-muted-foreground">{t({ ja: "画面の言語", en: "Screen" })}</span>
                <Select items={[{ value: "ja", label: "日本語" }, { value: "en", label: "English" }]} value={uiLang} onValueChange={(v) => v && setSettings({ uiLang: v as "ja" | "en" })}>
                  <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="ja">日本語</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </Disclosure>
          <Disclosure label={t({ ja: "📖 このアプリについて", en: "📖 About this app" })}>
            <p className="text-sm whitespace-pre-line text-muted-foreground">
              {t({ ja: "似た意味の語を並べ、AIに例文だけを出させて比較し、仮説を立てて翻訳テストで検証する。\n今井むつみ先生の", en: "Line up similar words, have the AI produce examples only, compare, hypothesize, and test by translation.\nAn unofficial, fan-made notebook following the method in Professor Mutsumi Imai's book " })}
              <a href={BOOK_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">
                {t({ ja: "『アブダクション英語学習法』", en: "Abduction English Learning Method" })}
              </a>
              {t({ ja: "の手順をなぞる非公式ファンメイドの練習帳です。", en: "." })}
            </p>
          </Disclosure>
        </div>
      </section>

      {course ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t({ ja: "🧭 基本動詞コース（本と同じ13語）", en: "🧭 Basic verbs course (the book's 13 verbs)" })}</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {course.groups.map((g, i) => {
              // The book starts with the first group, so that card is the recommended entry point.
              const recommended = i === 0;
              return (
                <button
                  key={g.id}
                  onClick={() => setDialog({ group: g })}
                  className={cn(
                    "relative rounded-xl border p-4 text-left shadow-xs transition",
                    recommended ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "bg-card hover:border-primary/50 hover:shadow-sm",
                  )}
                >
                  {recommended && <RecommendedBadge />}
                  <div className="text-lg font-semibold"><span className="mr-2">{g.emoji}</span>{g.label[defaultL1] ?? g.label.en}</div>
                  <div className={cn("mt-1 text-sm", recommended ? "text-blue-100" : "text-muted-foreground")}>{g.targets.map((x) => x.label).join(" · ")}</div>
                </button>
              );
            })}
          </div>
          <ButtonRow className="pt-6">
            <Button variant="outline" onClick={() => setDialog({ group: null })}>{t({ ja: "✨ 自由に探究する", en: "✨ Custom inquiry" })}</Button>
          </ButtonRow>
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
        <section className="mb-8 rounded-xl border border-dashed p-4">
          <div className="mb-1 text-xs font-semibold text-muted-foreground">{t({ ja: "🔁 前に立てたスキーマ", en: "🔁 A schema you built" })}</div>
          <div className="flex flex-wrap gap-2 text-sm">
            {notes[0].lines.map((l) => {
              const tg = notes[0].targets.find((x) => x.id === l.targetId);
              return tg ? <span key={l.targetId}><b>{tg.label}</b> = {l.text}</span> : null;
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t({ ja: "今日も1文、このスキーマで書いてみませんか？", en: "Write one more sentence with it today?" })} <Link to={`/inquiry/${notes[0].inquiryId}`} className="underline">{t({ ja: "探究を開く", en: "Open" })}</Link></p>
        </section>
      )}

      {inquiries.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t({ ja: "📚 続きから", en: "📚 Pick up where you left off" })}</h2>
          <ul className="divide-y rounded-xl border bg-card">
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

      {dialog && <NewInquiryDialog key={dialog.group?.id ?? "custom"} l1={defaultL1} l2={defaultL2} group={dialog.group} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
