import { describe, expect, it } from "vitest";
import { cardHasContent, cardHint, cardReady, markedTargets, nextSteps, suggestRole, taggedTargets, verifiedAsPredicted } from "./guide";
import type { Card, CardKind, CardPayloadMap, Inquiry, Sentence } from "./types";

const inquiry: Inquiry = {
  id: "i1",
  l1: "ja",
  l2: "en",
  targets: [
    { id: "t1", label: "listen", kind: "word" },
    { id: "t2", label: "hear", kind: "word" },
  ],
  genre: "daily",
  level: "beginner",
  createdAt: 0,
  updatedAt: 0,
};

function card<K extends CardKind>(kind: K, payload: CardPayloadMap[K]): Card<K> {
  return { id: "c1", inquiryId: "i1", kind, createdAt: 0, updatedAt: 0, payload };
}

const mark = (targetId: string, text: string) => ({ id: text, sentenceKey: `${targetId}:0`, targetId, text, side: "l2" as const });
const observation = (over: Partial<CardPayloadMap["observation"]> = {}) =>
  card("observation", { perspective: "gloss", examplesCardId: "e1", marks: [], notes: "", aiExtraction: null, aiRevealed: false, ...over });
const syntax = (over: Partial<CardPayloadMap["syntax"]> = {}) =>
  card("syntax", { examplesCardId: "e1", analyses: {}, patterns: {}, aiAnalysis: null, aiRevealed: false, notes: "", ...over });
const hypothesis = (over: Partial<CardPayloadMap["hypothesis"]> = {}) => card("hypothesis", { version: 1, lines: [], notes: "", basedOn: [], ...over });
const translation = (over: Partial<CardPayloadMap["verify_translation"]> = {}) =>
  card("verify_translation", { l1Text: "", markers: [], restrictToTargets: true, fixedGloss: "", feasibilityTargetId: null, result: null, revealed: false, history: [], ...over });
const frameCard = (over: Partial<CardPayloadMap["verify_frame"]> = {}) => card("verify_frame", { frames: [], result: null, revealed: false, ...over });
const summary = (over: Partial<CardPayloadMap["summary"]> = {}) => card("summary", { lines: [], writing: [], feedback: null, savedNoteId: null, ...over });
const examples = (sets: CardPayloadMap["examples"]["sets"] = []) =>
  card("examples", { params: { targetIds: [], count: 6, level: "beginner", genre: "daily", maxWords: null, adverbs: false, contrastWith: [] }, sets, meta: { model: "m", generatedAt: 0 }, showGuides: false });

const meta = { model: "m", generatedAt: 0 };

describe("markedTargets / taggedTargets", () => {
  it("counts each target once, however many items it has", () => {
    expect(markedTargets(observation({ marks: [mark("t1", "a"), mark("t1", "b"), mark("t2", "c")] }).payload)).toEqual(new Set(["t1", "t2"]));
  });

  it("ignores syntax sentences that were left untagged", () => {
    const tagged = taggedTargets(syntax({ analyses: { "t1:0": [{ id: "e", role: "V", text: "listen" }], "t2:0": [] } }).payload);
    expect(tagged).toEqual(new Set(["t1"]));
  });

  it("recovers the target id from a key even when the id itself contains a colon", () => {
    expect(taggedTargets(syntax({ analyses: { "a:b:3": [{ id: "e", role: "V", text: "x" }] } }).payload)).toEqual(new Set(["a:b"]));
  });
});

describe("cardReady", () => {
  it("examples: ready once a set has arrived", () => {
    expect(cardReady(examples(), inquiry)).toBe(false);
    expect(cardReady(examples([{ targetId: "t1", sentences: [] }]), inquiry)).toBe(true);
  });

  it("observation: ready only when every target has been collected from", () => {
    expect(cardReady(observation({ marks: [mark("t1", "a")] }), inquiry)).toBe(false);
    expect(cardReady(observation({ marks: [mark("t1", "a"), mark("t2", "b")] }), inquiry)).toBe(true);
  });

  it("observation: a perspective that uses no examples is ready on notes alone", () => {
    expect(cardReady(observation({ perspective: "l1_side" }), inquiry)).toBe(false);
    expect(cardReady(observation({ perspective: "l1_side", notes: "母語では区別しない" }), inquiry)).toBe(true);
    expect(cardReady(observation({ perspective: "l1_side", notes: "   " }), inquiry)).toBe(false);
  });

  it("syntax: ready when every target has a tagged sentence", () => {
    expect(cardReady(syntax({ analyses: { "t1:0": [{ id: "e", role: "V", text: "x" }] } }), inquiry)).toBe(false);
    expect(cardReady(syntax({ analyses: { "t1:0": [{ id: "e", role: "V", text: "x" }], "t2:1": [{ id: "f", role: "V", text: "y" }] } }), inquiry)).toBe(true);
  });

  it("hypothesis: ready on one non-blank line", () => {
    expect(cardReady(hypothesis({ lines: [{ targetId: "t1", text: "  ", uncertain: false }] }), inquiry)).toBe(false);
    expect(cardReady(hypothesis({ lines: [{ targetId: "t1", text: "意識して聞く", uncertain: true }] }), inquiry)).toBe(true);
  });

  it("verification and summary: ready on a result, or on a saved note", () => {
    expect(cardReady(translation(), inquiry)).toBe(false);
    expect(cardReady(translation({ result: { l2Text: "x", alignments: [], note: null, meta } }), inquiry)).toBe(true);
    expect(cardReady(frameCard(), inquiry)).toBe(false);
    expect(cardReady(frameCard({ result: { judgments: [], meta } }), inquiry)).toBe(true);
    expect(cardReady(summary(), inquiry)).toBe(false);
    expect(cardReady(summary({ savedNoteId: "n1" }), inquiry)).toBe(true);
  });
});

