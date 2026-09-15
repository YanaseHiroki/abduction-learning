export type TargetKind = "word" | "phrase" | "pattern";

export interface Target {
  id: string;
  /** Display label, e.g. "listen", "look at", "I consider + O + C" */
  label: string;
  kind: TargetKind;
  /** Optional free-text spec for patterns, e.g. "consider followed by object and complement" */
  spec?: string;
}

export interface Inquiry {
  id: string;
  l1: string; // BCP47, learner's native language
  l2: string; // BCP47, language being learned
  groupLabel?: string; // L1 concept label, e.g. 「聞く」
  targets: Target[];
  question?: string; // optional guiding question
  genre: string;
  level: string;
  createdAt: number;
  updatedAt: number;
}

export type CardKind =
  | "examples"
  | "observation"
  | "syntax"
  | "hypothesis"
  | "verify_translation"
  | "verify_frame"
  | "summary";

export interface Sentence {
  l2: string;
  l1: string;
  /** surface form of the target as it appears in l2 */
  target_form: string;
  object?: string | null;
  complement?: string | null;
  adverb?: string | null;
  preposition_phrase?: string | null;
  flag?: { source: "auto" | "user"; reason: string } | null;
}

export interface GenerationMeta {
  model: string;
  generatedAt: number;
}

export interface ExamplesParams {
  targetIds: string[];
  count: number;
  level: string;
  genre: string;
  maxWords: number | null;
  adverbs: boolean;
  contrastWith: string[]; // labels of other targets to contrast against
}

export interface ExamplesPayload {
  params: ExamplesParams;
  sets: { targetId: string; sentences: Sentence[] }[];
  meta: GenerationMeta;
  showGuides: boolean; // underline object / adverb / preposition
}

export interface Mark {
  id: string;
  sentenceKey: string; // `${targetId}:${index}`
  targetId: string;
  text: string;
  tag?: string;
  side: "l1" | "l2";
}

export interface ObservationPayload {
  perspective: string;
  examplesCardId: string;
  marks: Mark[];
  notes: string;
  aiExtraction?: { targetId: string; items: string[] }[] | null;
  aiRevealed: boolean;
}

export interface SyntaxElement {
  id: string;
  role: string;
  text: string;
}

export interface SyntaxPayload {
  examplesCardId: string;
  analyses: Record<string, SyntaxElement[]>; // sentenceKey -> elements
  patterns: Record<string, string>; // sentenceKey -> pattern label typed by learner
  aiAnalysis?: Record<string, { elements: { role: string; text: string }[]; pattern: string }> | null;
  aiRevealed: boolean;
  notes: string;
}

export interface HypothesisLine {
  targetId: string;
  text: string;
  uncertain: boolean;
}

export interface HypothesisPayload {
  version: number;
  lines: HypothesisLine[];
  notes: string;
  basedOn: string[]; // card ids
}

export interface TranslationMarker {
  index: number; // 1-based, corresponds to ①②③ in the L1 text
  predictedTargetId: string | null;
}

export interface TranslationResult {
  l2Text: string;
  alignments: { index: number; word: string; targetId: string | null }[];
  note: string | null;
  meta: GenerationMeta;
}

export interface VerifyTranslationPayload {
  l1Text: string;
  markers: TranslationMarker[];
  restrictToTargets: boolean;
  fixedGloss: string; // e.g. 「思う」 — translate every marked verb with this L1 word in mind
  feasibilityTargetId: string | null; // "can this be expressed with X?"
  result: TranslationResult | null;
  revealed: boolean;
  history: { l1Text: string; result: TranslationResult }[];
}

export interface FrameTest {
  id: string;
  frame: string; // L1 description of a diagnostic frame, e.g. 「〜するつもりだ」
  predictions: Record<string, "ok" | "ng" | "unsure">; // targetId -> prediction
}

export interface FrameResult {
  judgments: { frameId: string; targetId: string; natural: boolean; example: string; note: string }[];
  meta: GenerationMeta;
}

export interface VerifyFramePayload {
  frames: FrameTest[];
  result: FrameResult | null;
  revealed: boolean;
}

export interface SummaryPayload {
  lines: HypothesisLine[];
  writing: string[];
  feedback: { comments: { index: number; comment: string; confidence: string }[]; meta: GenerationMeta } | null;
  savedNoteId: string | null;
}

export type CardPayloadMap = {
  examples: ExamplesPayload;
  observation: ObservationPayload;
  syntax: SyntaxPayload;
  hypothesis: HypothesisPayload;
  verify_translation: VerifyTranslationPayload;
  verify_frame: VerifyFramePayload;
  summary: SummaryPayload;
};

export interface Card<K extends CardKind = CardKind> {
  id: string;
  inquiryId: string;
  kind: K;
  createdAt: number;
  updatedAt: number;
  payload: CardPayloadMap[K];
}

export interface SchemaNote {
  id: string;
  inquiryId: string;
  l1: string;
  l2: string;
  targets: Target[];
  lines: HypothesisLine[];
  createdAt: number;
  lastRevisitedAt: number | null;
}
