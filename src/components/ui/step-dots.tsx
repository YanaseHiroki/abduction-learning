import { cn } from "@/lib/utils";

/**
 * Progress dots for a screen split into steps (one decision per screen, moved through with
 * "◀ 戻る" / "進む ▶"). `current` is 0-based.
 */
export function StepDots({ total, current, className }: { total: number; current: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)} aria-label={`${current + 1} / ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("h-1.5 rounded-full transition-all", i === current ? "w-6 bg-blue-600" : i < current ? "w-1.5 bg-blue-600/60" : "w-1.5 bg-muted-foreground/30")} />
      ))}
    </div>
  );
}