describe("cardHasContent", () => {
  it("treats a just-added card of every kind as empty, so deleting it needs no confirmation", () => {
    for (const c of [examples(), observation(), syntax(), hypothesis(), translation(), frameCard(), summary()]) {
      expect({ kind: c.kind, content: cardHasContent(c) }).toEqual({ kind: c.kind, content: false });
    }
  });

  it("sees work in marks, notes and AI output on an observation card", () => {
    expect(cardHasContent(observation({ marks: [mark("t1", "a")] }))).toBe(true);
    expect(cardHasContent(observation({ notes: "気づき" }))).toBe(true);
    expect(cardHasContent(observation({ aiExtraction: [] }))).toBe(true);
    expect(cardHasContent(observation({ notes: "  " }))).toBe(false);
  });

  it("sees a half-written translation test as work, not as empty", () => {
    expect(cardHasContent(translation({ l1Text: "①聞く" }))).toBe(true);
    expect(cardHasContent(translation({ history: [{ l1Text: "x", result: { l2Text: "y", alignments: [], note: null, meta } }] }))).toBe(true);
  });

  it("sees frames added by hand even before any result", () => {
    expect(cardHasContent(frameCard({ frames: [{ id: "f1", frame: "〜するつもりで", predictions: {} }] }))).toBe(true);
  });

  it("sees the learner's own writing on a summary card", () => {
    expect(cardHasContent(summary({ writing: ["I listened to the radio."] }))).toBe(true);
    expect(cardHasContent(summary({ writing: ["  "] }))).toBe(false);
  });
});

describe("verifiedAsPredicted", () => {
  it("is true when every alignment matches what the learner predicted", () => {
    const c = translation({
      markers: [{ index: 1, predictedTargetId: "t1" }, { index: 2, predictedTargetId: "t2" }],
      result: { l2Text: "", alignments: [{ index: 1, word: "listen", targetId: "t1" }, { index: 2, word: "hear", targetId: "t2" }], note: null, meta },
    });
    expect(verifiedAsPredicted(c)).toBe(true);
  });

  it("is false when one position came out as the other word", () => {
    const c = translation({
      markers: [{ index: 1, predictedTargetId: "t1" }, { index: 2, predictedTargetId: "t2" }],
      result: { l2Text: "", alignments: [{ index: 1, word: "hear", targetId: "t2" }, { index: 2, word: "hear", targetId: "t2" }], note: null, meta },
    });
    expect(verifiedAsPredicted(c)).toBe(false);
  });

  it("is false when the AI used a word that is not one of the targets", () => {
    const c = translation({
      markers: [{ index: 1, predictedTargetId: "t1" }],
      result: { l2Text: "", alignments: [{ index: 1, word: "overhear", targetId: null }], note: null, meta },
    });
    expect(verifiedAsPredicted(c)).toBe(false);
  });

  it("is false while there is no result at all", () => {
    expect(verifiedAsPredicted(translation({ markers: [{ index: 1, predictedTargetId: "t1" }] }))).toBe(false);
    expect(verifiedAsPredicted(frameCard())).toBe(false);
  });

  it("frames: matches when ○/× agree, and an unsure prediction never counts as a miss", () => {
    const frames = [{ id: "f1", frame: "〜するつもりで", predictions: { t1: "ok" as const, t2: "unsure" as const } }];
    const ok = frameCard({ frames, result: { judgments: [{ frameId: "f1", targetId: "t1", natural: true, example: "", note: "" }, { frameId: "f1", targetId: "t2", natural: false, example: "", note: "" }], meta } });
    expect(verifiedAsPredicted(ok)).toBe(true);
    const miss = frameCard({ frames, result: { judgments: [{ frameId: "f1", targetId: "t1", natural: false, example: "", note: "" }], meta } });
    expect(verifiedAsPredicted(miss)).toBe(false);
  });

  it("is false for cards that are not verifications", () => {
    expect(verifiedAsPredicted(hypothesis())).toBe(false);
  });
});

