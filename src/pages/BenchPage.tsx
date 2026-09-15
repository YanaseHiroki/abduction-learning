import { useMemo, useState } from "react";
import * as z from "zod/v4";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { describeError, structured } from "@/lib/llm/client";
import { generateExamples, translateTest } from "@/lib/llm/prompts";
import { providerMeta, type Provider } from "@/lib/llm/providers";
import { useSettings } from "@/lib/settings";
import type { Sentence, Target } from "@/lib/types";

/**
 * Model benchmark for the shared free tier (unlinked: open #/bench).
 * Runs the same STEP 1 + translation test on each candidate with the keys in Settings,
 * measures time and tokens, and lets a judge model grade the output.
 */

interface Candidate {
  provider: Provider;
  model: string;
  /** USD per 1M tokens, taken from each provider's public price list (Sep 2026) */
  inputPrice: number;
  outputPrice: number;
}

const candidates: Candidate[] = [
  { provider: "gemini", model: "gemini-2.5-flash-lite", inputPrice: 0.1, outputPrice: 0.4 },
  { provider: "openai", model: "gpt-5-nano", inputPrice: 0.05, outputPrice: 0.4 },
  { provider: "openai", model: "gpt-5.6-luna", inputPrice: 0.2, outputPrice: 1.2 },
  { provider: "gemini", model: "gemini-3.1-flash-lite", inputPrice: 0.25, outputPrice: 1.5 },
  { provider: "openai", model: "gpt-5-mini", inputPrice: 0.25, outputPrice: 2.0 },
  { provider: "gemini", model: "gemini-3.5-flash-lite", inputPrice: 0.3, outputPrice: 2.5 },
  { provider: "gemini", model: "gemini-2.5-flash", inputPrice: 0.3, outputPrice: 2.5 },
  { provider: "anthropic", model: "claude-haiku-4-5", inputPrice: 1.0, outputPrice: 5.0 },
];

const judgeDefault: Record<Provider, string> = { anthropic: "claude-opus-5", openai: "gpt-5.6", gemini: "gemini-3.8-flash" };

const targets: Target[] = [
  { id: "listen", label: "listen", kind: "word" },
  { id: "hear", label: "hear", kind: "word" },
];
const scenario = {
  l1: "ja",
  l2: "en",
  count: 10,
  level: "beginner",
  genre: "news",
  translation: "嫌な意見も①聞くべきだし、噂は自然と②聞こえてくる。",
  expected: { 1: "listen", 2: "hear" } as Record<number, string>,
};

const JudgeSchema = z.object({
  grammar_errors: z.number().describe("number of sentences (out of all listed) with a real grammatical error"),
  naturalness: z.number().describe("1-5: how natural the English sentences are for the genre and level"),
  translation: z.number().describe("1-5: accuracy and naturalness of the Japanese translations"),
  no_explanation: z.number().describe("1-5: 5 = translations only, no explanations/notes/glosses smuggled into any field"),
  notes: z.string().describe("two or three short remarks in Japanese"),
});

interface Row {
  candidate: Candidate;
  status: "idle" | "running" | "done" | "error";
  error?: string;
  genMs?: number;
  qaMs?: number;
  trMs?: number;
  tokens?: { input: number; output: number };
  setCost?: number; // USD for one example set (2 targets + QA)
  trCost?: number; // USD for one translation test
  counts?: number[];
  targetMissing?: number;
  leakage?: number;
  explanationHints?: number;
  qaFlags?: number;
  trHit?: string;
  judge?: z.infer<typeof JudgeSchema>;
  judgeError?: string;
  sets?: { targetId: string; sentences: Sentence[] }[];
  trText?: string;
}

