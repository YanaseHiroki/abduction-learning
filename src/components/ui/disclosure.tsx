import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * A row that opens to reveal secondary content (options, explanations, rarely used actions).
 * The app-wide rule: anything a first-time learner does not need is folded behind one of these,
 * labelled with a leading emoji and a verb, e.g. "🌐 学習する言語を変更する".
 */
export function Disclosure({
  label,
  hint,
  children,
  defaultOpen,
  className,
  contentClassName,
}: {
  label: ReactNode;
  /** short current value shown on the right of the closed row, e.g. "日本語 → 英語" */
  hint?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className={cn("rounded-lg border bg-card", className)}>
      <CollapsibleTrigger className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/50">
        <span className="flex-1">{label}</span>
        {hint && <span className="truncate text-xs font-normal text-muted-foreground">{hint}</span>}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className={cn("px-3 pt-1 pb-3", contentClassName)}>{children}</CollapsibleContent>
    </Collapsible>
  );
}
