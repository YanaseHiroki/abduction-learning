import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Yellow "recommended" tag for the standard route (course → start → STEP 1 → first next step).
 * Absolutely positioned at the top-right corner of a `relative` parent, rotated 30° clockwise.
 */
export function RecommendedBadge({ className }: { className?: string }) {
  const t = useT();
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute -top-2.5 -right-3 z-10 rotate-30 rounded-sm bg-yellow-400 px-1.5 py-px text-[10px] leading-4 font-bold text-yellow-950 shadow-sm select-none",
        className,
      )}
    >
      {t({ ja: "おすすめ", en: "Try this" })}
    </span>
  );
}

/** Wraps a button on the standard route so the badge can hang off its corner. Pair with `variant="recommended"`. */
export function Recommended({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-flex", className)}>
      {children}
      <RecommendedBadge />
    </span>
  );
}