const usd = (n: number | undefined) => (n === undefined ? "—" : `$${n.toFixed(4)}`);
const sec = (ms: number | undefined) => (ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`);

function cost(c: Candidate, u: { input: number; output: number } | undefined) {
  if (!u) return undefined;
  return (u.input * c.inputPrice + u.output * c.outputPrice) / 1e6;
}

function add(a: { input: number; output: number } | undefined, b: { input: number; output: number } | undefined) {
  return { input: (a?.input ?? 0) + (b?.input ?? 0), output: (a?.output ?? 0) + (b?.output ?? 0) };
}

export function BenchPage() {
  const s = useSettings();
  const available = (p: Provider) => !!s.providers[p].apiKey;
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(candidates.filter((c) => c.provider === "gemini" || c.provider === "openai" || c.provider === "anthropic").map((c) => c.model)));
  const [judgeProvider, setJudgeProvider] = useState<Provider>("anthropic");
  const [judgeModel, setJudgeModel] = useState(judgeDefault.anthropic);
  const [rows, setRows] = useState<Row[]>(() => candidates.map((candidate) => ({ candidate, status: "idle" })));
  const [running, setRunning] = useState(false);

  const runnable = useMemo(() => candidates.filter((c) => enabled.has(c.model) && available(c.provider)), [enabled, s]);

  function patch(model: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.candidate.model === model ? { ...r, ...p } : r)));
  }

  async function runOne(c: Candidate) {
    const override = { provider: c.provider, model: c.model, apiKey: s.providers[c.provider].apiKey };
    patch(c.model, { status: "running", error: undefined });
    try {
      const t0 = Date.now();
      const gen = await generateExamples(
        { l1: scenario.l1, l2: scenario.l2, targets, contrastWith: [], count: scenario.count, level: scenario.level, genre: scenario.genre, maxWords: null, adverbs: false },
        { override },
      );
      const genMs = Date.now() - t0;
      let tokens = gen.results.reduce((acc, r) => add(acc, r.usage), { input: 0, output: 0 });

      const t1 = Date.now();
      let qaFlags = 0;
      let qaTokens = { input: 0, output: 0 };
      try {
        const qa = await structuredQa(gen.sets, override);
        qaFlags = qa.issues.length;
        qaTokens = qa.usage ?? qaTokens;
      } catch {
        qaFlags = -1;
      }
      const qaMs = Date.now() - t1;
      tokens = add(tokens, qaTokens);
      const setCost = cost(c, tokens);

      const t2 = Date.now();
      const tr = await translateTest(
        { l1: scenario.l1, l2: scenario.l2, l1Text: scenario.translation, targets, restrictToTargets: true, fixedGloss: "", feasibilityTarget: null },
        { override },
      );
      const trMs = Date.now() - t2;
      const trCost = cost(c, tr.usage);
      const trHit = tr.alignments
        .map((a) => `${a.index}:${a.word}${a.word.toLowerCase().includes(scenario.expected[a.index] ?? "?") ? "✓" : "✗"}`)
        .join(" ");

      // Cheap automatic checks
      const counts = gen.sets.map((x) => x.sentences.length);
      let targetMissing = 0;
      let leakage = 0;
      let explanationHints = 0;
      for (const set of gen.sets) {
        const other = targets.find((t) => t.id !== set.targetId)!.label;
        for (const st of set.sentences) {
          if (!st.l2.toLowerCase().includes(st.target_form.toLowerCase())) targetMissing++;
          if (new RegExp(`\\b${other}`, "i").test(st.l2)) leakage++;
          if (/[（(]|→|ニュアンス|意味|文法/.test(st.l1)) explanationHints++;
        }
      }
      patch(c.model, {
        status: "done",
        genMs,
        qaMs,
        trMs,
        tokens: add(tokens, tr.usage),
        setCost,
        trCost,
        counts,
        targetMissing,
        leakage,
        explanationHints,
        qaFlags,
        trHit,
        sets: gen.sets,
        trText: tr.l2_text,
      });
    } catch (e) {
      patch(c.model, { status: "error", error: describeError(e) });
    }
  }

  async function structuredQa(sets: { sentences: Sentence[] }[], override: { provider: Provider; model: string; apiKey: string }) {
    // qaCheck() returns only issues; wrap it to also capture usage via a direct structured() call.
    const listing = sets.map((x, si) => x.sentences.map((y, i) => `[${si},${i}] ${y.l2}`).join("\n")).join("\n");
    const r = await structured(
      "You are a careful proofreader of English. Output only the JSON schema.",
      `Check each English sentence for grammatical errors or clearly unnatural wording (wrong verb form, agreement, missing article, broken tense). Report only real problems; minor stylistic issues are fine. Reasons in Japanese.\n\n${listing}`,
      z.object({ issues: z.array(z.object({ set_index: z.number(), sentence_index: z.number(), reason: z.string() })) }),
      { effort: "low", maxTokens: 2000, override },
    );
    return { issues: r.data.issues, usage: r.usage };
  }

  async function judgeOne(r: Row) {
    if (!r.sets) return;
    const override = { provider: judgeProvider, model: judgeModel, apiKey: s.providers[judgeProvider].apiKey };
    const listing = r.sets
      .map((x) => `## ${x.targetId}\n` + x.sentences.map((y, i) => `${i + 1}. ${y.l2}\n   訳: ${y.l1}`).join("\n"))
      .join("\n\n");
    try {
      const j = await structured(
        "You are a strict bilingual (English/Japanese) reviewer of language-learning materials. Output only the JSON schema.",
        `A language model produced example sentences for the English verbs "listen" and "hear" (news register, junior-high level), each with a Japanese translation, for a learner who must NOT be given explanations. Grade them.\n\n${listing}\n\nTranslation test output for 「${scenario.translation}」: ${r.trText}`,
        JudgeSchema,
        { effort: "medium", maxTokens: 2000, override },
      );
      patch(r.candidate.model, { judge: j.data, judgeError: undefined });
    } catch (e) {
      patch(r.candidate.model, { judgeError: describeError(e) });
    }
  }

  async function runAll() {
    setRunning(true);
    for (const c of runnable) await runOne(c);
    setRunning(false);
  }

  async function judgeAll() {
    setRunning(true);
    for (const r of rows) if (r.status === "done") await judgeOne(r);
    setRunning(false);
  }

  function markdown() {
    const head = "| model | gen | QA | translate | tokens in/out | 1 set (USD) | 1 translation (USD) | count | target missing | leakage | expl. hints | QA flags | translation | grammar errs | natural | transl. | no-expl | notes |";
    const sep = "|" + "---|".repeat(18);
    const lines = rows
      .filter((r) => r.status === "done")
      .map((r) =>
        `| ${r.candidate.model} | ${sec(r.genMs)} | ${sec(r.qaMs)} | ${sec(r.trMs)} | ${r.tokens?.input}/${r.tokens?.output} | ${usd(r.setCost)} | ${usd(r.trCost)} | ${r.counts?.join("+")} | ${r.targetMissing} | ${r.leakage} | ${r.explanationHints} | ${r.qaFlags} | ${r.trHit} | ${r.judge?.grammar_errors ?? "—"} | ${r.judge?.naturalness ?? "—"} | ${r.judge?.translation ?? "—"} | ${r.judge?.no_explanation ?? "—"} | ${(r.judge?.notes ?? "").replace(/\n/g, " ")} |`,
      );
    return [head, sep, ...lines].join("\n");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">🏁 Model benchmark (listen &amp; hear)</h1>
      <p className="text-sm whitespace-pre-line text-muted-foreground">
        {"Uses the API keys saved in Settings.\nEach candidate runs STEP 1 (10 sentences × 2 targets, in parallel) + the QA pass with itself + one translation test.\nThen a judge model grades grammar, naturalness, translation quality and rule adherence."}
      </p>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">🧪 Candidates</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {candidates.map((c) => (
            <label key={c.model} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={!available(c.provider)} checked={enabled.has(c.model)} onChange={(e) => { const n = new Set(enabled); if (e.target.checked) n.add(c.model); else n.delete(c.model); setEnabled(n); }} />
              <span className={available(c.provider) ? "" : "text-muted-foreground line-through"}>{c.model}</span>
              <span className="text-xs text-muted-foreground">{providerMeta[c.provider].label} · ${c.inputPrice}/{c.outputPrice} per 1M</span>
            </label>
          ))}
        </div>
        <div className="grid gap-1.5 sm:max-w-md">
          <Label>Judge</Label>
          <div className="flex gap-2">
            <Select items={(["anthropic", "openai", "gemini"] as Provider[]).map((p) => ({ value: p, label: providerMeta[p].label }))} value={judgeProvider} onValueChange={(v) => { if (!v) return; setJudgeProvider(v as Provider); setJudgeModel(judgeDefault[v as Provider]); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>{(["anthropic", "openai", "gemini"] as Provider[]).map((p) => <SelectItem key={p} value={p}>{providerMeta[p].label}</SelectItem>)}</SelectContent>
            </Select>
            <Input value={judgeModel} onChange={(e) => setJudgeModel(e.target.value.trim())} />
          </div>
        </div>
        <ButtonRow className="pt-3">
          <Button disabled={running || runnable.length === 0} onClick={runAll}>{running ? <Loader2 className="animate-spin" /> : <Play />}Run {runnable.length} candidate(s)</Button>
          <Button variant="outline" disabled={running || !available(judgeProvider) || !rows.some((r) => r.status === "done")} onClick={judgeAll}>Judge finished rows</Button>
          <Button variant="outline" disabled={!rows.some((r) => r.status === "done")} onClick={() => navigator.clipboard.writeText(markdown())}>Copy Markdown</Button>
        </ButtonRow>
      </section>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              {["model", "status", "gen", "QA", "translate", "tokens in/out", "1 set", "1 transl.", "count", "target?", "leak", "expl.", "QA flags", "translation", "grammar errs", "natural", "transl.", "no-expl", "notes"].map((h) => (
                <th key={h} className="px-2 py-1 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.candidate.model} className="border-t align-top">
                <td className="px-2 py-1 font-medium whitespace-nowrap">{r.candidate.model}</td>
                <td className="min-w-40 px-2 py-1">{r.status === "running" ? <Loader2 className="size-3 animate-spin" /> : r.status}{r.error && <div className="text-destructive">{r.error}</div>}</td>
                <td className="px-2 py-1">{sec(r.genMs)}</td>
                <td className="px-2 py-1">{sec(r.qaMs)}</td>
                <td className="px-2 py-1">{sec(r.trMs)}</td>
                <td className="px-2 py-1 whitespace-nowrap">{r.tokens ? `${r.tokens.input}/${r.tokens.output}` : "—"}</td>
                <td className="px-2 py-1">{usd(r.setCost)}</td>
                <td className="px-2 py-1">{usd(r.trCost)}</td>
                <td className="px-2 py-1">{r.counts?.join("+") ?? "—"}</td>
                <td className="px-2 py-1">{r.targetMissing ?? "—"}</td>
                <td className="px-2 py-1">{r.leakage ?? "—"}</td>
                <td className="px-2 py-1">{r.explanationHints ?? "—"}</td>
                <td className="px-2 py-1">{r.qaFlags ?? "—"}</td>
                <td className="px-2 py-1 whitespace-nowrap">{r.trHit ?? "—"}</td>
                <td className="px-2 py-1">{r.judge?.grammar_errors ?? "—"}</td>
                <td className="px-2 py-1">{r.judge?.naturalness ?? "—"}</td>
                <td className="px-2 py-1">{r.judge?.translation ?? "—"}</td>
                <td className="px-2 py-1">{r.judge?.no_explanation ?? "—"}</td>
                <td className="min-w-64 px-2 py-1 whitespace-pre-line">{r.judge?.notes ?? r.judgeError ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.filter((r) => r.sets).map((r) => (
        <details key={r.candidate.model} className="rounded-xl border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-medium">{r.candidate.model} — output</summary>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            {r.sets!.map((set) => (
              <ol key={set.targetId} className="list-decimal space-y-1 pl-5">
                <div className="-ml-5 font-semibold">{set.targetId}</div>
                {set.sentences.map((st, i) => (
                  <li key={i}><span lang="en">{st.l2}</span><br /><span className="text-muted-foreground" lang="ja">{st.l1}</span></li>
                ))}
              </ol>
            ))}
          </div>
          <p className="mt-3"><b>Translation:</b> {r.trText}</p>
        </details>
      ))}
    </div>
  );
}
