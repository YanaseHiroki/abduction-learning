export type SpanType = "target" | "object" | "complement" | "adverb" | "pp";

export interface Segment {
  text: string;
  type: SpanType | null;
}

function findAll(haystack: string, needle: string): [number, number][] {
  const out: [number, number][] = [];
  if (!needle) return out;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let i = h.indexOf(n);
  while (i !== -1) {
    out.push([i, i + n.length]);
    i = h.indexOf(n, i + n.length);
  }
  return out;
}

/** Split a sentence into segments, marking the target and optional guide spans. */
export function segment(text: string, spans: Partial<Record<SpanType, string | null | undefined>>): Segment[] {
  const order: SpanType[] = ["target", "object", "complement", "pp", "adverb"];
  const taken: { s: number; e: number; t: SpanType }[] = [];
  for (const t of order) {
    const needle = spans[t];
    if (!needle) continue;
    const hits = findAll(text, needle);
    const hit = t === "target" ? hits : hits.slice(0, 1);
    for (const [s, e] of hit) {
      if (taken.some((x) => s < x.e && e > x.s)) continue;
      taken.push({ s, e, t });
    }
  }
  taken.sort((a, b) => a.s - b.s);
  const out: Segment[] = [];
  let cursor = 0;
  for (const x of taken) {
    if (x.s > cursor) out.push({ text: text.slice(cursor, x.s), type: null });
    out.push({ text: text.slice(x.s, x.e), type: x.t });
    cursor = x.e;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), type: null });
  return out;
}

export const circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export function markersIn(text: string): number[] {
  const found: number[] = [];
  circled.forEach((c, i) => {
    if (text.includes(c)) found.push(i + 1);
  });
  return found;
}

export function fmtDate(ts: number, lang: string) {
  return new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(ts);
}

export function sentenceKey(targetId: string, index: number) {
  return `${targetId}:${index}`;
}

/**
 * Example sentences for the translation test's input, keyed by L1 (see tutorialTranslationSample, which
 * keys its ready-made sentence the same way). What goes in that field is a sentence in the learner's own
 * language, so the screen language must not decide it: an English screen with Japanese as the native
 * language still needs a Japanese example. ①② mark where the words being compared should come out.
 */
const translationSamples: Record<string, string> = {
  ja: "例: 嫌な意見も①聞くべきだし、噂は自然と②聞こえてくる。",
  en: "e.g. You should ①listen to harsh opinions; rumors just ②reach your ears.",
};

/** The example for this native language, or null where there is none (the card then explains ①② instead). */
export function translationSampleIn(l1: string): string | null {
  return translationSamples[l1] ?? null;
}
