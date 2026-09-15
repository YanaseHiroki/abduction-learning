import { Volume2, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { segment } from "@/lib/text";
import { speak, hasVoiceFor } from "@/lib/tts";
import { useSettings } from "@/lib/settings";
import type { Sentence } from "@/lib/types";
import { cn } from "@/lib/utils";

const guideClass: Record<string, string> = {
  target: "rounded bg-primary/15 px-0.5 font-semibold text-primary",
  object: "underline decoration-sky-500 decoration-2 underline-offset-4",
  complement: "underline decoration-emerald-500 decoration-dotted decoration-2 underline-offset-4",
  pp: "underline decoration-fuchsia-500 decoration-wavy underline-offset-4",
  adverb: "underline decoration-amber-500 decoration-2 underline-offset-4",
};

export function SentenceView({
  s,
  index,
  l1,
  l2,
  targetId,
  showGuides,
  showTranslation,
  onFlag,
}: {
  s: Sentence;
  index: number;
  l1: string;
  l2: string;
  targetId: string;
  showGuides: boolean;
  showTranslation: boolean;
  onFlag?: () => void;
}) {
  const { ttsRate } = useSettings();
  const segs = segment(s.l2, {
    target: s.target_form,
    object: showGuides ? s.object : null,
    complement: showGuides ? s.complement : null,
    pp: showGuides ? s.preposition_phrase : null,
    adverb: showGuides ? s.adverb : null,
  });
  const key = `${targetId}:${index}`;
  const canSpeak = hasVoiceFor(l2);
  return (
    <li className={cn("group flex gap-3 py-2", s.flag && "rounded-md bg-amber-50 dark:bg-amber-950/30")}>
      <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{index + 1}.</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-7" data-skey={key} data-target={targetId} data-side="l2" lang={l2}>
          {segs.map((g, i) =>
            g.type ? (
              <span key={i} className={guideClass[g.type]}>
                {g.text}
              </span>
            ) : (
              <span key={i}>{g.text}</span>
            ),
          )}
        </p>
        {showTranslation && (
          <p className="text-sm text-muted-foreground" data-skey={key} data-target={targetId} data-side="l1" lang={l1}>
            {s.l1}
          </p>
        )}
        {s.flag && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
            ? {s.flag.reason}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-start gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {canSpeak && (
          <Button variant="ghost" size="icon-sm" aria-label="speak" onClick={() => speak(s.l2, l2, ttsRate)}>
            <Volume2 />
          </Button>
        )}
        {onFlag && (
          <Button variant="ghost" size="icon-sm" aria-label="flag" onClick={onFlag} className={cn(s.flag && "text-amber-600")}>
            <Flag />
          </Button>
        )}
      </div>
    </li>
  );
}
