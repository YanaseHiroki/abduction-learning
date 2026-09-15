/**
 * Language packs: perspectives (着眼点) and syntax roles per L2.
 * Anything not defined for a language falls back to the generic pack.
 */
export interface LangPack {
  perspectives: { id: string; ja: string; en: string; usesExamples: boolean }[];
  syntaxRoles: { id: string; ja: string; en: string }[];
}

const common: LangPack["perspectives"] = [
  { id: "gloss", ja: "訳語", en: "Translation", usesExamples: true },
  { id: "modifier", ja: "修飾する副詞", en: "Modifying adverb", usesExamples: true },
  { id: "object", ja: "目的語（動作の対象）", en: "Object (what the action targets)", usesExamples: true },
  { id: "object_content", ja: "目的語の中身", en: "Content of the object", usesExamples: true },
  { id: "subject", ja: "主語", en: "Subject", usesExamples: true },
  { id: "sentence_type", ja: "文の種類（命令・否定・疑問）", en: "Sentence type", usesExamples: true },
  { id: "l1_side", ja: "母語側の分け方", en: "How my language divides it", usesExamples: false },
  { id: "free", ja: "自由", en: "Free", usesExamples: true },
];

const genericRoles: LangPack["syntaxRoles"] = [
  { id: "S", ja: "主語", en: "Subject" },
  { id: "V", ja: "述語", en: "Predicate" },
  { id: "O", ja: "目的語", en: "Object" },
  { id: "MOD", ja: "修飾語", en: "Modifier" },
  { id: "OTHER", ja: "その他", en: "Other" },
];

export const langPacks: Record<string, LangPack> = {
  generic: { perspectives: common, syntaxRoles: genericRoles },
  en: {
    perspectives: [
      ...common.slice(0, 4),
      { id: "preposition", ja: "後続の前置詞", en: "Following preposition", usesExamples: true },
      ...common.slice(4),
    ],
    syntaxRoles: [
      { id: "S", ja: "S 主語", en: "S subject" },
      { id: "V", ja: "V 述語", en: "V verb" },
      { id: "O", ja: "O 目的語", en: "O object" },
      { id: "O2", ja: "O₂ 目的語", en: "O₂ second object" },
      { id: "C", ja: "C 補語", en: "C complement" },
      { id: "THAT", ja: "that節", en: "that-clause" },
      { id: "TOINF", ja: "to不定詞", en: "to-infinitive" },
      { id: "ING", ja: "-ing句", en: "-ing phrase" },
      { id: "PP", ja: "前置詞句", en: "prepositional phrase" },
      { id: "ADV", ja: "副詞", en: "adverb" },
      { id: "OTHER", ja: "その他", en: "other" },
    ],
  },
  ja: {
    perspectives: [
      ...common.slice(0, 4),
      { id: "particle", ja: "助詞", en: "Particle", usesExamples: true },
      { id: "transitivity", ja: "自動詞・他動詞", en: "Transitive / intransitive", usesExamples: true },
      ...common.slice(4),
    ],
    syntaxRoles: [
      { id: "S", ja: "主語（が／は）", en: "Subject" },
      { id: "O", ja: "目的語（を）", en: "Object (o)" },
      { id: "NI", ja: "に格", en: "ni-phrase" },
      { id: "V", ja: "述語", en: "Predicate" },
      { id: "MOD", ja: "修飾語", en: "Modifier" },
      { id: "OTHER", ja: "その他", en: "Other" },
    ],
  },
};

export function getLangPack(l2: string): LangPack {
  const base = l2.split("-")[0].toLowerCase();
  return langPacks[base] ?? langPacks.generic;
}
