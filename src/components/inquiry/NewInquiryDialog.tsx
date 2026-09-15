import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Recommended } from "@/components/ui/recommended";
import { StepDots } from "@/components/ui/step-dots";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultExampleSettings, type CourseGroup, type ExampleSettings } from "@/lib/courses";
import { createInquiry } from "@/lib/db";
import { useT } from "@/lib/i18n";
import type { ExamplesParams, Target, TargetKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExampleSettingsFields, GenreTiles } from "./ExampleOptions";
import { FreeTierFullNote } from "./FreeTierFullNote";
import { targetColor } from "./TargetBadge";

/** Router state handed to the inquiry page so it generates the first example set right away. */
export interface StartState {
  generate: ExamplesParams;
}

/**
 * Two steps, one decision each: ① which expressions to compare, ② which kind of scene.
 * "Start" creates the inquiry and goes straight to generating STEP 1's example set.
 */
export function NewInquiryDialog({
  l1,
  l2,
  group,
  preselect,
  open,
  onOpenChange,
}: {
  l1: string;
  l2: string;
  group: CourseGroup | null; // null = custom
  /** labels of the group's words to start with (default: its first two) */
  preselect?: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [targets, setTargets] = useState<Target[]>(() =>
    group ? group.targets.map((x) => ({ ...x, id: nanoid(6) })) : [],
  );
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(group ? (preselect ? targets.filter((x) => preselect.includes(x.label)) : targets.slice(0, 2)).map((x) => x.id) : []));
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<TargetKind>("word");
  const [question, setQuestion] = useState("");
  const [settings, setSettings] = useState<ExampleSettings>(() => defaultExampleSettings());

  const chosen = group ? targets.filter((x) => enabled.has(x.id)) : targets;

  function addTarget() {
    if (!label.trim()) return;
    const tg: Target = { id: nanoid(6), label: label.trim(), kind };
    setTargets([...targets, tg]);
    setEnabled(new Set([...enabled, tg.id]));
    setLabel("");
  }

  async function create() {
    const inq = await createInquiry({
      l1,
      l2,
      groupLabel: group ? group.label[l1] ?? group.label.en : undefined,
      targets: chosen,
      question: question.trim() || undefined,
      genre: settings.genre,
      level: settings.level,
    });
    const generate: ExamplesParams = {
      targetIds: chosen.map((x) => x.id),
      count: settings.count,
      level: settings.level,
      genre: settings.genre,
      maxWords: settings.maxWords ? Number(settings.maxWords) : null,
      adverbs: settings.adverbs,
      contrastWith: [],
    };
    onOpenChange(false);
    nav(`/inquiry/${inq.id}`, { state: { generate } satisfies StartState });
  }

  const addForm = (
    <form className="flex gap-3" onSubmit={(e) => { e.preventDefault(); addTarget(); }}>
      <Input lang={l2} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t({ ja: "語・句・パターン（例: look at）", en: "A word, phrase, or pattern" })} />
      <Select items={[{ value: "word", label: t({ ja: "語", en: "word" }) }, { value: "phrase", label: t({ ja: "句", en: "phrase" }) }, { value: "pattern", label: t({ ja: "パターン", en: "pattern" }) }]} value={kind} onValueChange={(v) => v && setKind(v as TargetKind)}>
        <SelectTrigger className="w-24 shrink-0"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="word">{t({ ja: "語", en: "word" })}</SelectItem>
          <SelectItem value="phrase">{t({ ja: "句", en: "phrase" })}</SelectItem>
          <SelectItem value="pattern">{t({ ja: "パターン", en: "pattern" })}</SelectItem>
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline" size="icon" className="shrink-0" aria-label={t({ ja: "追加", en: "Add" })}><Plus /></Button>
    </form>
  );

  const title = group ? `${group.emoji} ${group.label[l1] ?? group.label.en}` : t({ ja: "✨ 自由に探究する", en: "✨ Custom inquiry" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <StepDots total={2} current={step} className="mb-1" />
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {step === 0
              ? `${t({ ja: "🔤 比べる語を選びます（2〜4個）。", en: "🔤 Pick 2–4 similar expressions." })}\n${group?.hint ? group.hint[l1] ?? group.hint.en : t({ ja: "2語ずつ比べるのがいちばん見通しがよいです。", en: "Two at a time is easiest to see." })}`
              : t({ ja: "🎬 どんな場面の例文で比べるかを選びます。", en: "🎬 Pick the kind of scene to compare in." })}
          </DialogDescription>
        </DialogHeader>

        {step === 0 ? (
          <div key="words" className="grid gap-4 animate-in fade-in slide-in-from-left-4">
            {targets.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {targets.map((x, i) => {
                  const on = enabled.has(x.id);
                  return (
                    <button
                      key={x.id}
                      type="button"
                      aria-pressed={group ? on : undefined}
                      onClick={() => {
                        const n = new Set(enabled);
                        if (on) n.delete(x.id); else if (n.size < 4) n.add(x.id);
                        setEnabled(n);
                      }}
                      className={cn("inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-base", on ? targetColor(i) : "text-muted-foreground opacity-60")}
                    >
                      {x.label}
                      {x.kind !== "word" && <span className="text-[10px] uppercase opacity-70">{x.kind}</span>}
                      {!group && <X className="size-3.5" onClick={(e) => { e.stopPropagation(); setTargets(targets.filter((y) => y.id !== x.id)); }} />}
                    </button>
                  );
                })}
              </div>
            )}
            {group ? <Disclosure label={t({ ja: "➕ 語を追加する", en: "➕ Add an expression" })}>{addForm}</Disclosure> : addForm}
          </div>
        ) : (
          <div key="genre" className="grid gap-4 animate-in fade-in slide-in-from-right-4">
            <GenreTiles value={settings.genre} onChange={(genre) => setSettings({ ...settings, genre })} />
            <Disclosure label={t({ ja: "⚙️ オプションを変更する", en: "⚙️ Change options" })}>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label>{t({ ja: "問い（任意）", en: "Guiding question (optional)" })}</Label>
                  <Input lang={l1} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t({ ja: "例: I think の代わりになる動詞は？", en: "e.g. What can replace 'I think'?" })} />
                </div>
                <ExampleSettingsFields value={settings} onChange={setSettings} />
              </div>
            </Disclosure>
          </div>
        )}

        <FreeTierFullNote active={open} />
        <DialogFooter>
          {step === 0 ? (
            <Recommended>
              <Button variant="recommended" disabled={chosen.length === 0} onClick={() => setStep(1)}>{t({ ja: "進む ▶", en: "Next ▶" })}</Button>
            </Recommended>
          ) : (
            <>
              <Button variant="outline" className="sm:mr-auto" onClick={() => setStep(0)}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>
              <Recommended>
                <Button variant="recommended" disabled={chosen.length === 0} onClick={create}>{t({ ja: "🚀 探究を始める", en: "🚀 Start" })}</Button>
              </Recommended>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
