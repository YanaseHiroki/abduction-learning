import type { Target } from "@/lib/types";
import { cn } from "@/lib/utils";

const palette = [
  "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-800",
  "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-900/40 dark:text-sky-100 dark:border-sky-800",
  "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-800",
  "bg-fuchsia-100 text-fuchsia-900 border-fuchsia-200 dark:bg-fuchsia-900/40 dark:text-fuchsia-100 dark:border-fuchsia-800",
];

export function targetColor(index: number) {
  return palette[index % palette.length];
}

export function TargetBadge({ target, index, className }: { target: Target; index: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-medium", targetColor(index), className)}>
      {target.label}
    </span>
  );
}
