import { useContext } from "react";
import { Lightbulb } from "lucide-react";
import { HintedCardContext } from "./hintedCard";
import { useT, type Localized } from "@/lib/i18n";

/** What to do on this card right now, shown at the top of its body. */
export function CardHint({ cardId, hint }: { cardId: string; hint: Localized }) {
  const t = useT();
  if (useContext(HintedCardContext) !== cardId) return null;
  return (
    <p className="mb-3 flex gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm whitespace-pre-line text-foreground/85" aria-live="polite">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />
      <span>{t(hint)}</span>
    </p>
  );
}
