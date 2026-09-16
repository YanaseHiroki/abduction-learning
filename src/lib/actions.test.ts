import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExamplesCard, saveSchemaNote, type ExamplesProgress } from "./actions";
import { createInquiry, db } from "./db";
import { defaultSettings, setSettings } from "./settings";
import { generateExamplesForTarget, qaCheck } from "./llm/prompts";
import type { Card, ExamplesParams, Inquiry, Sentence } from "./types";

vi.mock("./llm/prompts", () => ({ generateExamplesForTarget: vi.fn(), qaCheck: vi.fn() }));

const mockedGenerate = vi.mocked(generateExamplesForTarget);
const mockedQa = vi.mocked(qaCheck);

const sentence = (l2: string): Sentence => ({ l2, l1: "訳", target_form: "x", object: null, complement: null, adverb: null, preposition_phrase: null, flag: null });

const params: ExamplesParams = { targetIds: ["t1", "t2"], count: 2, level: "beginner", genre: "daily", maxWords: null, adverbs: false, contrastWith: [] };

let inquiry: Inquiry;

const answerFor = (byTarget: Record<string, Sentence[]>) =>
  mockedGenerate.mockImplementation(async (_input, target) => ({
    targetId: target.id,
    sentences: byTarget[target.id] ?? [sentence(`${target.label} 1`)],
    meta: { model: `model-${target.id}`, generatedAt: 1 },
    elapsedMs: 1,
  }));

const cardOf = async (id: string) => (await db.cards.get(id)) as Card<"examples">;

beforeEach(async () => {
  await db.delete();
  await db.open();
  setSettings({ ...defaultSettings, qaEnabled: false });
  mockedGenerate.mockReset();
  mockedQa.mockReset();
  inquiry = await createInquiry({
    l1: "ja", l2: "en", genre: "daily", level: "beginner",
    targets: [
      { id: "t1", label: "listen", kind: "word" },
      { id: "t2", label: "hear", kind: "word" },
      { id: "t3", label: "overhear", kind: "word" },
    ],
  });
});

