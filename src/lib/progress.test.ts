import { describe, expect, it } from "vitest";
import { levelOf, progressOf, streakOf, XP_PER_CARD, XP_PER_INQUIRY, xpToNext } from "./progress";
import type { Card, Inquiry } from "./types";

const DAY = 24 * 60 * 60 * 1000;
// noon, so shifting by whole days never crosses a DST edge in the test's zone
const noon = new Date(2026, 8, 19, 12).getTime();

const inquiry: Inquiry = {
  id: "i1", l1: "ja", l2: "en", targets: [{ id: "t1", label: "listen", kind: "word" }, { id: "t2", label: "hear", kind: "word" }],
  genre: "daily", level: "beginner", createdAt: noon, updatedAt: noon,
};
const meta = { model: "m", generatedAt: noon };
const card = <K extends Card["kind"]>(kind: K, payload: Card<K>["payload"], at = noon): Card<K> => ({ id: `c-${kind}`, inquiryId: "i1", kind, createdAt: at, updatedAt: at, payload });

describe("levelOf", () => {
  it("starts on level 1 with nothing", () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 100 });
  });

  it("needs more points for each level than the one before", () => {
    expect(xpToNext(1)).toBeLessThan(xpToNext(2));
    expect(levelOf(100)).toEqual({ level: 2, into: 0, need: 200 });
    expect(levelOf(350)).toEqual({ level: 3, into: 50, need: 300 });
  });
});

describe("streakOf", () => {
  it("is zero with nothing done", () => {
    expect(streakOf([], noon)).toEqual({ current: 0, best: 0, today: false });
  });

  it("counts the days in a row ending today", () => {
    expect(streakOf([noon - 2 * DAY, noon - DAY, noon], noon)).toEqual({ current: 3, best: 3, today: true });
  });

  it("keeps yesterday's streak alive until today is over, and says today is still open", () => {
    expect(streakOf([noon - 2 * DAY, noon - DAY], noon)).toEqual({ current: 2, best: 2, today: false });
  });

  it("is broken by a missed day, but remembers the best run", () => {
    expect(streakOf([noon - 5 * DAY, noon - 4 * DAY, noon - 3 * DAY, noon], noon)).toEqual({ current: 1, best: 3, today: true });
  });

  it("counts a day once however much was done on it", () => {
    expect(streakOf([noon, noon + 60_000, noon + 3_600_000], noon).current).toBe(1);
  });
});

describe("progressOf", () => {
  it("gives points for starting an inquiry", () => {
    expect(progressOf([inquiry], [], [], noon).xp).toBe(XP_PER_INQUIRY);
  });

  it("gives a card its points only once it is done enough to move on", () => {
    const empty = card("hypothesis", { version: 1, lines: [{ targetId: "t1", text: "", uncertain: false }], notes: "", basedOn: [] });
    const written = card("hypothesis", { version: 1, lines: [{ targetId: "t1", text: "自分から聞く", uncertain: false }], notes: "", basedOn: [] });
    expect(progressOf([inquiry], [empty], [], noon).xp).toBe(XP_PER_INQUIRY);
    expect(progressOf([inquiry], [written], [], noon).xp).toBe(XP_PER_INQUIRY + XP_PER_CARD.hypothesis);
  });

  it("reaches level 2 with one inquiry taken all the way through", () => {
    const cards: Card[] = [
      card("examples", { params: { targetIds: ["t1", "t2"], count: 6, level: "beginner", genre: "daily", maxWords: null, adverbs: false, contrastWith: [] }, sets: [{ targetId: "t1", sentences: [] }], meta, showGuides: false }),
      card("observation", { perspective: "gloss", examplesCardId: "c-examples", marks: [{ id: "m1", sentenceKey: "t1:0", targetId: "t1", text: "a", side: "l2" }, { id: "m2", sentenceKey: "t2:0", targetId: "t2", text: "b", side: "l2" }], notes: "", aiExtraction: null, aiRevealed: false }),
      card("hypothesis", { version: 1, lines: [{ targetId: "t1", text: "x", uncertain: false }], notes: "", basedOn: [] }),
      card("verify_translation", { l1Text: "①", markers: [], restrictToTargets: true, fixedGloss: "", feasibilityTargetId: null, result: { l2Text: "x", alignments: [], note: null, meta }, revealed: true, history: [] }),
      card("summary", { lines: [], writing: [], feedback: null, savedNoteId: "n1" }),
    ];
    const p = progressOf([inquiry], cards, [], noon);
    expect(p.xp).toBe(170);
    expect(p.level).toBe(2);
  });

  it("ignores a card whose inquiry is gone", () => {
    const orphan = { ...card("summary", { lines: [], writing: [], feedback: null, savedNoteId: "n1" }), inquiryId: "gone" };
    expect(progressOf([inquiry], [orphan], [], noon).xp).toBe(XP_PER_INQUIRY);
  });

  it("reads the streak off the days anything was touched", () => {
    const old = { ...inquiry, createdAt: noon - DAY, updatedAt: noon - DAY };
    const c = card("summary", { lines: [], writing: [], feedback: null, savedNoteId: null }, noon);
    expect(progressOf([old], [c], [], noon).streak).toEqual({ current: 2, best: 2, today: true });
  });
});
