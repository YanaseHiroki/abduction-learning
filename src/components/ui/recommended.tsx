import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Yellow "recommended" tag for the standard route (welcome → course → first next step).
 * Absolutely positioned at the top-right corner of a `relative` parent, rotated 30° clockwise.
 *
 * Only where the main route is not already obvious: a screen crowded with choices, or one that just
 * changed a lot. On a sparse screen, or when the same button is pressed again from the same spot
 * (a slide show, a wizard, a dialog opened from a recommended button), the blue button is enough on
 * its own and the badge is left off — see docs/design.md §8.
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
    // *:flex-1: when a parent stretches this wrapper (stacked dialog footer on phones), the button fills it so the badge stays on its corner.
    <span className={cn("relative inline-flex *:flex-1", className)}>
      {children}
      <RecommendedBadge />
    </span>
  );
}
