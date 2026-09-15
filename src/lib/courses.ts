import type { Target } from "./types";

export interface CourseGroup {
  id: string;
  label: Record<string, string>; // L1 label keyed by l1 code, with fallback "en"
  emoji: string;
  targets: Omit<Target, "id">[];
  hint?: Record<string, string>;
}

export interface Course {
  l2: string;
  groups: CourseGroup[];
}

/** Default course for English: 13 basic verbs in 4 groups (the scope used in the book). */
export const courses: Course[] = [
  {
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
