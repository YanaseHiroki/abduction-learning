import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Undo2, X } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { StepDots } from "@/components/ui/step-dots";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { defaultExampleSettings, type CourseGroup, type ExampleSettings } from "@/lib/courses";
import { createInquiry } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { ExamplesParams, Target, TargetKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ExampleSettingsFields, GenreTiles } from "./ExampleOptions";
import { FreeTierFullNote } from "./FreeTierFullNote";
import { NoCredentialNote } from "./NoCredentialNote";
import { targetColor } from "./target-color";

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
  initialTargets,
  inquiryId,
  open,
  onOpenChange,
}: {
  l1: string;
  l2: string;
  group: CourseGroup | null; // null = custom
  /** labels of the group's words to start with (default: its first two) */
  preselect?: string[];
  /** a custom inquiry's words, chosen beforehand in the consultation */
  initialTargets?: Omit<Target, "id">[];
  /** the id the consultation's AI calls were charged to, so the inquiry keeps it */
  inquiryId?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  // The title and hint sit among t()-translated copy, so they follow the screen language, not l1.
  const { uiLang } = useSettings();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [targets, setTargets] = useState<Target[]>(() =>
    (group?.targets ?? initialTargets ?? []).map((x) => ({ ...x, id: nanoid(6) })),
  );
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set((group ? (preselect ? targets.filter((x) => preselect.includes(x.label)) : targets.slice(0, 2)) : targets).map((x) => x.id)));
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<TargetKind>("word");
  const [question, setQuestion] = useState("");
  const [settings, setSettings] = useState<ExampleSettings>(() => defaultExampleSettings());

  // A custom word crossed out with × stays on screen, greyed, so a word dropped while trimming the
  // consultation's suggestion can be brought back with one click instead of being typed again.
  const chosen = targets.filter((x) => enabled.has(x.id));
  // Every screen after this one compares one expression against another, so one alone is not a start.
  const enoughTargets = chosen.length >= 2;

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
      // Stays in l1: it is the key Home's groupProgress matches past inquiries by, so it must not follow the screen.
      groupLabel: group ? group.label[l1] ?? group.label.en : undefined,
      targets: chosen,
      question: question.trim() || undefined,
      genre: settings.genre,
      level: settings.level,
    }, inquiryId);
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
      <Input lang={l2} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t({ ja: "ことば（例: look at）", en: "A word or phrase (e.g. look at)" })} />
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

  const title = group ? `${group.emoji} ${group.label[uiLang] ?? group.label.en}` : t({ ja: "✨ 自分で決めた組み合わせ", en: "✨ Your own combination" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <StepDots total={2} current={step} className="mb-1" />
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {step === 0
              ? `${group ? t({ ja: "🔤 比べることばを選んでください（2〜4個）。", en: "🔤 Pick the words to compare (2–4)." }) : t({ ja: "🔤 比べたいことばを2〜4個、入れてください。", en: "🔤 Enter 2–4 words you want to compare." })}\n${group?.hint ? group.hint[uiLang] ?? group.hint.en : t({ ja: "2つずつ比べるのが、いちばん見やすいですよ。", en: "Two at a time is easiest to see." })}`
              : t({ ja: "🎬 どんな場面の例文で比べますか？", en: "🎬 What kind of scene shall we compare in?" })}
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
                      aria-pressed={on}
                      onClick={() => {
                        const n = new Set(enabled);
                        if (on) n.delete(x.id); else if (n.size < 4) n.add(x.id);
                        setEnabled(n);
                      }}
                      className={cn("inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-base", on ? targetColor(i) : "text-muted-foreground opacity-60")}
                    >
                      {x.label}
                      {x.kind !== "word" && <span className="text-[10px] uppercase opacity-70">{x.kind}</span>}
                      {!group && (on ? <X className="size-3.5" aria-hidden /> : <Undo2 className="size-3.5" aria-hidden />)}
                    </button>
                  );
                })}
              </div>
            )}
            {group ? <Disclosure label={t({ ja: "➕ ことばを足す", en: "➕ Add a word" })}>{addForm}</Disclosure> : addForm}
          </div>
        ) : (
          <div key="genre" className="grid gap-4 animate-in fade-in slide-in-from-right-4">
            <GenreTiles value={settings.genre} onChange={(genre) => setSettings({ ...settings, genre })} />
            <Disclosure label={t({ ja: "⚙️ オプションを変更する", en: "⚙️ Change options" })}>
              <div className="grid gap-4">
                <div className="grid gap-1.5">
                  <Label>{t({ ja: "知りたいこと（任意）", en: "What you want to know (optional)" })}</Label>
                  <Input lang={l1} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t({ ja: "例: I think の代わりになる動詞は？", en: "e.g. What can replace 'I think'?" })} />
                </div>
                <ExampleSettingsFields value={settings} onChange={setSettings} />
              </div>
            </Disclosure>
          </div>
        )}

        <FreeTierFullNote active={open} />
        {step === 1 && <NoCredentialNote />}
        <DialogFooter>
          {step === 0 ? (
            <>
              {!enoughTargets && <span className="text-xs text-muted-foreground sm:mr-auto">{t({ ja: "比べることばを、2つ以上選んでください。", en: "Pick at least two words to compare." })}</span>}
              <Button disabled={!enoughTargets} onClick={() => setStep(1)}>{t({ ja: "進む ▶", en: "Next ▶" })}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="sm:mr-auto" onClick={() => setStep(0)}>{t({ ja: "◀ 戻る", en: "◀ Back" })}</Button>
              <Button disabled={!enoughTargets} onClick={create}>{t({ ja: "🚀 例文を出す", en: "🚀 Show examples" })}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
