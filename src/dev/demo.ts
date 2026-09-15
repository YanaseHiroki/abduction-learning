import { db } from "@/lib/db";
import { defaultSettings, setSettings } from "@/lib/settings";
import type { Card, CardKind, CardPayloadMap, HypothesisLine, Inquiry, SchemaNote, Sentence } from "@/lib/types";

/**
 * A finished "listen / hear" inquiry for the help screenshots (scripts/help-shots.ts).
 * Everything an AI call would have produced is written here instead, so the screens can be
 * reproduced without spending the free tier. Ids are fixed so the script can find each card
 * as `#card-<id>`.
 */
export const DEMO_INQUIRY_ID = "demo";
export const demoCardIds = {
  examples: "demo-examples",
  observation: "demo-observation",
  hypothesis: "demo-hypothesis",
  translation: "demo-translation",
  summary: "demo-summary",
} as const;

const LISTEN = "t-listen";
const HEAR = "t-hear";
/** Fixed dates so the screenshots do not change from day to day. */
const T0 = Date.UTC(2026, 8, 1, 1, 0);
const minutes = (n: number) => T0 + n * 60_000;

const s = (l2: string, l1: string, target_form: string, extra: Partial<Sentence> = {}): Sentence => ({
  l2,
  l1,
  target_form,
  object: null,
  complement: null,
  adverb: null,
  preposition_phrase: null,
  flag: null,
  ...extra,
});

/** The learner's own writing follows the screen language so each set of screenshots reads naturally. */
function learnerText(lang: "ja" | "en") {
  return lang === "ja"
    ? {
        tags: { listen: "自分から", hear: "勝手に入る" },
        notes: "listen の後ろにはいつも to が来る。\nhear は音や話がそのまま目的語になる。",
        hypothesis: [
          { targetId: LISTEN, text: "自分から耳を向けて聞く（to が付く）", uncertain: false },
          { targetId: HEAR, text: "音や話が自然に耳に入ってくる", uncertain: true },
        ],
        hypothesisNotes: "観察: listen はすべて to 〜。hear は a noise や me を直接とる。",
        summary: [
          { targetId: LISTEN, text: "自分から耳を向けて聞く（to が付く）", uncertain: false },
          { targetId: HEAR, text: "音や話が自然に耳に入ってくる", uncertain: false },
        ],
      }
    : {
        tags: { listen: "on purpose", hear: "just arrives" },
        notes: "listen is always followed by to.\nhear takes the sound or the news directly.",
        hypothesis: [
          { targetId: LISTEN, text: "Choosing to pay attention (takes \"to\")", uncertain: false },
          { targetId: HEAR, text: "A sound reaches you whether you try or not", uncertain: true },
        ],
        hypothesisNotes: "Observed: listen always comes with to; hear takes a noise or me directly.",
        summary: [
          { targetId: LISTEN, text: "Choosing to pay attention (takes \"to\")", uncertain: false },
          { targetId: HEAR, text: "A sound reaches you whether you try or not", uncertain: false },
        ],
      };
}

function card<K extends CardKind>(id: string, kind: K, at: number, payload: CardPayloadMap[K]): Card<K> {
  return { id, inquiryId: DEMO_INQUIRY_ID, kind, createdAt: at, updatedAt: at, payload };
}

