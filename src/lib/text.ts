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

const isLetter = (ch: string | undefined) => !!ch && /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]/u.test(ch);

/**
 * The target hits that are not the inside of a longer word. A short target like "at" or "on" otherwise lights up
 * in "that" and "one". Only scripts that separate words with spaces are checked: in Japanese or Chinese a word
 * runs straight into the next one, so any hit counts. When no hit stands on its own (a surface form the model
 * returned cut short), every hit is kept rather than showing nothing.
 */
function wholeWords(text: string, hits: [number, number][]) {
  const whole = hits.filter(([s, e]) => !(isLetter(text[s]) && isLetter(text[s - 1])) && !(isLetter(text[e - 1]) && isLetter(text[e])));
  return whole.length ? whole : hits;
}

/** Split a sentence into segments, marking the target and optional guide spans. */
export function segment(text: string, spans: Partial<Record<SpanType, string | null | undefined>>): Segment[] {
  const order: SpanType[] = ["target", "object", "complement", "pp", "adverb"];
  const taken: { s: number; e: number; t: SpanType }[] = [];
  for (const t of order) {
    const needle = spans[t];
    if (!needle) continue;
    const hits = findAll(text, needle);
    const hit = t === "target" ? wholeWords(text, hits) : hits.slice(0, 1);
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
 * The ready-made translation-test sentence, keyed by L1. What goes in that field is a sentence in the
 * learner's own language, so the screen language must not decide it: an English screen with Japanese as
 * the native language still needs a Japanese sentence. ①② mark where the words being compared should
 * come out — here, listen and hear, the pair the tutorial walks through.
 *
 * One copy serves both uses: the card shows it as the placeholder, and the tutorial (translationSampleFor)
 * prefills the field with it. They were written out twice before and had already drifted apart in English.
 */
const translationSamples: Record<string, string> = {
  ja: "嫌な意見も①聞くべきだし、噂は自然と②聞こえてくる。",
  en: "You should ①listen to harsh opinions, and rumors just ②reach your ears anyway.",
};

/** The sentence for this native language, or null where there is none (the card then explains ①② instead). */
export function translationSampleIn(l1: string): string | null {
  return translationSamples[l1] ?? null;
}

/**
 * Which studied expression an AI translation used at a circled marker.
 *
 * The model reports it in `target`, copied from the candidate list, so an inflected surface form
 * ("眺めて" for 眺める, "regardais" for regarder) still lands on its target. When that is missing —
 * an older stored result, or a model that writes the inflected form there too — fall back to the
 * surface form: the target whose label shares the longest prefix with it, as long as the shared part
 * covers at least half the label. Labels that tie (look at / look for against "looked at") fall to
 * the first one, the same guess the fallback has always made.
 */
export function matchTargetId(
  a: { word: string; target?: string | null },
  targets: { id: string; label: string }[],
): string | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const named = a.target ? targets.find((x) => norm(x.label) === norm(a.target!)) : undefined;
  if (named) return named.id;
  const forms = [a.target, a.word].filter((s): s is string => !!s).map(norm);
  let best: { id: string; len: number } | null = null;
  for (const x of targets) {
    const label = norm(x.label);
    if (!label) continue;
    const len = Math.max(...forms.map((f) => commonPrefixLength(f, label)));
    if (len < Math.ceil(label.length / 2)) continue;
    if (!best || len > best.len) best = { id: x.id, len };
  }
  return best?.id ?? null;
}

function commonPrefixLength(a: string, b: string) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}
