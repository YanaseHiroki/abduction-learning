import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { kindMeta } from "./CardShell";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import type { CardKind } from "@/lib/types";

export function AddCardMenu({
  hasExamples,
  hasHypothesis,
  onPick,
}: {
  hasExamples: boolean;
  hasHypothesis: boolean;
  onPick: (kind: CardKind) => void;
}) {
  const t = useT();
  const { uiLang } = useSettings();
  const label = (k: CardKind) => (uiLang === "ja" ? kindMeta[k].ja : kindMeta[k].en);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="lg" className="shadow-md" />}>
        <Plus />{t({ ja: "カードを追加", en: "Add a card" })}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>STEP 1</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onPick("examples")}>{label("examples")}</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>STEP 2</DropdownMenuLabel>
          <DropdownMenuItem disabled={!hasExamples} onClick={() => onPick("observation")}>{label("observation")}</DropdownMenuItem>
          <DropdownMenuItem disabled={!hasExamples} onClick={() => onPick("syntax")}>{label("syntax")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onPick("hypothesis")}>{label("hypothesis")}</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>STEP 3 {!hasHypothesis && <span className="font-normal text-muted-foreground">— {t({ ja: "先に仮説を立てる", en: "needs a hypothesis" })}</span>}</DropdownMenuLabel>
          <DropdownMenuItem disabled={!hasHypothesis} onClick={() => onPick("verify_translation")}>{label("verify_translation")}</DropdownMenuItem>
          <DropdownMenuItem disabled={!hasHypothesis} onClick={() => onPick("verify_frame")}>{label("verify_frame")}</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>OUTPUT</DropdownMenuLabel>
          <DropdownMenuItem disabled={!hasHypothesis} onClick={() => onPick("summary")}>{label("summary")}</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
