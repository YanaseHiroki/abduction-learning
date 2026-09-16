import { beforeEach, describe, expect, it } from "vitest";
import { addCard, createInquiry, db, deleteCard, deleteInquiry, updateCardPayload } from "./db";
import type { Card, ExamplesPayload, Inquiry } from "./types";

const newInquiry = () =>
  createInquiry({
    l1: "ja",
    l2: "en",
    groupLabel: "聞く",
    targets: [
      { id: "t1", label: "listen", kind: "word" },
      { id: "t2", label: "hear", kind: "word" },
    ],
    genre: "daily",
    level: "beginner",
  });

const examples = (): ExamplesPayload => ({
  params: { targetIds: ["t1"], count: 6, level: "beginner", genre: "daily", maxWords: null, adverbs: false, contrastWith: [] },
  sets: [],
  meta: { model: "", generatedAt: 0 },
  showGuides: false,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("createInquiry", () => {
  it("assigns an id and matching timestamps", async () => {
    const before = Date.now();
    const inq = await newInquiry();
    expect(inq.id).toMatch(/^[\w-]{10}$/);
    expect(inq.createdAt).toBe(inq.updatedAt);
    expect(inq.createdAt).toBeGreaterThanOrEqual(before);
    expect(await db.inquiries.get(inq.id)).toEqual(inq);
  });

  it("gives each inquiry its own id", async () => {
    const ids = new Set((await Promise.all([newInquiry(), newInquiry(), newInquiry()])).map((i) => i.id));
    expect(ids.size).toBe(3);
  });
});

describe("addCard", () => {
  it("stores the card and touches the inquiry", async () => {
    const inq = await newInquiry();
    await db.inquiries.update(inq.id, { updatedAt: 0 });
    const card = await addCard(inq.id, "examples", examples());
    expect(await db.cards.get(card.id)).toMatchObject({ inquiryId: inq.id, kind: "examples" });
    expect((await db.inquiries.get(inq.id))!.updatedAt).toBeGreaterThan(0);
  });

  it("keeps cards of one inquiry queryable in creation order", async () => {
    const inq = await newInquiry();
    const a = await addCard(inq.id, "examples", examples());
    const b = await addCard(inq.id, "hypothesis", { version: 1, lines: [], notes: "", basedOn: [] });
    const rows = await db.cards.where("inquiryId").equals(inq.id).sortBy("createdAt");
    expect(rows.map((c) => c.id)).toEqual([a.id, b.id]);
  });
});

describe("updateCardPayload", () => {
  it("merges the patch into the payload and leaves the rest", async () => {
    const inq = await newInquiry();
    const card = (await addCard(inq.id, "examples", examples())) as Card<"examples">;
    await updateCardPayload(card, { showGuides: true });
    const saved = (await db.cards.get(card.id)) as Card<"examples">;
    expect(saved.payload.showGuides).toBe(true);
    expect(saved.payload.params.count).toBe(6);
    expect(saved.updatedAt).toBeGreaterThanOrEqual(card.updatedAt);
  });
});

describe("deleting", () => {
  it("deleteCard removes only that card", async () => {
    const inq = await newInquiry();
    const a = await addCard(inq.id, "examples", examples());
    const b = await addCard(inq.id, "examples", examples());
    await deleteCard(a.id);
    expect(await db.cards.get(a.id)).toBeUndefined();
    expect(await db.cards.get(b.id)).toBeDefined();
  });

  it("deleteInquiry removes its cards and notes, and nothing belonging to another inquiry", async () => {
    const mine = await newInquiry();
    const other = await newInquiry();
    await addCard(mine.id, "examples", examples());
    await addCard(other.id, "examples", examples());
    await db.schemaNotes.add({ id: "n1", inquiryId: mine.id, l1: "ja", l2: "en", targets: [], lines: [], createdAt: 1, lastRevisitedAt: null });
    await db.schemaNotes.add({ id: "n2", inquiryId: other.id, l1: "ja", l2: "en", targets: [], lines: [], createdAt: 1, lastRevisitedAt: null });

    await deleteInquiry(mine.id);

    expect(await db.inquiries.get(mine.id)).toBeUndefined();
    expect(await db.cards.where("inquiryId").equals(mine.id).count()).toBe(0);
    expect(await db.schemaNotes.where("inquiryId").equals(mine.id).count()).toBe(0);
    expect(await db.inquiries.get(other.id)).toBeDefined();
    expect(await db.cards.where("inquiryId").equals(other.id).count()).toBe(1);
    expect(await db.schemaNotes.get("n2")).toBeDefined();
  });
});

describe("indexes", () => {
  it("lets the home page sort inquiries by when they were last touched", async () => {
    const a = await newInquiry();
    const b = await newInquiry();
    await db.inquiries.update(a.id, { updatedAt: 200 });
    await db.inquiries.update(b.id, { updatedAt: 100 });
    const rows = await db.inquiries.orderBy("updatedAt").reverse().toArray();
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
  });

  it("stores the whole inquiry shape, targets included", async () => {
    const inq = await newInquiry();
    const saved = (await db.inquiries.get(inq.id)) as Inquiry;
    expect(saved.targets).toEqual([
      { id: "t1", label: "listen", kind: "word" },
      { id: "t2", label: "hear", kind: "word" },
    ]);
    expect(saved.groupLabel).toBe("聞く");
  });
});
