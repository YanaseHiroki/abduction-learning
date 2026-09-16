import * as z from "zod/v4";
import { structured, type CallOptions } from "./client";
import type { Sentence, Target } from "../types";

function langName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function describeTargets(targets: Target[]) {
  return targets
    .map((t) => {
      const kind = t.kind === "pattern" ? "construction pattern" : t.kind;
      return `- "${t.label}" (${kind}${t.spec ? `: ${t.spec}` : ""})`;
    })
    .join("\n");
}

/**
 * The core rule from the method: the learner is in charge, the AI is a data source.
 * No explanations of meaning or grammar unless explicitly asked in a given task.
 */
function systemPrompt(l1: string, l2: string) {
  return `You are a data source for a learner who studies ${langName(l2)} through abductive reasoning (data-driven learning).
The learner's native language is ${langName(l1)}.

Rules you must follow in every task:
1. The learner forms hypotheses by comparing examples. Do NOT explain meanings, nuances, or grammar unless the task explicitly asks for an explanation. Never add commentary fields beyond the schema.
2. Write natural, idiomatic ${langName(l2)} that a native speaker would actually produce. Vary subjects, tenses, and sentence types.
3. Translations into ${langName(l1)} must be natural and faithful. Keep the translation of the target expression consistent with how a ${langName(l1)} speaker would really say it, not with a dictionary gloss.
4. Follow the learner's constraints exactly (genre, level, word limits, candidate words, fixed glosses).
5. You can make mistakes. Double-check verb forms, agreement, and articles before answering.
6. Output only what the JSON schema asks for.`;
}

// ---------- Example generation ----------

const SentenceSchema = z.object({
  l2: z.string(),
  l1: z.string(),
  target_form: z.string().describe("the exact surface form of the target as it appears in l2, e.g. 'listened'"),
  object: z.string().nullable().describe("the object / thing the action is directed at, exactly as written in l2, or null"),
  complement: z.string().nullable().describe("complement (e.g. in SVOC), exactly as written, or null"),
  adverb: z.string().nullable().describe("adverb modifying the target, exactly as written, or null"),
  preposition_phrase: z.string().nullable().describe("prepositional phrase attached to the target, exactly as written, or null"),
});

const TargetExamplesSchema = z.object({
  sentences: z.array(SentenceSchema),
});

export interface GenerateExamplesInput {
  l1: string;
  l2: string;
  /** every target in this generation; each one is requested separately */
  targets: Target[];
  /** labels of the inquiry's other targets that were left out, to contrast against */
  contrastWith: string[];
  count: number;
  level: string;
  genre: string;
  maxWords: number | null;
  adverbs: boolean;
}

export interface TargetExamples {
  targetId: string;
  sentences: Sentence[];
  meta: { model: string; generatedAt: number };
  usage?: { input: number; output: number };
  elapsedMs: number;
}

/**
 * One request per target, so a set of 2–4 targets is generated in parallel and each
 * finished target can be shown as soon as it arrives.
 */
