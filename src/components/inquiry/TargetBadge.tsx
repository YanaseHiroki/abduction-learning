import type { Target } from "@/lib/types";
import { cn } from "@/lib/utils";
import { targetColor } from "./target-color";

export function TargetBadge({ target, index, className }: { target: Target; index: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-medium", targetColor(index), className)}>
      {target.label}
    </span>
  );
}
