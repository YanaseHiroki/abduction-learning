import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportAll, importAll } from "./backup";
import { addCard, createInquiry, db } from "./db";
import type { Card, Inquiry, SchemaNote } from "./types";

interface BackupFile {
  app: string;
  version: number;
  exportedAt: number;
  inquiries: Inquiry[];
  cards: Card[];
  schemaNotes: SchemaNote[];
}

/** exportAll writes through an <a download>; capture the blob it would have saved. */
async function capturedExport(): Promise<{ json: BackupFile; filename: string }> {
  let blob: Blob | undefined;
  let filename = "";
  const createURL = vi.spyOn(URL, "createObjectURL").mockImplementation((b: Blob | MediaSource) => {
    blob = b as Blob;
    return "blob:test";
  });
  const revokeURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    filename = this.download;
  });
  await exportAll();
  createURL.mockRestore();
  revokeURL.mockRestore();
  click.mockRestore();
  return { json: JSON.parse(await blob!.text()) as BackupFile, filename };
}

const file = (data: unknown) => new File([JSON.stringify(data)], "backup.json", { type: "application/json" });

const seed = async () => {
  const inq = await createInquiry({ l1: "ja", l2: "en", targets: [{ id: "t1", label: "listen", kind: "word" }], genre: "daily", level: "beginner" });
  const card = await addCard(inq.id, "hypothesis", { version: 1, lines: [{ targetId: "t1", text: "耳を傾ける", uncertain: false }], notes: "", basedOn: [] });
  await db.schemaNotes.add({ id: "n1", inquiryId: inq.id, l1: "ja", l2: "en", targets: [], lines: [], createdAt: 5, lastRevisitedAt: null });
  return { inq, card };
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("exportAll", () => {
  it("writes every table with the app marker and a dated filename", async () => {
    const { inq } = await seed();
    const { json, filename } = await capturedExport();
    expect(json.app).toBe("abduction-learning");
    expect(json.version).toBe(1);
    expect(json.inquiries.map((i) => i.id)).toEqual([inq.id]);
    expect(json.cards).toHaveLength(1);
    expect(json.schemaNotes).toHaveLength(1);
    expect(filename).toMatch(/^abduction-learning-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("exports an empty database as empty lists, not as a failure", async () => {
    const { json } = await capturedExport();
    expect(json.inquiries).toEqual([]);
    expect(json.cards).toEqual([]);
    expect(json.schemaNotes).toEqual([]);
  });
});

describe("importAll", () => {
  it("round-trips an export back into an empty database", async () => {
    const { inq, card } = await seed();
    const { json } = await capturedExport();
    await db.delete();
    await db.open();

    const count = await importAll(file(json));

    expect(count).toBe(1);
    expect(await db.inquiries.get(inq.id)).toMatchObject({ id: inq.id, l2: "en" });
    expect(await db.cards.get(card.id)).toMatchObject({ kind: "hypothesis" });
    expect(await db.schemaNotes.get("n1")).toBeDefined();
  });

  it("merges into existing data and overwrites rows with the same id", async () => {
    const { inq } = await seed();
    const backup = (await capturedExport()).json;
    backup.inquiries[0].groupLabel = "聞く（更新）";
    const kept = await createInquiry({ l1: "ja", l2: "en", targets: [], genre: "news", level: "beginner" });

    await importAll(file(backup));

    expect((await db.inquiries.get(inq.id))!.groupLabel).toBe("聞く（更新）");
    expect(await db.inquiries.get(kept.id)).toBeDefined();
    expect(await db.inquiries.count()).toBe(2);
  });

  it("refuses a JSON file that is not one of ours", async () => {
    await expect(importAll(file({ app: "something-else", inquiries: [] }))).rejects.toThrow("not a backup file");
  });

  it("refuses a file that is not JSON at all", async () => {
    await expect(importAll(new File(["nope"], "x.json"))).rejects.toThrow();
  });

  it("leaves the database untouched when the file is rejected", async () => {
    const { inq } = await seed();
    await expect(importAll(file({ app: "other" }))).rejects.toThrow();
    expect(await db.inquiries.count()).toBe(1);
    expect(await db.inquiries.get(inq.id)).toBeDefined();
  });
});
