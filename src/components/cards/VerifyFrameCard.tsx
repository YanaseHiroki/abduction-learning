import { useState } from "react";
import { Loader2, Play, Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import { CardShell } from "@/components/inquiry/CardShell";
import { ErrorText } from "@/components/inquiry/ErrorText";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { deleteCard, updateCardPayload } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { describeError } from "@/lib/llm/client";
import { frameTest } from "@/lib/llm/prompts";
import type { Card, Inquiry } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VerifyFrameCard({ card, inquiry }: { card: Card<"verify_frame">; inquiry: Inquiry }) {
  const t = useT();
  const p = card.payload;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = p.frames.length > 0 && p.frames.every((f) => inquiry.targets.every((x) => f.predictions[x.id]));

  function addFrame() {
    if (!draft.trim()) return;
    updateCardPayload(card, { frames: [...p.frames, { id: nanoid(6), frame: draft.trim(), predictions: {} }] });
    setDraft("");
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const { judgments, meta } = await frameTest(inquiry.l1, inquiry.l2, inquiry.targets, p.frames.map((f) => f.frame));
      const mapped = judgments.map((j) => ({
        frameId: p.frames[j.frame_index]?.id ?? "",
        targetId: inquiry.targets.find((x) => x.label.toLowerCase() === j.target.toLowerCase())?.id ?? j.target,
        natural: j.natural,
        example: j.example,
        note: j.note,
      }));
      await updateCardPayload(card, { result: { judgments: mapped, meta }, revealed: true });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <CardShell kind="verify_frame" id={card.id} createdAt={card.createdAt} onDelete={() => deleteCard(card.id)}>
      <p className="mb-2 text-sm whitespace-pre-line text-muted-foreground">
        {t({ ja: "診断的な「枠」を当てて、成り立つかを予想します。\n例:「〜するつもりだ」「たまたま〜」「〜に向かって命令する」。", en: "Apply diagnostic frames and predict whether each target fits.\ne.g. 'plan to …', 'happen to …', imperative." })}
      </p>
      <form className="mb-6 flex gap-4" onSubmit={(e) => { e.preventDefault(); addFrame(); }}>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} lang={inquiry.l1} placeholder={t({ ja: "枠を母語で書く", en: "Describe a frame in your language" })} />
        <Button type="submit" variant="outline"><Plus />{t({ ja: "追加", en: "Add" })}</Button>
      </form>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-2">{t({ ja: "枠", en: "Frame" })}</th>
              {inquiry.targets.map((x) => <th key={x.id} className="py-1 pr-2">{x.label}</th>)}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {p.frames.map((f) => (
              <tr key={f.id} className="border-t align-top">
                <td className="py-2 pr-2 font-medium">{f.frame}</td>
                {inquiry.targets.map((x) => {
                  const j = p.result?.judgments.find((q) => q.frameId === f.id && q.targetId === x.id);
                  const pred = f.predictions[x.id];
                  return (
                    <td key={x.id} className="py-2 pr-2">
                      <ToggleGroup
                        size="sm"
                        value={pred ? [pred] : []}
                        onValueChange={(v) => v[0] && updateCardPayload(card, { frames: p.frames.map((g) => (g.id === f.id ? { ...g, predictions: { ...g.predictions, [x.id]: v[0] as "ok" | "ng" | "unsure" } } : g)) })}
                      >
                        <ToggleGroupItem value="ok" className="px-2 text-xs">○</ToggleGroupItem>
                        <ToggleGroupItem value="ng" className="px-2 text-xs">×</ToggleGroupItem>
                        <ToggleGroupItem value="unsure" className="px-2 text-xs">?</ToggleGroupItem>
                      </ToggleGroup>
                      {j && (
                        <div className={cn("mt-1 text-xs", (pred === "ok") === j.natural || pred === "unsure" ? "text-emerald-700" : "text-rose-700")}>
                          <div className="font-semibold">{j.natural ? "○" : "×"} {pred && pred !== "unsure" && ((pred === "ok") === j.natural ? t({ ja: "一致", en: "match" }) : t({ ja: "不一致", en: "mismatch" }))}</div>
                          <div className="text-foreground" lang={inquiry.l2}>{j.example}</div>
                          <div className="text-muted-foreground">{j.note}</div>
                        </div>
                      )}
                    </td>
                  );
                })}
                <td className="py-2">
                  <button aria-label="remove" className="text-muted-foreground hover:text-foreground" onClick={() => updateCardPayload(card, { frames: p.frames.filter((g) => g.id !== f.id) })}><X className="size-3.5" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ButtonRow className="mt-6">
        <Button disabled={busy || !ready} onClick={run}>{busy ? <Loader2 className="animate-spin" /> : <Play />}{t({ ja: "AIに確かめる", en: "Ask the AI" })}</Button>
        {!ready && <span className="text-xs text-muted-foreground">{t({ ja: "すべてのマスに予想を入れると実行できます", en: "Predict every cell to run" })}</span>}
      </ButtonRow>
      <ErrorText code={error} />
    </CardShell>
  );
}