export function demoData(lang: "ja" | "en") {
  const text = learnerText(lang);
  const meta = { model: "demo", generatedAt: minutes(1) };

  const inquiry: Inquiry = {
    id: DEMO_INQUIRY_ID,
    l1: "ja",
    l2: "en",
    groupLabel: "聞く",
    targets: [
      { id: LISTEN, label: "listen", kind: "word" },
      { id: HEAR, label: "hear", kind: "word" },
    ],
    genre: "daily",
    level: "beginner",
    createdAt: T0,
    updatedAt: minutes(40),
  };

  const sets = [
    {
      targetId: LISTEN,
      sentences: [
        s("I always listen to music on the train.", "電車ではいつも音楽を聴いている。", "listen", { adverb: "always", preposition_phrase: "to music" }),
        s("Please listen carefully to the instructions.", "指示をよく聞いてください。", "listen", { adverb: "carefully", preposition_phrase: "to the instructions" }),
        s("She listened to his story without a word.", "彼女は黙って彼の話に耳を傾けた。", "listened", { preposition_phrase: "to his story" }),
      ],
    },
    {
      targetId: HEAR,
      sentences: [
        s("I heard a strange noise last night.", "昨夜、変な物音が聞こえた。", "heard", { object: "a strange noise" }),
        s("Can you hear me?", "私の声、聞こえますか？", "hear", { object: "me" }),
        s("I heard that the shop is closing.", "その店が閉まるって聞いたよ。", "heard", { object: "that the shop is closing" }),
      ],
    },
  ];

  const mark = (id: string, targetId: string, i: number, t: string, tag?: string) => ({ id, sentenceKey: `${targetId}:${i}`, targetId, text: t, side: "l2" as const, tag });
  const hypothesis: HypothesisLine[] = text.hypothesis;

  const cards: Card[] = [
    card(demoCardIds.examples, "examples", minutes(1), {
      params: { targetIds: [LISTEN, HEAR], count: 3, level: "beginner", genre: "daily", maxWords: null, adverbs: false, contrastWith: [] },
      sets,
      meta,
      showGuides: false,
    }),
    card(demoCardIds.observation, "observation", minutes(10), {
      perspective: "preposition",
      examplesCardId: demoCardIds.examples,
      marks: [
        mark("m1", LISTEN, 0, "to music", text.tags.listen),
        mark("m2", LISTEN, 1, "to the instructions", text.tags.listen),
        mark("m3", HEAR, 0, "a strange noise", text.tags.hear),
        mark("m4", HEAR, 1, "me", text.tags.hear),
      ],
      notes: text.notes,
      aiExtraction: null,
      aiRevealed: false,
    }),
    card(demoCardIds.hypothesis, "hypothesis", minutes(20), { version: 1, lines: hypothesis, notes: text.hypothesisNotes, basedOn: [] }),
    card(demoCardIds.translation, "verify_translation", minutes(30), {
      l1Text: "先生の話を①聞いていたら、外で雷が②聞こえた。",
      markers: [
        { index: 1, predictedTargetId: LISTEN },
        { index: 2, predictedTargetId: HEAR },
      ],
      restrictToTargets: true,
      fixedGloss: "",
      feasibilityTargetId: null,
      result: {
        l2Text: "I was listening to the teacher when I heard thunder outside.",
        alignments: [
          { index: 1, word: "listening", targetId: LISTEN },
          { index: 2, word: "heard", targetId: HEAR },
        ],
        note: null,
        meta: { model: "demo", generatedAt: minutes(31) },
      },
      revealed: true,
      history: [],
    }),
    card(demoCardIds.summary, "summary", minutes(40), {
      lines: text.summary,
      writing: ["I listen to podcasts while I cook.", "I heard my name in the crowd.", ""],
      feedback: null,
      savedNoteId: null, // unsaved, so the "save to notes" button shows
    }),
  ];

  const note: SchemaNote = {
    id: "demo-note",
    inquiryId: DEMO_INQUIRY_ID,
    l1: "ja",
    l2: "en",
    targets: inquiry.targets,
    lines: text.summary,
    createdAt: minutes(41),
    lastRevisitedAt: null,
  };

  return { inquiry, cards, notes: [note] };
}

/** Replaces everything in IndexedDB with the demo inquiry and sets the screen language. */
export async function seedDemo(lang: "ja" | "en") {
  const { inquiry, cards, notes } = demoData(lang);
  await db.transaction("rw", db.inquiries, db.cards, db.schemaNotes, async () => {
    await Promise.all([db.inquiries.clear(), db.cards.clear(), db.schemaNotes.clear()]);
    await db.inquiries.add(inquiry);
    await db.cards.bulkAdd(cards);
    await db.schemaNotes.bulkAdd(notes);
  });
  // A dummy key hides the "no AI connection" notice. Nothing is ever sent with it: the screenshot
  // script never presses an AI button and blocks every request that leaves the dev server.
  setSettings({
    uiLang: lang,
    defaultL1: "ja",
    defaultL2: "en",
    provider: "anthropic",
    providers: { ...defaultSettings.providers, anthropic: { ...defaultSettings.providers.anthropic, apiKey: "demo" } },
    showTranslations: true,
  });
}
