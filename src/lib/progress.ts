import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { cardReady } from "./guide";
import type { Card, CardKind, Inquiry, SchemaNote } from "./types";

/**
 * Points, levels and the day streak: the small rewards that make coming back tomorrow feel worth it.
 * Nothing is stored for them; everything is read off the inquiries, cards and notes already saved, so a
 * backup restored on another device carries the streak and level with it, and nothing can get out of step.
 */

/** Points a finished card is worth (a card counts once it is done enough to move on: lib/guide's cardReady). */
export const XP_PER_CARD: Record<CardKind, number> = {
  examples: 10,
  observation: 20,
  syntax: 20,
  hypothesis: 30,
  verify_translation: 40,
  verify_frame: 40,
  summary: 60,
};

/** Points for starting an inquiry at all: the first step is the hardest one. */
export const XP_PER_INQUIRY = 10;

/** Points needed to go from `level` to the next one: 100, then 200, then 300 … */
export function xpToNext(level: number) {
  return 100 * level;
}

/** The level `xp` points put a learner on (from 1), and how far into it they are. */
export function levelOf(xp: number) {
  let level = 1;
  let rest = xp;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, into: rest, need: xpToNext(level) };
}

/** A face for each level, so a level is something to look at and not only a number. */
const FACES = ["🥚", "🐣", "🌱", "🌿", "🌳", "🌸", "🍎", "⭐", "🌟", "👑"];
export function levelFace(level: number) {
  return FACES[Math.min(level, FACES.length) - 1];
}

/** A calendar day in local time, as "YYYY-MM-DD"; the streak is counted in the learner's own days. */
function dayOf(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(day: string, by: number) {
  const [y, m, d] = day.split("-").map(Number);
  return dayOf(new Date(y, m - 1, d + by).getTime());
}

export interface Streak {
  /** consecutive days with something done, counting back from today (or from yesterday, while today is still open) */
  current: number;
  /** the longest run ever */
  best: number;
  /** whether anything was done today yet */
  today: boolean;
}

/** The streak on `now`, from the days on which anything at all was written. */
export function streakOf(activity: number[], now = Date.now()): Streak {
  const days = new Set(activity.map(dayOf));
  const today = dayOf(now);
  // A streak that was kept yesterday is not lost until the day ends: start counting from yesterday then.
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = shiftDay(cursor, -1);
  }
  let best = 0;
  for (const day of days) {
    if (days.has(shiftDay(day, -1))) continue; // not the start of a run
    let run = 0;
    for (let d = day; days.has(d); d = shiftDay(d, 1)) run++;
    best = Math.max(best, run);
  }
  return { current, best: Math.max(best, current), today: days.has(today) };
}

export interface Progress {
  xp: number;
  level: number;
  /** points earned within the current level, and the level's size */
  into: number;
  need: number;
  streak: Streak;
}

export function progressOf(inquiries: Inquiry[], cards: Card[], notes: SchemaNote[], now = Date.now()): Progress {
  const byId = new Map(inquiries.map((i) => [i.id, i]));
  let xp = XP_PER_INQUIRY * inquiries.length;
  for (const c of cards) {
    const inq = byId.get(c.inquiryId);
    if (inq && cardReady(c, inq)) xp += XP_PER_CARD[c.kind];
  }
  const activity = [
    ...inquiries.flatMap((i) => [i.createdAt, i.updatedAt]),
    ...cards.flatMap((c) => [c.createdAt, c.updatedAt]),
    ...notes.map((n) => n.createdAt),
  ];
  return { xp, ...levelOf(xp), streak: streakOf(activity, now) };
}

/** The learner's progress, kept current as they work (undefined until the data has loaded). */
export function useProgress(): Progress | undefined {
  return useLiveQuery(async () => {
    const [inquiries, cards, notes] = await Promise.all([db.inquiries.toArray(), db.cards.toArray(), db.schemaNotes.toArray()]);
    return progressOf(inquiries, cards, notes);
  }, []);
}
