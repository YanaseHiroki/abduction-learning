import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

export interface Selection {
  text: string;
  sentenceKey: string;
  targetId: string;
  side: "l1" | "l2";
}

/** Sticky toolbar shown while the learner has text selected inside a card. */
export function SelectionBar({ sel, onAdd, extra }: { sel: Selection | null; onAdd: () => void; extra?: ReactNode }) {
  const t = useT();
  return (
    <div className="sticky top-14 z-10 mb-3 flex min-h-9 flex-wrap items-center gap-4 rounded-lg border bg-background/95 px-6 py-3 text-sm shadow-xs backdrop-blur">
      {sel ? (
        <>
          <span className="text-muted-foreground">{t({ ja: "選択中:", en: "Selected:" })}</span>
          <span className="rounded bg-muted px-1.5 font-medium">{sel.text}</span>
          {extra}
          <Button size="sm" onClick={onAdd}>{t({ ja: "追加", en: "Add" })}</Button>
        </>
      ) : (
        <span className="text-muted-foreground">{t({ ja: "例文の中の語句をドラッグして選ぶと、ここに追加ボタンが出ます。", en: "Select text in a sentence to add it here." })}</span>
      )}
    </div>
  );
}
