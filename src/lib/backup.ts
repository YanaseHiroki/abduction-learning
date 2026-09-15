import { db } from "./db";
import type { Card, Inquiry, SchemaNote } from "./types";

interface Backup {
  app: "abduction-learning";
  version: 1;
  exportedAt: number;
  inquiries: Inquiry[];
  cards: Card[];
  schemaNotes: SchemaNote[];
}

export async function exportAll() {
  const data: Backup = {
    app: "abduction-learning",
    version: 1,
    exportedAt: Date.now(),
    inquiries: await db.inquiries.toArray(),
    cards: await db.cards.toArray(),
    schemaNotes: await db.schemaNotes.toArray(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `abduction-learning-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Merge a backup into the local database (existing ids are overwritten). Returns the number of inquiries imported. */
export async function importAll(file: File) {
  const data = JSON.parse(await file.text()) as Backup;
  if (data.app !== "abduction-learning") throw new Error("not a backup file");
  await db.transaction("rw", db.inquiries, db.cards, db.schemaNotes, async () => {
    await db.inquiries.bulkPut(data.inquiries);
    await db.cards.bulkPut(data.cards);
    await db.schemaNotes.bulkPut(data.schemaNotes);
  });
  return data.inquiries.length;
}
