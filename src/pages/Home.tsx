import { useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Sparkles, Trash2 } from "lucide-react";
import { NewInquiryDialog } from "@/components/inquiry/NewInquiryDialog";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { courses, languageName, languageOptions, type CourseGroup } from "@/lib/courses";
import { db, deleteInquiry } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { setSettings, useSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/text";

export function Home() {
  const t = useT();
  const { uiLang, defaultL1, defaultL2 } = useSettings();
  const [dialog, setDialog] = useState<{ group: CourseGroup | null } | null>(null);
  const inquiries = useLiveQuery(() => db.inquiries.orderBy("updatedAt").reverse().toArray(), []) ?? [];
  const notes = useLiveQuery(() => db.schemaNotes.orderBy("createdAt").reverse().limit(1).toArray(), []) ?? [];
  const course = courses.find((c) => c.l2 === defaultL2);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <section className="mb-8 rounded-2xl border bg-gradient-to-br from-card to-muted/40 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t({ ja: "例文から自分で仮説を立てて、確かめる。", en: "Form your own hypotheses from examples, then test them." })}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t({
            ja: "似た意味の語を並べ、AIに例文だけを出させて比較し、仮説を立てて翻訳テストで検証する。今井むつみ『アブダクション英語学習法』の手順をなぞる非公式ファンメイドの練習帳です。答えは教えません。",
            en: "Line up similar words, have the AI produce examples only, compare, hypothesize, and test by translation. An unofficial, fan-made notebook following the method in Mutsumi Imai's book. It never gives you the answer.",
          })}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t({ ja: "母語", en: "I speak" })}</span>
            <Select items={languageOptions.map((c) => ({ value: c, label: languageName(c, uiLang) }))} value={defaultL1} onValueChange={(v) => v && setSettings({ defaultL1: v })}>
              <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{languageOptions.map((c) => <SelectItem key={c} value={c}>{languageName(c, uiLang)}</SelectItem>)}</SelectContent>
            </Select>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">{t({ ja: "学ぶ言語", en: "Learning" })}</span>
            <Select items={languageOptions.map((c) => ({ value: c, label: languageName(c, uiLang) }))} value={defaultL2} onValueChange={(v) => v && setSettings({ defaultL2: v })}>
              <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{languageOptions.map((c) => <SelectItem key={c} value={c}>{languageName(c, uiLang)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setDialog({ group: null })}><Sparkles />{t({ ja: "自由に探究する", en: "Custom inquiry" })}</Button>
        </div>
      </section>

      {course ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t({ ja: "基本動詞コース（本と同じ13語）", en: "Basic verbs course (the book's 13 verbs)" })}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {course.groups.map((g) => (
              <button key={g.id} onClick={() => setDialog({ group: g })} className="rounded-xl border bg-card p-4 text-left shadow-xs transition hover:border-primary/50 hover:shadow-sm">
                <div className="text-lg font-semibold">{g.label[defaultL1] ?? g.label.en}</div>
                <div className="mt-1 text-sm text-muted-foreground">{g.targets.map((x) => x.label).join(" · ")}</div>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="mb-8 text-sm text-muted-foreground">{t({ ja: "この言語には既定コースがまだありません。「自由に探究する」から始めてください。", en: "No default course for this language yet. Start with a custom inquiry." })}</p>
      )}

      {notes[0] && (
        <section className="mb-8 rounded-xl border border-dashed p-4">
          <div className="mb-1 text-xs font-semibold text-muted-foreground">{t({ ja: "再訪: 前に立てたスキーマ", en: "Revisit: a schema you built" })}</div>
          <div className="flex flex-wrap gap-2 text-sm">
            {notes[0].lines.map((l) => {
              const tg = notes[0].targets.find((x) => x.id === l.targetId);
              return tg ? <span key={l.targetId}><b>{tg.label}</b> = {l.text}</span> : null;
            })}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t({ ja: "今日も1文、このスキーマで書いてみませんか？", en: "Write one more sentence with it today?" })} <Link to={`/inquiry/${notes[0].inquiryId}`} className="underline">{t({ ja: "探究を開く", en: "Open" })}</Link></p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t({ ja: "探究の一覧", en: "Your inquiries" })}</h2>
        {inquiries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t({ ja: "まだありません。", en: "Nothing yet." })}</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {inquiries.map((inq) => (
              <li key={inq.id} className="flex items-center gap-3 px-4 py-3">
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
        )}
      </section>

      {dialog && <NewInquiryDialog key={dialog.group?.id ?? "custom"} l1={defaultL1} l2={defaultL2} group={dialog.group} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
