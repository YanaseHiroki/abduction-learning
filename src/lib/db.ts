import Dexie, { type Table } from "dexie";
import { nanoid } from "nanoid";
import type { Card, CardKind, CardPayloadMap, Inquiry, SchemaNote } from "./types";

class AbductionDB extends Dexie {
  inquiries!: Table<Inquiry, string>;
  cards!: Table<Card, string>;
  schemaNotes!: Table<SchemaNote, string>;

  constructor() {
    super("abduction-learning");
    this.version(1).stores({
      inquiries: "id, updatedAt, l2",
      cards: "id, inquiryId, kind, createdAt",
      schemaNotes: "id, inquiryId, l2, createdAt",
    });
  }
}

export const db = new AbductionDB();

/** id: an id handed out beforehand, when AI calls were already charged to it (the word consultation on the free tier). */
export async function createInquiry(data: Omit<Inquiry, "id" | "createdAt" | "updatedAt">, id = nanoid(10)) {
  const now = Date.now();
  const inquiry: Inquiry = { ...data, id, createdAt: now, updatedAt: now };
  await db.inquiries.add(inquiry);
  return inquiry;
}

export async function addCard<K extends CardKind>(inquiryId: string, kind: K, payload: CardPayloadMap[K]) {
  const now = Date.now();
  const card: Card<K> = { id: nanoid(10), inquiryId, kind, createdAt: now, updatedAt: now, payload };
  await db.cards.add(card as Card);
  await db.inquiries.update(inquiryId, { updatedAt: now });
  return card;
}

export async function updateCardPayload<K extends CardKind>(
  card: Card<K>,
  patch: Partial<CardPayloadMap[K]>,
) {
  const payload = { ...card.payload, ...patch };
  await db.cards.update(card.id, { payload, updatedAt: Date.now() });
}

export async function deleteCard(id: string) {
  await db.cards.delete(id);
}

export async function deleteInquiry(id: string) {
  await db.transaction("rw", db.inquiries, db.cards, db.schemaNotes, async () => {
    await db.cards.where("inquiryId").equals(id).delete();
    await db.schemaNotes.where("inquiryId").equals(id).delete();
    await db.inquiries.delete(id);
  });
}
