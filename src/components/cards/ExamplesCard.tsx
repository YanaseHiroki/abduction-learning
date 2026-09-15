import { useState } from "react";
import { RefreshCw, Loader2 } from "lucide-react";
import { CardShell } from "@/components/inquiry/CardShell";
import { SentenceView } from "@/components/inquiry/SentenceView";
import { TargetBadge } from "@/components/inquiry/TargetBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { deleteCard, updateCardPayload } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { describeError } from "@/lib/llm/client";
import { regenerateSentence } from "@/lib/llm/prompts";
import { useSettings } from "@/lib/settings";
import { genres, levels } from "@/lib/courses";
import type { Card, Inquiry } from "@/lib/types";

export function ExamplesCard({ card, inquiry }: { card: Card<"examples">; inquiry: Inquiry }) {
  const t = useT();
  const { uiLang, showTranslations } = useSettings();
  const [showTr, setShowTr] = useState(showTranslations);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = card.payload;
  const genre = genres.find((g) => g.id === p.params.genre);
  const level = levels.find((l) => l.id === p.params.level);

  async function toggleFlag(setIdx: number, i: number) {
    const sets = structuredClone(p.sets);
    const s = sets[setIdx].sentences[i];
    s.flag = s.flag ? null : { source: "user", reason: t({ ja: "学習者が「変かも」とマーク", en: "Marked as suspicious by the learner" }) };
    await updateCardPayload(card, { sets });
  }

  async function regenerate(setIdx: number, i: number) {
    const set = p.sets[setIdx];
    const target = inquiry.targets.find((x) => x.id === set.targetId)!;
    const bad = set.sentences[i];
    setBusy(`${setIdx}:${i}`);
    setError(null);
    try {
      const { sentence } = await regenerateSentence(inquiry.l1, inquiry.l2, target, bad, bad.flag?.reason ?? "", p.params);
      const sets = structuredClone(p.sets);
      sets[setIdx].sentences[i] = sentence;
      await updateCardPayload(card, { sets });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  const title = [genre ? (uiLang === "ja" ? genre.ja : genre.en) : p.params.genre, level ? (uiLang === "ja" ? level.ja : level.en) : null, p.params.adverbs ? t({ ja: "副詞入り", en: "with adverbs" }) : null, p.params.maxWords ? `≤${p.params.maxWords}w` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <CardShell
      kind="examples"
      id={card.id}
      title={title}
      createdAt={card.createdAt}
      onDelete={() => deleteCard(card.id)}
      actions={
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5">
            <Switch checked={showTr} onCheckedChange={setShowTr} size="sm" />
            <Label className="text-xs">{t({ ja: "訳", en: "Translation" })}</Label>
          </label>
          <label className="flex items-center gap-1.5">
            <Switch checked={p.showGuides} onCheckedChange={(v) => updateCardPayload(card, { showGuides: v })} size="sm" />
            <Label className="text-xs">{t({ ja: "補助線", en: "Guides" })}</Label>
          </label>
        </div>
      }
    >
      {p.showGuides && (
        <p className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="underline decoration-sky-500 decoration-2 underline-offset-4">{t({ ja: "目的語", en: "object" })}</span>
          <span className="underline decoration-emerald-500 decoration-dotted decoration-2 underline-offset-4">{t({ ja: "補語", en: "complement" })}</span>
          <span className="underline decoration-amber-500 decoration-2 underline-offset-4">{t({ ja: "副詞", en: "adverb" })}</span>
          <span className="underline decoration-fuchsia-500 decoration-wavy underline-offset-4">{t({ ja: "前置詞句", en: "prep. phrase" })}</span>
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {p.sets.map((set, si) => {
          const target = inquiry.targets.find((x) => x.id === set.targetId);
          if (!target) return null;
          return (
            <div key={set.targetId} className="min-w-0">
              <TargetBadge target={target} index={inquiry.targets.indexOf(target)} className="mb-1" />
              <ol className="divide-y">
                {set.sentences.map((s, i) => (
                  <div key={i}>
                    <SentenceView
                      s={s}
                      index={i}
                      l1={inquiry.l1}
                      l2={inquiry.l2}
                      targetId={set.targetId}
                      showGuides={p.showGuides}
                      showTranslation={showTr}
                      onFlag={() => toggleFlag(si, i)}
                    />
                    {s.flag && (
                      <div className="mb-2 pl-9">
                        <Button size="xs" variant="outline" disabled={busy !== null} onClick={() => regenerate(si, i)}>
                          {busy === `${si}:${i}` ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                          {t({ ja: "指摘して再生成", en: "Point it out and regenerate" })}
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <p className="mt-3 text-xs text-muted-foreground">
        {t({ ja: "AIは間違えることがあります。「変だな」と思った文には旗を立ててください。", en: "The AI can be wrong. Flag any sentence that feels off." })} · {p.meta.model}
      </p>
    </CardShell>
  );
}