describe("createExamplesCard", () => {
  it("generates only the chosen targets, one request each", async () => {
    answerFor({});
    await createExamplesCard(inquiry, params);
    expect(mockedGenerate).toHaveBeenCalledTimes(2);
    expect(mockedGenerate.mock.calls.map((c) => c[1].id)).toEqual(["t1", "t2"]);
  });

  it("stores the sets in the order the learner chose, not the order they arrived", async () => {
    mockedGenerate.mockImplementation(async (_input, target) => {
      // the second target answers first
      if (target.id === "t1") await new Promise((r) => setTimeout(r, 20));
      return { targetId: target.id, sentences: [sentence(target.label)], meta: { model: "m", generatedAt: 1 }, elapsedMs: 1 };
    });

    const card = await createExamplesCard(inquiry, params);

    expect(card.payload.sets.map((s) => s.targetId)).toEqual(["t1", "t2"]);
  });

  it("passes the inquiry's languages and the learner's constraints to the generator", async () => {
    answerFor({});
    await createExamplesCard(inquiry, { ...params, maxWords: 12, adverbs: true, contrastWith: ["overhear"] });
    expect(mockedGenerate.mock.calls[0][0]).toMatchObject({ l1: "ja", l2: "en", count: 2, level: "beginner", genre: "daily", maxWords: 12, adverbs: true, contrastWith: ["overhear"] });
    expect(mockedGenerate.mock.calls[0][0].targets.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("records the card's params and every model that answered", async () => {
    answerFor({});
    const card = await createExamplesCard(inquiry, params);
    expect(card.payload.params).toEqual(params);
    expect(card.payload.meta.model.split(" / ").sort()).toEqual(["model-t1", "model-t2"]);
    expect(card.payload.meta.generatedAt).toBeGreaterThan(0);
  });

  it("shows each set as soon as it arrives, so the card fills in while the rest is still running", async () => {
    // t2 answers only when the test lets it, so "while the rest is still running" is a fact, not a race
    let releaseT2 = () => {};
    const t2Waiting = new Promise<void>((r) => (releaseT2 = r));
    mockedGenerate.mockImplementation(async (_input, target) => {
      if (target.id === "t2") await t2Waiting;
      return { targetId: target.id, sentences: [sentence(target.label)], meta: { model: "m", generatedAt: 1 }, elapsedMs: 1 };
    });

    let cardId = "";
    let t1Done = () => {};
    const t1Arrived = new Promise<void>((r) => (t1Done = r));
    const done = createExamplesCard(inquiry, params, (id, progress) => {
      cardId = id;
      // the card is written before a target is reported done, so its set is on disk by now
      if (progress.t1?.status === "done") t1Done();
    });

    await t1Arrived;
    const whileRunning = (await cardOf(cardId)).payload.sets;
    releaseT2();
    await done;
    const afterwards = (await cardOf(cardId)).payload.sets;

    expect(whileRunning.map((s) => s.targetId)).toEqual(["t1"]);
    expect(afterwards.map((s) => s.targetId)).toEqual(["t1", "t2"]);
  });

  it("reports each target's progress from generating to done", async () => {
    answerFor({});
    const reports: ExamplesProgress[] = [];
    await createExamplesCard(inquiry, params, (_id, p) => reports.push(p));

    expect(reports[0]).toEqual({ t1: { status: "generating" }, t2: { status: "generating" } });
    expect(reports.at(-1)).toEqual({ t1: { status: "done" }, t2: { status: "done" } });
  });

  it("reports the checking stage while the QA pass runs", async () => {
    setSettings({ qaEnabled: true });
    answerFor({});
    mockedQa.mockResolvedValue([]);
    const statuses = new Set<string>();
    await createExamplesCard(inquiry, params, (_id, p) => Object.values(p).forEach((x) => statuses.add(x.status)));
    expect(statuses).toContain("checking");
  });

  it("keeps the finished sets when one target fails, and reports that target as an error", async () => {
    mockedGenerate.mockImplementation(async (_input, target) => {
      if (target.id === "t2") throw new Error("openai 500: upstream");
      return { targetId: target.id, sentences: [sentence("ok")], meta: { model: "m", generatedAt: 1 }, elapsedMs: 1 };
    });
    const reports: ExamplesProgress[] = [];

    const card = await createExamplesCard(inquiry, params, (_id, p) => reports.push(p));

    expect(card.payload.sets.map((s) => s.targetId)).toEqual(["t1"]);
    expect(reports.at(-1)!.t2).toEqual({ status: "error", error: "openai 500: upstream" });
    expect(reports.at(-1)!.t1.status).toBe("done");
  });

  it("leaves no empty card behind when every target failed, and reports the first error", async () => {
    mockedGenerate.mockRejectedValue(new Error("missing-api-key"));

    await expect(createExamplesCard(inquiry, params)).rejects.toThrow("missing-api-key");
    expect(await db.cards.count()).toBe(0);
  });
});

describe("the QA pass", () => {
  it("flags the sentence the checker named, and leaves the others alone", async () => {
    setSettings({ qaEnabled: true });
    answerFor({ t1: [sentence("I listen the radio."), sentence("I listened to the radio.")] });
    mockedQa.mockImplementation(async (_l1, _l2, sets) =>
      sets[0].sentences[0].l2.includes("listen the") ? [{ set_index: 0, sentence_index: 0, reason: "to が抜けています" }] : [],
    );

    const card = await createExamplesCard(inquiry, params);

    const set = card.payload.sets.find((s) => s.targetId === "t1")!;
    expect(set.sentences[0].flag).toEqual({ source: "auto", reason: "to が抜けています" });
    expect(set.sentences[1].flag).toBeNull();
  });

  it("checks each target's own set, so an index always means that set", async () => {
    setSettings({ qaEnabled: true });
    answerFor({});
    mockedQa.mockResolvedValue([]);
    await createExamplesCard(inquiry, params);
    expect(mockedQa).toHaveBeenCalledTimes(2);
    for (const call of mockedQa.mock.calls) expect(call[2]).toHaveLength(1);
  });

  it("ignores an issue pointing at a set that was not checked", async () => {
    setSettings({ qaEnabled: true });
    answerFor({});
    mockedQa.mockResolvedValue([{ set_index: 3, sentence_index: 0, reason: "どこか" }]);
    const card = await createExamplesCard(inquiry, params);
    expect(card.payload.sets.flatMap((s) => s.sentences).every((s) => s.flag === null)).toBe(true);
  });

  it("keeps the sentences when the checker itself fails — it is best effort", async () => {
    setSettings({ qaEnabled: true });
    answerFor({});
    mockedQa.mockRejectedValue(new Error("openai 429"));

    const card = await createExamplesCard(inquiry, params);

    expect(card.payload.sets).toHaveLength(2);
  });

  it("does not run at all when the learner turned it off", async () => {
    setSettings({ qaEnabled: false });
    answerFor({});
    await createExamplesCard(inquiry, params);
    expect(mockedQa).not.toHaveBeenCalled();
  });
});

describe("saveSchemaNote", () => {
  it("saves the note with the inquiry's languages and targets, and reports it as never revisited", async () => {
    const lines = [{ targetId: "t1", text: "意識して聞く", uncertain: false }];

    const id = await saveSchemaNote(inquiry, lines);

    const note = (await db.schemaNotes.get(id))!;
    expect(note).toMatchObject({ inquiryId: inquiry.id, l1: "ja", l2: "en", lines, lastRevisitedAt: null });
    expect(note.targets).toEqual(inquiry.targets);
    expect(note.createdAt).toBeGreaterThan(0);
  });

  it("gives each note its own id", async () => {
    const ids = [await saveSchemaNote(inquiry, []), await saveSchemaNote(inquiry, [])];
    expect(new Set(ids).size).toBe(2);
    expect(await db.schemaNotes.count()).toBe(2);
  });
});
