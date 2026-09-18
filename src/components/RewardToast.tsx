import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { levelFace, useProgress } from "@/lib/progress";

/**
 * A little cheer when points come in: "+30 ✨" as a card is finished, and a bigger one on a level up.
 * The first reading after mount is the baseline, so opening a page never celebrates old work.
 */
export function RewardToast() {
  const t = useT();
  const p = useProgress();
  const last = useRef<{ xp: number; level: number } | null>(null);
  const [toast, setToast] = useState<{ key: number; text: string; big: boolean } | null>(null);

  useEffect(() => {
    if (!p) return;
    const prev = last.current;
    last.current = { xp: p.xp, level: p.level };
    if (!prev || p.xp <= prev.xp) return;
    const gained = p.xp - prev.xp;
    const up = p.level > prev.level;
    setToast({
      key: Date.now(),
      big: up,
      text: up
        ? t({ ja: `${levelFace(p.level)} レベル ${p.level} になりました！`, en: `${levelFace(p.level)} You reached level ${p.level}!` })
        : t({ ja: `+${gained} ✨`, en: `+${gained} ✨` }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.xp, p?.level]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.big ? 3500 : 1800);
    return () => clearTimeout(id);
  }, [toast]);

  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4" aria-live="polite">
      <div
        key={toast.key}
        className={
          toast.big
            ? "rounded-2xl border-2 border-yellow-400 bg-card px-6 py-3 text-lg font-bold shadow-lg animate-in fade-in zoom-in-95"
            : "rounded-full bg-lime-500 px-4 py-1.5 text-sm font-bold text-white shadow-md animate-in fade-in slide-in-from-top-2"
        }
      >
        {toast.text}
      </div>
    </div>
  );
}