export async function generateExamplesForTarget(input: GenerateExamplesInput, target: Target, opts: CallOptions = {}): Promise<TargetExamples> {
  const { l1, l2, targets, contrastWith, count, level, genre, maxWords, adverbs } = input;
  const siblings = targets.filter((t) => t.id !== target.id).map((t) => t.label);
  const others = [...siblings, ...contrastWith];
  const quoted = others.map((c) => `"${c}"`).join(", ");
  const constraints = [
    `Produce exactly ${count} sentences for this target.`,
    `Level: ${level}.`,
    `Genre / register: ${genre}.`,
    maxWords ? `Each sentence at most ${maxWords} words.` : null,
    others.length ? `The learner compares "${target.label}" with ${quoted}. Do not use those expressions in the sentences.` : null,
    adverbs
      ? `Every sentence must contain an adverb modifying the target${others.length ? ` that reveals how "${target.label}" differs from ${quoted}` : ""}.`
      : others.length
        ? `Choose contexts typical of "${target.label}" that reveal how it differs from ${quoted}.`
        : null,
    `Vary sentence types (statements, questions, imperatives, negatives) and syntactic patterns where natural.`,
    `Fill object / complement / adverb / preposition_phrase only with substrings that literally appear in l2.`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = `Target:\n${describeTargets([target])}\n\n${constraints}`;
  const { data, model, generatedAt, usage, elapsedMs } = await structured(systemPrompt(l1, l2), user, TargetExamplesSchema, {
    effort: "low",
    maxTokens: 4000,
    ...opts,
  });
  const sentences: Sentence[] = data.sentences.map((s) => ({ ...s, flag: null }));
  return { targetId: target.id, sentences, meta: { model, generatedAt }, usage, elapsedMs };
}

/** All targets at once (parallel). Kept for callers that do not need per-target progress. */
export async function generateExamples(input: GenerateExamplesInput, opts: CallOptions = {}) {
  const results = await Promise.all(input.targets.map((t) => generateExamplesForTarget(input, t, opts)));
  const sets = results.map(({ targetId, sentences }) => ({ targetId, sentences }));
  const last = results[results.length - 1];
  return { sets, meta: { model: last?.meta.model ?? "", generatedAt: last?.meta.generatedAt ?? Date.now() }, results };
}

// ---------- QA pass (cheap model) ----------

const QASchema = z.object({
  issues: z.array(
    z.object({
      set_index: z.number(),
      sentence_index: z.number(),
      reason: z.string().describe("short reason in the learner's language"),
    }),
  ),
});

export async function qaCheck(l1: string, l2: string, sets: { sentences: Sentence[] }[], opts: CallOptions = {}) {
  const listing = sets
    .map((s, si) => s.sentences.map((x, i) => `[${si},${i}] ${x.l2}`).join("\n"))
    .join("\n");
  const user = `Check each ${langName(l2)} sentence for grammatical errors or clearly unnatural wording (wrong verb form, agreement, missing article, broken tense). Report only real problems; minor stylistic issues are fine. Reasons in ${langName(l1)}.\n\n${listing}`;
  const { data } = await structured(
    `You are a careful proofreader of ${langName(l2)}. Output only the JSON schema.`,
    user,
    QASchema,
    { cheap: true, effort: "low", maxTokens: 2000, ...opts },
  );
  return data.issues;
}

export async function regenerateSentence(
  l1: string,
  l2: string,
  target: Target,
  bad: Sentence,
  reason: string,
  params: { level: string; genre: string; maxWords: number | null; adverbs: boolean },
) {
  const user = `The following sentence for target "${target.label}" was flagged as suspicious (${reason}):\n${bad.l2}\n\nProduce ONE corrected or replacement sentence in the same genre (${params.genre}), level (${params.level})${
    params.maxWords ? `, at most ${params.maxWords} words` : ""
  }${params.adverbs ? ", containing an adverb modifying the target" : ""}.`;
  const { data, model, generatedAt } = await structured(
    systemPrompt(l1, l2),
    user,
    z.object({ sentence: SentenceSchema }),
    { effort: "low", maxTokens: 1500 },
  );
  return { sentence: { ...data.sentence, flag: null } as Sentence, meta: { model, generatedAt } };
}

// ---------- Observation: optional AI extraction (after the learner marked) ----------

const ExtractionSchema = z.object({
  extraction: z.array(z.object({ target: z.string(), items: z.array(z.string()) })),
});

export async function extractForPerspective(
  l1: string,
  l2: string,
  perspective: string,
  sets: { target: Target; sentences: Sentence[] }[],
) {
  const listing = sets
    .map((s) => `## ${s.target.label}\n` + s.sentences.map((x, i) => `${i + 1}. ${x.l2}\n   (${x.l1})`).join("\n"))
    .join("\n\n");
  const user = `Perspective: ${perspective}.\nFor each target, list the item corresponding to this perspective in each sentence (one short string per sentence, in the order given). Quote the text as it appears; if the perspective is about the ${langName(l1)} translation, quote from the translation. No explanations.\n\n${listing}`;
  const { data, model, generatedAt } = await structured(systemPrompt(l1, l2), user, ExtractionSchema, { effort: "low" });
  return { extraction: data.extraction, meta: { model, generatedAt } };
}

// ---------- Syntax analysis (explanation allowed: learner asked) ----------

const SyntaxSchema = z.object({
  analyses: z.array(
    z.object({
      sentence_index: z.number(),
      elements: z.array(z.object({ role: z.string(), text: z.string() })),
      pattern: z.string().describe("short pattern label, e.g. 'S V O(that-clause)'"),
    }),
  ),
});

export async function analyzeSyntax(
  l1: string,
  l2: string,
  target: Target,
  sentences: Sentence[],
  roles: { id: string; label: string }[],
) {
  const user = `The learner asked for a structural analysis of these sentences containing "${target.label}". Use ONLY these role ids: ${roles
    .map((r) => `${r.id} (${r.label})`)
    .join(", ")}. Quote element text exactly. Give a compact pattern label per sentence.\n\n${sentences
    .map((s, i) => `${i}. ${s.l2}`)
    .join("\n")}`;
  const { data, model, generatedAt } = await structured(systemPrompt(l1, l2), user, SyntaxSchema, { effort: "medium" });
  return { analyses: data.analyses, meta: { model, generatedAt } };
}

// ---------- Verification: translation test ----------

const TranslationSchema = z.object({
  l2_text: z.string(),
  alignments: z.array(
    z.object({
      index: z.number().describe("the circled number in the source text"),
      word: z.string().describe("the target expression you used at that position, in its surface form"),
      target: z
        .string()
        .nullable()
        .describe("which expression under study that is, copied exactly as the learner wrote it, or null if none of them was used"),
    }),
  ),
  note: z.string().nullable().describe("only if the learner asked a feasibility question; otherwise null"),
});

export interface TranslateTestInput {
  l1: string;
  l2: string;
  l1Text: string;
  targets: Target[];
  restrictToTargets: boolean;
  fixedGloss: string;
  feasibilityTarget: Target | null;
}

export async function translateTest(input: TranslateTestInput, opts: CallOptions = {}) {
  const { l1, l2, l1Text, targets, restrictToTargets, fixedGloss, feasibilityTarget } = input;
  const rules = [
    `Translate the ${langName(l1)} text into natural ${langName(l2)}. The text contains circled numbers (①②③…) placed right before expressions the learner is studying.`,
    `For every circled number, report which target expression you used at that position: word is the form as it appears in your translation (inflected or conjugated as the sentence requires), and target is the same expression copied letter for letter from the list under study, in the form the learner wrote it. Do not include the circled numbers in l2_text.`,
    restrictToTargets
      ? `At each numbered position you must choose the most appropriate one of these candidates only: ${targets.map((t) => `"${t.label}"`).join(", ")}.`
      : `Choose whatever is most natural; the candidates under study are ${targets.map((t) => `"${t.label}"`).join(", ")}, but you are not restricted to them.`,
    fixedGloss
      ? `The learner wants every numbered expression to correspond to the ${langName(l1)} word "${fixedGloss}"; express nuance differences elsewhere in the sentence.`
      : null,
    feasibilityTarget
      ? `Feasibility question: can this be expressed using "${feasibilityTarget.label}"? If yes, use it and set note to a one-line remark about naturalness; if not, translate naturally and explain briefly in note (in ${langName(l1)}).`
      : `Leave note null.`,
  ]
    .filter(Boolean)
    .join("\n");
  const { data, model, generatedAt, usage, elapsedMs } = await structured(systemPrompt(l1, l2), `${rules}\n\nText:\n${l1Text}`, TranslationSchema, {
    effort: "medium",
    maxTokens: 3000,
    ...opts,
  });
  return { ...data, meta: { model, generatedAt }, usage, elapsedMs };
}

// ---------- Verification: frame test ----------

const FrameSchema = z.object({
  judgments: z.array(
    z.object({
      frame_index: z.number(),
      target: z.string(),
      natural: z.boolean(),
      example: z.string().describe("a natural example sentence if natural, otherwise the closest natural alternative"),
      note: z.string().describe(`one short line in the learner's language`),
    }),
  ),
});

export async function frameTest(l1: string, l2: string, targets: Target[], frames: string[]) {
  const user = `For each diagnostic frame (described in ${langName(l1)}) and each target, judge whether combining them yields natural ${langName(l2)}. The learner has already recorded predictions, so a brief note per judgment is allowed here.\n\nTargets:\n${describeTargets(targets)}\n\nFrames:\n${frames
    .map((f, i) => `${i}. ${f}`)
    .join("\n")}`;
  const { data, model, generatedAt } = await structured(systemPrompt(l1, l2), user, FrameSchema, { effort: "medium", maxTokens: 4000 });
  return { judgments: data.judgments, meta: { model, generatedAt } };
}

// ---------- Summary: writing feedback ----------

const FeedbackSchema = z.object({
  comments: z.array(
    z.object({
      index: z.number(),
      comment: z.string().describe("evidence-based remark in the learner's language, no verdict words like correct/incorrect"),
      confidence: z.enum(["low", "medium", "high"]),
    }),
  ),
});

export async function writingFeedback(
  l1: string,
  l2: string,
  targets: Target[],
  hypothesis: string,
  sentences: string[],
) {
  const user = `The learner's current hypothesis about ${targets.map((t) => `"${t.label}"`).join(", ")}:\n${hypothesis}\n\nThey wrote these ${langName(l2)} sentences to apply it. Act as a partner, not a teacher: for each sentence, point to evidence (how a native speaker would say it, what the choice implies) and state your confidence. Avoid verdict words. Write in ${langName(l1)}.\n\n${sentences
    .map((s, i) => `${i}. ${s}`)
    .join("\n")}`;
  const { data, model, generatedAt } = await structured(systemPrompt(l1, l2), user, FeedbackSchema, { effort: "medium", maxTokens: 3000 });
  return { comments: data.comments, meta: { model, generatedAt } };
}
