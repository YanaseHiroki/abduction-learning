import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Trash2 } from "lucide-react";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/text";

export function Notes() {
  const t = useT();
  const { uiLang } = useSettings();
  const notes = useLiveQuery(() => db.schemaNotes.orderBy("createdAt").reverse().toArray(), []) ?? [];
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Button render={<Link to="/" />} nativeButton={false} variant="ghost" size="sm" className="mb-3 -ml-2"><ArrowLeft />{t({ ja: "ホーム", en: "Home" })}</Button>
      <h1 className="mb-1 text-xl font-semibold">{t({ ja: "📒 気づきノート", en: "📒 Notes" })}</h1>
      <p className="mb-4 text-sm whitespace-pre-line text-muted-foreground">{t({ ja: "探究の末に残ったスキーマ。\n新しい探究の仮説として持ち込めます。", en: "Schemas you arrived at.\nThey can be brought into new inquiries as starting hypotheses." })}</p>
      {notes.length === 0 ? (
        <p className="text-sm whitespace-pre-line text-muted-foreground">{t({ ja: "まだありません。\nまとめカードから保存できます。", en: "Nothing yet.\nSave from a summary card." })}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="mb-2 flex items-center gap-4">
                <div className="flex flex-wrap gap-1">{n.targets.map((x, i) => <TargetBadge key={x.id} target={x} index={i} />)}</div>
                <span className="ml-auto text-xs text-muted-foreground">{fmtDate(n.createdAt, uiLang)}</span>
                <Button variant="ghost" size="icon-sm" aria-label="delete" onClick={() => db.schemaNotes.delete(n.id)}><Trash2 /></Button>
              </div>
              <ul className="space-y-1 text-sm">
                {n.lines.map((l) => (
                  <li key={l.targetId}><b>{n.targets.find((x) => x.id === l.targetId)?.label}</b> — {l.text}{l.uncertain && <span className="ml-1 text-amber-600">?</span>}</li>
                ))}
              </ul>
              <Link to={`/inquiry/${n.inquiryId}`} className="mt-2 inline-block text-xs text-muted-foreground underline">{t({ ja: "元の探究を開く", en: "Open the inquiry" })}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
