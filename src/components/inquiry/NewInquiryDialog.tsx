import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Recommended } from "@/components/ui/recommended";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { genres, levels, type CourseGroup } from "@/lib/courses";
import { createInquiry } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { Target, TargetKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { targetColor } from "./TargetBadge";

export function NewInquiryDialog({
  l1,
  l2,
  group,
  open,
  onOpenChange,
}: {
  l1: string;
  l2: string;
  group: CourseGroup | null; // null = custom
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  const { uiLang } = useSettings();
  const nav = useNavigate();
  const [targets, setTargets] = useState<Target[]>(() =>
    group ? group.targets.map((x) => ({ ...x, id: nanoid(6) })) : [],
  );
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(group ? targets.slice(0, 2).map((x) => x.id) : []));
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<TargetKind>("word");
  const [question, setQuestion] = useState("");
  const [genre, setGenre] = useState("news");
  const [level, setLevel] = useState("beginner");

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
      genre,
      level,
    });
    onOpenChange(false);
    nav(`/inquiry/${inq.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? (group.label[l1] ?? group.label.en) : t({ ja: "自由に探究する", en: "Custom inquiry" })}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">
            {t({ ja: "意味の似た語を2〜4個選びます。\n2語ずつ比べるのがいちばん見通しがよいです。", en: "Pick 2–4 similar expressions.\nTwo at a time is easiest to see." })}
            {group?.hint && <span className="mt-1 block">{group.hint[l1] ?? group.hint.en}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-3">
            {targets.map((x, i) => {
              const on = enabled.has(x.id);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    const n = new Set(enabled);
                    if (on) n.delete(x.id); else if (n.size < 4) n.add(x.id);
                    setEnabled(n);
                  }}
                  className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm", on ? targetColor(i) : "text-muted-foreground opacity-60")}
                >
                  {x.label}
                  {x.kind !== "word" && <span className="text-[10px] uppercase opacity-70">{x.kind}</span>}
                  {!group && <X className="size-3" onClick={(e) => { e.stopPropagation(); setTargets(targets.filter((y) => y.id !== x.id)); }} />}
                </button>
              );
            })}
          </div>
          <form className="flex gap-4" onSubmit={(e) => { e.preventDefault(); addTarget(); }}>
            <Input lang={l2} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t({ ja: "語・句・パターンを追加（例: look at, I consider + O + C）", en: "Add a word, phrase, or pattern" })} />
            <Select items={[{ value: "word", label: t({ ja: "語", en: "word" }) }, { value: "phrase", label: t({ ja: "句", en: "phrase" }) }, { value: "pattern", label: t({ ja: "パターン", en: "pattern" }) }]} value={kind} onValueChange={(v) => v && setKind(v as TargetKind)}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="word">{t({ ja: "語", en: "word" })}</SelectItem>
                <SelectItem value="phrase">{t({ ja: "句", en: "phrase" })}</SelectItem>
                <SelectItem value="pattern">{t({ ja: "パターン", en: "pattern" })}</SelectItem>
              </SelectContent>
            </Select>
            <Button type="submit" variant="outline" size="icon"><Plus /></Button>
          </form>
          <div className="grid gap-1.5">
            <Label>{t({ ja: "問い（任意）", en: "Guiding question (optional)" })}</Label>
            <Input lang={l1} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t({ ja: "例: I think の代わりになる動詞は？", en: "e.g. What can replace 'I think'?" })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t({ ja: "既定のジャンル", en: "Default genre" })}</Label>
              <Select items={genres.map((g) => ({ value: g.id, label: uiLang === "ja" ? g.ja : g.en }))} value={genre} onValueChange={(v) => v && setGenre(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{genres.map((g) => <SelectItem key={g.id} value={g.id}>{uiLang === "ja" ? g.ja : g.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t({ ja: "レベル", en: "Level" })}</Label>
              <Select items={levels.map((l) => ({ value: l.id, label: uiLang === "ja" ? l.ja : l.en }))} value={level} onValueChange={(v) => v && setLevel(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{levels.map((l) => <SelectItem key={l.id} value={l.id}>{uiLang === "ja" ? l.ja : l.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Recommended>
            <Button variant="recommended" disabled={chosen.length === 0} onClick={create}>{t({ ja: "探究を始める", en: "Start" })}</Button>
          </Recommended>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
