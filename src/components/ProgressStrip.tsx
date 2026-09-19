import { useT } from "@/lib/i18n";
import { levelFace, useProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

/**
 * The day streak and the level, in one line. On Home it is the first thing on the screen, the way a
 * language app greets you with your streak; on the inquiry page it is a small version in the corner.
 */
export function ProgressStrip({ compact, className }: { compact?: boolean; className?: string }) {
  const t = useT();
  const p = useProgress();
  if (!p) return null;
  const { streak } = p;
  const streakText = streak.current === 0
    ? t({ ja: "今日から", en: "Start today" })
    : streak.today
      ? t({ ja: `${streak.current}日連続`, en: `${streak.current}-day streak` })
      : t({ ja: `${streak.current}日連続・今日はまだ`, en: `${streak.current}-day streak · not yet today` });
  const pct = Math.round((p.into / p.need) * 100);

  if (compact) {
    return (
      <div className={cn("flex items-center gap-3 text-xs font-medium whitespace-nowrap text-muted-foreground", className)} aria-label={t({ ja: "きろく", en: "Your progress" })}>
        <span className={cn(streak.current > 0 && streak.today && "text-orange-600 dark:text-orange-400")}>🔥 {streak.current}</span>
        <span>{levelFace(p.level)} Lv.{p.level}</span>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border bg-card px-4 py-3 shadow-xs", className)} aria-label={t({ ja: "きろく", en: "Your progress" })}>
      <div className={cn("flex items-center gap-2 text-sm font-semibold", streak.current > 0 && streak.today ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground")}>
        <span className="text-2xl leading-none">🔥</span>
        <span>{streakText}</span>
      </div>
      <div className="flex min-w-40 flex-1 items-center gap-3 text-sm">
        <span className="text-2xl leading-none">{levelFace(p.level)}</span>
        <div className="flex-1">
          <div className="flex justify-between font-semibold">
            <span>{t({ ja: `レベル ${p.level}`, en: `Level ${p.level}` })}</span>
            <span className="text-xs font-normal text-muted-foreground">{t({ ja: `あと ${p.need - p.into} ポイント`, en: `${p.need - p.into} points to go` })}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-lime-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