describe("nextSteps", () => {
  it("offers observing first after examples", () => {
    expect(nextSteps(examples(), false)[0].kind).toBe("observation");
  });

  it("offers writing a hypothesis first after observing or tagging syntax", () => {
    expect(nextSteps(observation(), false)[0].kind).toBe("hypothesis");
    expect(nextSteps(syntax(), false)[0].kind).toBe("hypothesis");
  });

  it("names the hypothesis step differently once one exists", () => {
    expect(nextSteps(examples(), false).find((s) => s.kind === "hypothesis")!.label.ja).toContain("仮説を書く");
    expect(nextSteps(examples(), true).find((s) => s.kind === "hypothesis")!.label.ja).toContain("次の版");
  });

  it("offers a verification first after a hypothesis", () => {
    expect(nextSteps(hypothesis(), true).map((s) => s.kind).slice(0, 2)).toEqual(["verify_translation", "verify_frame"]);
  });

  it("recommends summing up when the verification came out as predicted", () => {
    const c = translation({
      markers: [{ index: 1, predictedTargetId: "t1" }],
      result: { l2Text: "", alignments: [{ index: 1, word: "listen", targetId: "t1" }], note: null, meta },
    });
    expect(nextSteps(c, true)[0].kind).toBe("summary");
  });

  it("recommends revising the hypothesis when a prediction missed", () => {
    const c = translation({
      markers: [{ index: 1, predictedTargetId: "t1" }],
      result: { l2Text: "", alignments: [{ index: 1, word: "hear", targetId: "t2" }], note: null, meta },
    });
    expect(nextSteps(c, true)[0].kind).toBe("hypothesis");
    expect(nextSteps(c, true)[0].label.ja).toContain("直す");
  });

  it("offers fresh examples first after summing up", () => {
    expect(nextSteps(summary({ savedNoteId: "n" }), true)[0].kind).toBe("examples");
  });

  it("always offers something, in both screen languages, for every card kind", () => {
    for (const c of [examples(), observation(), syntax(), hypothesis(), translation(), frameCard(), summary()]) {
      const steps = nextSteps(c, false);
      expect(steps.length).toBeGreaterThan(0);
      for (const s of steps) {
        expect(s.label.ja).toBeTruthy();
        expect(s.label.en).toBeTruthy();
        expect(s.why.ja).toBeTruthy();
        expect(s.why.en).toBeTruthy();
      }
    }
  });
});

describe("cardHint", () => {
  it("names the two words being compared", () => {
    const hint = cardHint(examples([{ targetId: "t1", sentences: [] }]), inquiry);
    expect(hint.ja).toContain("listen");
    expect(hint.ja).toContain("hear");
    expect(hint.en).toContain("listen");
  });

  it("asks for the missing word once one side has been collected", () => {
    const hint = cardHint(observation({ marks: [mark("t1", "耳を傾ける")] }), inquiry);
    expect(hint.ja).toContain("hear");
    expect(hint.ja).not.toContain("listen");
  });

  it("asks for markers before predictions on a translation test", () => {
    expect(cardHint(translation({ l1Text: "ふつうの文" }), inquiry).ja).toContain("①②");
    expect(cardHint(translation({ l1Text: "①聞く" }), inquiry).ja).toContain("予想");
    expect(cardHint(translation({ result: { l2Text: "", alignments: [], note: null, meta } }), inquiry).ja).toContain("比べ");
  });

  it("returns both languages for every card kind", () => {
    for (const c of [examples(), observation(), syntax(), hypothesis(), translation(), frameCard(), summary()]) {
      const hint = cardHint(c, inquiry);
      expect({ kind: c.kind, ja: !!hint.ja, en: !!hint.en }).toEqual({ kind: c.kind, ja: true, en: true });
    }
  });
});

describe("suggestRole", () => {
  const sentence: Sentence = {
    l2: "She quietly listened to the radio in bed.",
    l1: "",
    target_form: "listened",
    object: "the radio",
    complement: null,
    adverb: "quietly",
    preposition_phrase: "in bed",
  };
  const roles = ["S", "V", "O", "C", "PP", "ADV", "MOD", "OTHER"];

  it("maps each guide span to its role", () => {
    expect(suggestRole(sentence, "listened", roles)).toBe("V");
    expect(suggestRole(sentence, "the radio", roles)).toBe("O");
    expect(suggestRole(sentence, "quietly", roles)).toBe("ADV");
    expect(suggestRole(sentence, "in bed", roles)).toBe("PP");
  });

  it("matches a selection inside a span, and a span inside a selection", () => {
    expect(suggestRole(sentence, "radio", roles)).toBe("O");
    expect(suggestRole(sentence, "to the radio", roles)).toBe("O");
  });

  it("ignores case", () => {
    expect(suggestRole(sentence, "Quietly", roles)).toBe("ADV");
  });

  it("falls back to a role the language pack actually has", () => {
    expect(suggestRole(sentence, "in bed", ["S", "V", "O", "MOD", "OTHER"])).toBe("MOD");
    expect(suggestRole(sentence, "quietly", ["S", "V", "O", "MOD", "OTHER"])).toBe("MOD");
  });

  it("suggests nothing for a selection no span covers", () => {
    expect(suggestRole(sentence, "She", roles)).toBeNull();
  });

  it("prefers the target over a span that contains it", () => {
    const s: Sentence = { ...sentence, object: "listened to the radio" };
    expect(suggestRole(s, "listened", roles)).toBe("V");
  });
});
