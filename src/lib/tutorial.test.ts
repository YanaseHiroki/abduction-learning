import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { defaultSettings, getSettings, setSettings } from "./settings";
import { startTutorial, translationSampleFor, tutorialExampleSettings, tutorialGroup, tutorialTranslationSample } from "./tutorial";
import type { Inquiry } from "./types";

const inquiry = (targets: { id: string; label: string; kind: "word" }[], l1 = "ja"): Inquiry => ({
  id: "i1", l1, l2: "en", targets, genre: "daily", level: "beginner", createdAt: 0, updatedAt: 0,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  setSettings(defaultSettings);
});

describe("tutorialGroup", () => {
  it("is the course's first group for a language that has a course", () => {
    expect(tutorialGroup("en")!.targets.map((t) => t.label)).toEqual(["listen", "hear"]);
  });

  it("is null for a language with no course", () => {
    expect(tutorialGroup("fr")).toBeNull();
  });
});

describe("tutorialExampleSettings", () => {
  it("asks for a short everyday set, fewer than the usual ten", () => {
    expect(tutorialExampleSettings).toMatchObject({ genre: "daily", level: "beginner", count: 6 });
    expect(tutorialExampleSettings.count).toBeLessThan(10);
  });
});

describe("translationSampleFor", () => {
  it("offers the ready-made sentence when the inquiry is the tutorial's pair in order", () => {
    const sample = translationSampleFor(inquiry([{ id: "a", label: "listen", kind: "word" }, { id: "b", label: "hear", kind: "word" }]));
    expect(sample).toBe(tutorialTranslationSample.ja);
    expect(sample).toContain("①");
    expect(sample).toContain("②");
  });

  it("offers it in the learner's own language", () => {
    const sample = translationSampleFor(inquiry([{ id: "a", label: "listen", kind: "word" }, { id: "b", label: "hear", kind: "word" }], "en"));
    expect(sample).toBe(tutorialTranslationSample.en);
  });

  it("offers nothing when the pair is in the other order, so ①② would point the wrong way", () => {
    expect(translationSampleFor(inquiry([{ id: "a", label: "hear", kind: "word" }, { id: "b", label: "listen", kind: "word" }]))).toBe("");
  });

  it("offers nothing for a different pair, or for a language with no sample", () => {
    expect(translationSampleFor(inquiry([{ id: "a", label: "say", kind: "word" }, { id: "b", label: "tell", kind: "word" }]))).toBe("");
    expect(translationSampleFor(inquiry([{ id: "a", label: "listen", kind: "word" }, { id: "b", label: "hear", kind: "word" }], "fr"))).toBe("");
  });
});

describe("startTutorial", () => {
  it("creates the course group's inquiry and marks the tutorial as running on it", async () => {
    const { id, generate } = await startTutorial("ja", "en", null);

    const saved = (await db.inquiries.get(id))!;
    expect(saved.targets.map((t) => t.label)).toEqual(["listen", "hear"]);
    expect(saved.groupLabel).toBe("聞く");
    expect(saved.genre).toBe("daily");
    expect(getSettings().tutorial).toEqual({ status: "running", inquiryId: id, step: 0 });
    expect(generate.targetIds).toEqual(saved.targets.map((t) => t.id));
    expect(generate.count).toBe(6);
  });

  it("labels the group in the learner's own language", async () => {
    const { id } = await startTutorial("en", "en", null);
    expect((await db.inquiries.get(id))!.groupLabel).toBe("hear / listen");
  });

  it("uses the learner's own words when they chose their own, and then has no group label", async () => {
    const { id, generate } = await startTutorial("ja", "en", [{ label: "big", kind: "word" }, { label: "large", kind: "word" }]);

    const saved = (await db.inquiries.get(id))!;
    expect(saved.targets.map((t) => t.label)).toEqual(["big", "large"]);
    expect(saved.groupLabel).toBeUndefined();
    expect(generate.targetIds).toHaveLength(2);
  });

  it("gives every target its own id", async () => {
    const { id } = await startTutorial("ja", "en", null);
    const ids = (await db.inquiries.get(id))!.targets.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts an inquiry with no targets for a language that has no course", async () => {
    const { id, generate } = await startTutorial("ja", "fr", null);
    expect((await db.inquiries.get(id))!.targets).toEqual([]);
    expect(generate.targetIds).toEqual([]);
  });

  it("asks for the tutorial's settings, not the default ten-sentence set", async () => {
    const { generate } = await startTutorial("ja", "en", null);
    expect(generate).toMatchObject({ count: 6, genre: "daily", level: "beginner", maxWords: null, adverbs: false, contrastWith: [] });
  });
});
