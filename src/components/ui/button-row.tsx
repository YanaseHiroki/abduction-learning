import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Container for a button or a group of buttons. Holds the app-wide rule for the space
 * around buttons (gap between them; callers add the outer margin with the same scale).
 */
export function ButtonRow({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="button-row" className={cn("flex flex-wrap items-center gap-4", className)} {...props} />;
}
