import type { Target } from "./types";

export interface CourseGroup {
  id: string;
  /**
   * The group's name, keyed by language code with fallback "en". Shown on screen in uiLang;
   * the copy saved on an inquiry as `groupLabel` stays in l1 (see Inquiry.groupLabel).
   */
  label: Record<string, string>;
  emoji: string;
  targets: Omit<Target, "id">[];
  hint?: Record<string, string>; // UI copy keyed by uiLang code, with fallback "en"
}

/**
 * Whether the group's word list is worth showing under its name. In English the name often *is* the
 * list ("say / tell / speak / talk"), so repeating it below adds nothing and only makes the card taller;
 * where the two differ (「見る」/ "look / watch / see" vs the target "look at") the list still earns its place.
 */
export function showsTargetList(g: CourseGroup, lang: string) {
  const name = (g.label[lang] ?? g.label.en).split("/").map((x) => x.trim().toLowerCase());
  const targets = g.targets.map((x) => x.label.trim().toLowerCase());
  return name.length !== targets.length || targets.some((x) => !name.includes(x));
}

export interface Course {
  id: string;
  l2: string;
  groups: CourseGroup[];
}

/**
 * Default courses, in the order they are recommended. A language may have several; the first one is the
 * tutorial's (see tutorialGroup), so new courses go after it. On screen they are not told apart: all their groups
 * share one "basic course" row, because to the learner every card there is the same kind of thing, a ready-made
 * set of words, as opposed to free inquiry.
 */
export const courses: Course[] = [
  {
    // The 13 basic verbs in 4 groups: the scope used in the book.
    id: "verbs",
    l2: "en",
    groups: [
      {
        id: "hear",
        emoji: "👂",
        label: { ja: "聞く", en: "hear / listen" },
        targets: [
          { label: "listen", kind: "word" },
          { label: "hear", kind: "word" },
        ],
      },
      {
        id: "say",
        emoji: "💬",
        label: { ja: "話す", en: "say / tell / speak / talk" },
        targets: [
          { label: "say", kind: "word" },
          { label: "tell", kind: "word" },
          { label: "speak", kind: "word" },
          { label: "talk", kind: "word" },
        ],
        hint: { ja: "まず say & tell、次に speak & talk のように2語ずつ比べるのがおすすめです", en: "Compare two at a time: say & tell, then speak & talk." },
      },
      {
        id: "see",
        emoji: "👀",
        label: { ja: "見る", en: "look / watch / see" },
        targets: [
          { label: "look at", kind: "phrase" },
          { label: "watch", kind: "word" },
          { label: "see", kind: "word" },
        ],
        hint: { ja: "look は前置詞で意味が変わります。\nまずは look at に絞るとよいでしょう", en: "look changes meaning with prepositions.\nStart with look at." },
      },
      {
        id: "think",
        emoji: "🤔",
        label: { ja: "考える", en: "think / believe / know / consider" },
        targets: [
          { label: "think", kind: "word" },
          { label: "believe", kind: "word" },
          { label: "know", kind: "word" },
          { label: "consider", kind: "word" },
        ],
        hint: { ja: "「I think の代わりになる動詞は？」という問いを立てると探究しやすいです", en: "A good guiding question: what can replace 'I think'?" },
      },
    ],
  },
  {
    // One of the next topics the book names. Only the word list is used; the spec keeps the examples to place and
    // time, because at / in / on also head countless fixed phrases ("interested in", "depend on") that would bury
    // the contrast the learner is looking for.
    id: "prepositions",
    l2: "en",
    groups: [
      {
        id: "at-in-on",
        emoji: "📍",
        // The Japanese name is the concept as a Japanese speaker meets it: both particles cover all three words.
        label: { ja: "〜に・〜で", en: "at / in / on" },
        targets: [
          { label: "at", kind: "word", spec: "preposition of place or time" },
          { label: "in", kind: "word", spec: "preposition of place or time" },
          { label: "on", kind: "word", spec: "preposition of place or time" },
        ],
        hint: { ja: "場所の文と時間の文を分けて見比べると、違いが見えやすくなります", en: "Look at place and time sentences separately; the differences show more easily." },
      },
    ],
  },
];

export const genres = [
  { id: "basic", emoji: "📘", ja: "基本（教科書風）", en: "Basic (textbook style)" },
  { id: "news", emoji: "📰", ja: "ニュース", en: "News" },
  { id: "romance", emoji: "💕", ja: "恋愛ドラマ", en: "Romance drama" },
  { id: "workplace", emoji: "💼", ja: "部下と上司の会話", en: "Workplace conversation" },
  { id: "business_email", emoji: "✉️", ja: "ビジネスメール", en: "Business email" },
  { id: "daily", emoji: "☕", ja: "日常会話", en: "Daily conversation" },
  { id: "academic", emoji: "🎓", ja: "論文・学術", en: "Academic" },
];

/** How an example set is generated, apart from which targets it covers. */
export interface ExampleSettings {
  genre: string;
  level: string;
  count: number;
  maxWords: string; // "" = no limit
  adverbs: boolean;
}

export const defaultExampleSettings = (genre = "news", level = "beginner"): ExampleSettings => ({ genre, level, count: 10, maxWords: "", adverbs: false });

export const levels = [
  { id: "beginner", ja: "中学生レベル", en: "Beginner (junior high)" },
  { id: "intermediate", ja: "高校生レベル", en: "Intermediate (high school)" },
  { id: "advanced", ja: "上級", en: "Advanced" },
];

export function languageName(code: string, inLang: string) {
  try {
    return new Intl.DisplayNames([inLang], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export const languageOptions = ["ja", "en", "zh", "ko", "fr", "de", "es", "it", "pt", "ru", "vi", "th", "id"];

/**
 * Keep the two study languages apart. Learning the language you already speak makes no sense: the prompt
 * would read "studies English … native language is English" and the translation test would have nothing to
 * test. So when a choice collides with the other side, that side moves out of the way — it takes the language
 * just given up, which is what a learner switching direction means anyway (ja→en becomes en→ja). A pair that
 * was already stored as the same language has nothing to swap back, so the other side falls back to the first
 * different language on offer.
 */
export function chooseLanguage(side: "l1" | "l2", code: string, pair: { l1: string; l2: string }): { l1: string; l2: string } {
  const other = side === "l1" ? pair.l2 : pair.l1;
  if (other !== code) return side === "l1" ? { l1: code, l2: pair.l2 } : { l1: pair.l1, l2: code };
  const given = side === "l1" ? pair.l1 : pair.l2;
  const moved = given !== code ? given : (languageOptions.find((c) => c !== code) ?? code);
  return side === "l1" ? { l1: code, l2: moved } : { l1: moved, l2: code };
}
