import type { Target } from "./types";

export interface CourseGroup {
  id: string;
  label: Record<string, string>; // L1 label keyed by l1 code, with fallback "en"
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
        label: { ja: "聞く", en: "hear / listen" },
        targets: [
          { label: "listen", kind: "word" },
          { label: "hear", kind: "word" },
        ],
      },
      {
        id: "say",
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
        label: { ja: "見る", en: "look / watch / see" },
        targets: [
          { label: "look at", kind: "phrase" },
          { label: "watch", kind: "word" },
          { label: "see", kind: "word" },
        ],
        hint: { ja: "look は前置詞で意味が変わります。まずは look at に絞るとよいでしょう", en: "look changes meaning with prepositions; start with look at." },
      },
      {
        id: "think",
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
  { id: "basic", ja: "基本（教科書風）", en: "Basic (textbook style)" },
  { id: "news", ja: "ニュース", en: "News" },
  { id: "romance", ja: "恋愛ドラマ", en: "Romance drama" },
  { id: "workplace", ja: "部下と上司の会話", en: "Workplace conversation" },
  { id: "business_email", ja: "ビジネスメール", en: "Business email" },
  { id: "daily", ja: "日常会話", en: "Daily conversation" },
  { id: "academic", ja: "論文・学術", en: "Academic" },
];

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
