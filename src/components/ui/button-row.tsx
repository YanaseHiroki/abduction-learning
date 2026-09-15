import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Container for a button or a group of buttons. Holds the app-wide rule for the space
 * around buttons (gap between them; callers add the outer margin with the same scale).
 */
export function ButtonRow({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="button-row" className={cn("flex flex-wrap items-center gap-4", className)} {...props} />;
}

/**
 * A row that moves the learner on or back. App-wide rule: forward buttons (children) sit at the
 * right end; back, cancel and quit buttons (`back`) sit at the left end.
 */
export function NavRow({ back, className, children }: { back?: ReactNode; className?: string; children?: ReactNode }) {
  return (
    <ButtonRow className={cn("justify-end", className)}>
      {back && <div className="mr-auto flex flex-wrap items-center gap-4">{back}</div>}
      {children}
    </ButtonRow>
  );
}
