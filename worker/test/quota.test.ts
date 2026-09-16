import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { costMicros, reserveMicros, type QuotaCounter } from "../src/index";

/**
 * The free tier is counted in inquiries: a device is admitted a few per day, and an admitted
 * inquiry then has a fixed budget of calls it cannot be cut off in the middle of.
 * These drive the Durable Object directly so the limits and the day number can be chosen.
 */

// Budgets in micro-USD: $3 in all, new inquiries until $2.50. Calls reserve 1,000 (a tenth of a cent) unless a test says otherwise.
const limits = { device: 3, deviceFirstDay: 5, ip: 10, global: 50, perInquiry: 60, ttlDays: 3, budget: 3_000_000, admitBudget: 2_500_000 };
const RESERVE = 1_000;
const DAY = 20_000;

/** A counter of its own per test: the worker keeps one global object, so tests must not share its tallies. */
let n = 0;
function counter() {
  const stub = env.QUOTA.get(env.QUOTA.idFromName(`test-${n++}`));
  return {
    charge: (day: number, device: string, ip: string, inquiry: string, over: Partial<typeof limits> = {}, reserve = RESERVE) =>
      runInDurableObject(stub, (o: QuotaCounter) => o.charge(day, device, ip, inquiry, { ...limits, ...over }, reserve)),
    status: (day: number, device: string, ip: string, over: Partial<typeof limits> = {}) =>
      runInDurableObject(stub, (o: QuotaCounter) => o.status(day, device, ip, { ...limits, ...over })),
    refund: (inquiry: string, day = DAY, reserve = RESERVE) => runInDurableObject(stub, (o: QuotaCounter) => o.refund(inquiry, day, reserve)),
    settle: (day: number, reserve: number, cost: number) => runInDurableObject(stub, (o: QuotaCounter) => o.settle(day, reserve, cost)),
    budget: (day: number, over: Partial<typeof limits> = {}) => runInDurableObject(stub, (o: QuotaCounter) => o.budgetStatus(day, { ...limits, ...over })),
    spent: (day: number) =>
      runInDurableObject(stub, (_o: QuotaCounter, state) => (state.storage.sql.exec("SELECT micros FROM spend WHERE day = ?", day).toArray()[0]?.micros as number | undefined) ?? 0),
    admitFeedback: (day: number, ip: string, perIp: number, global: number) =>
      runInDurableObject(stub, (o: QuotaCounter) => o.admitFeedback(day, ip, perIp, global)),
    refundFeedback: (day: number, ip: string) => runInDurableObject(stub, (o: QuotaCounter) => o.refundFeedback(day, ip)),
  };
}

let q: ReturnType<typeof counter>;
beforeEach(() => {
  q = counter();
});

describe("admitting an inquiry", () => {
  it("admits the first call of a new inquiry and charges it to every scope", async () => {
    const r = await q.charge(DAY, "d1", "1.1.1.1", "d1:inq1");

    expect(r).toEqual({ ok: true, remaining: limits.perInquiry - 1 });
    expect(await q.status(DAY, "d1", "1.1.1.1")).toEqual({
      device: { used: 1, limit: limits.deviceFirstDay },
      ip: { used: 1, limit: limits.ip },
      global: { used: 1, limit: limits.global },
    });
  });

  it("charges the later calls of the same inquiry to nobody's daily count", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq1");
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq1");
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq1");

    expect((await q.status(DAY, "d1", "1.1.1.1")).device.used).toBe(1);
  });

  it("gives a device more inquiries on the day it first appears than on later days", async () => {
    const first = await q.status(DAY, "new-device", "1.1.1.1");
    expect(first.device.limit).toBe(limits.deviceFirstDay);

    await q.charge(DAY, "new-device", "1.1.1.1", "new-device:a");
    const later = await q.status(DAY + 1, "new-device", "1.1.1.1");
    expect(later.device.limit).toBe(limits.device);
    expect(later.device.used).toBe(0);
  });

  it("counts a device's inquiries only against that device", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:a");
    await q.charge(DAY, "d1", "1.1.1.1", "d1:b");

    expect((await q.status(DAY, "d1", "1.1.1.1")).device.used).toBe(2);
    expect((await q.status(DAY, "d2", "1.1.1.1")).device.used).toBe(0);
  });
});

describe("running out", () => {
  it("stops a device once it has started its allowance for the day", async () => {
    for (let i = 0; i < limits.deviceFirstDay; i++) {
      expect(await q.charge(DAY, "d1", "1.1.1.1", `d1:${i}`)).toMatchObject({ ok: true });
    }
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:one-more")).toEqual({ ok: false, scope: "device" });
  });

  it("names the IP when clearing the device id would otherwise buy another first day", async () => {
    for (let i = 0; i < limits.ip; i++) {
      await q.charge(DAY, `device-${i}`, "1.1.1.1", `device-${i}:a`);
    }
    expect(await q.charge(DAY, "device-fresh", "1.1.1.1", "device-fresh:a")).toEqual({ ok: false, scope: "ip" });
  });

  it("names the global cap, the owner's spending safety valve", async () => {
    const small = { global: 2 };
    await q.charge(DAY, "d1", "1.1.1.1", "d1:a", small);
    await q.charge(DAY, "d2", "2.2.2.2", "d2:a", small);
    expect(await q.charge(DAY, "d3", "3.3.3.3", "d3:a", small)).toEqual({ ok: false, scope: "global" });
  });

  it("refuses without charging anybody when the inquiry cannot be admitted", async () => {
    const small = { global: 1 };
    await q.charge(DAY, "d1", "1.1.1.1", "d1:a", small);
    await q.charge(DAY, "d2", "2.2.2.2", "d2:a", small);

    expect((await q.status(DAY, "d2", "2.2.2.2", small)).device.used).toBe(0);
    expect((await q.status(DAY, "d2", "2.2.2.2", small)).ip.used).toBe(0);
  });

  it("lets an inquiry already under way continue after the day's admissions are gone", async () => {
    const small = { device: 1, deviceFirstDay: 1 };
    await q.charge(DAY, "d1", "1.1.1.1", "d1:mine", small);
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:another", small)).toEqual({ ok: false, scope: "device" });
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:mine", small)).toMatchObject({ ok: true });
  });

  it("stops an inquiry that burns through its own call budget, and says which limit it hit", async () => {
    const small = { perInquiry: 3 };
    for (let i = 0; i < 3; i++) expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small)).toMatchObject({ ok: true });
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small)).toEqual({ ok: false, scope: "inquiry" });
  });

  it("counts down the calls left in the inquiry", async () => {
    const small = { perInquiry: 3 };
    const remaining = [];
    for (let i = 0; i < 3; i++) {
      const r = await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small);
      remaining.push(r.ok ? r.remaining : -1);
    }
    expect(remaining).toEqual([2, 1, 0]);
  });
});

describe("across days", () => {
  it("gives a device its allowance again the next day", async () => {
    for (let i = 0; i < limits.deviceFirstDay; i++) await q.charge(DAY, "d1", "1.1.1.1", `d1:${i}`);
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:blocked")).toMatchObject({ ok: false });

    expect(await q.charge(DAY + 1, "d1", "1.1.1.1", "d1:tomorrow")).toMatchObject({ ok: true });
    expect((await q.status(DAY + 1, "d1", "1.1.1.1")).device.used).toBe(1);
  });

  it("keeps an inquiry open across days without charging a new admission", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq");
    await q.charge(DAY + 2, "d1", "1.1.1.1", "d1:inq");
    expect((await q.status(DAY + 2, "d1", "1.1.1.1")).device.used).toBe(0);
  });

  it("treats an inquiry older than its lifetime as a new one, which needs a fresh admission", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq");
    const later = DAY + limits.ttlDays;

    expect(await q.charge(later, "d1", "1.1.1.1", "d1:inq")).toMatchObject({ ok: true });
    expect((await q.status(later, "d1", "1.1.1.1")).device.used).toBe(1);
  });

  it("re-admits an expired inquiry with a full call budget, not with the old tally", async () => {
    const small = { perInquiry: 2, ttlDays: 3 };
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small);
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small);
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small)).toEqual({ ok: false, scope: "inquiry" });

    expect(await q.charge(DAY + 3, "d1", "1.1.1.1", "d1:inq", small)).toEqual({ ok: true, remaining: 1 });
  });

  it("counts a device that has been away for a month as new again", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:a");
    expect((await q.status(DAY + 1, "d1", "1.1.1.1")).device.limit).toBe(limits.device);

    // the sweep that forgets idle devices runs on the next charge
    await q.charge(DAY + 40, "other", "9.9.9.9", "other:a");
    expect((await q.status(DAY + 40, "d1", "1.1.1.1")).device.limit).toBe(limits.deviceFirstDay);
  });
});

describe("refunds", () => {
  it("gives a call back so a provider failure does not eat the inquiry's budget", async () => {
    const small = { perInquiry: 2 };
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small);
    await q.refund("d1:inq");

    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small)).toMatchObject({ ok: true });
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small)).toMatchObject({ ok: true });
  });

  it("never refunds below zero", async () => {
    const small = { perInquiry: 1 };
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small);
    await q.refund("d1:inq");
    await q.refund("d1:inq");
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small);
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small)).toEqual({ ok: false, scope: "inquiry" });
  });

  it("does not give the admission back, only the call", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq");
    await q.refund("d1:inq");
    expect((await q.status(DAY, "d1", "1.1.1.1")).device.used).toBe(1);
  });

  it("ignores a refund for an inquiry it has never seen", async () => {
    await expect(q.refund("nobody:nothing")).resolves.toBeUndefined();
  });
});

describe("the daily budget", () => {
  it("adds each call's reservation to the day's spend, and replaces it with the billed cost once the call is done", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", {}, 5_000);
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", {}, 5_000);
    expect(await q.spent(DAY)).toBe(10_000);

    await q.settle(DAY, 5_000, 300);
    expect(await q.spent(DAY)).toBe(5_300);
  });

  it("sends no call whose reservation would take the day past the budget, even inside an inquiry under way", async () => {
    const small = { budget: 10_000, admitBudget: 5_000 };
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 4_000)).toMatchObject({ ok: true });
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 4_000)).toMatchObject({ ok: true });

    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 4_000)).toEqual({ ok: false, scope: "budget" });
    // A smaller call still fits under what is left.
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 2_000)).toMatchObject({ ok: true });
    expect(await q.spent(DAY)).toBe(10_000);
  });

  it("counts calls in flight, so parallel calls cannot overdraw the budget together", async () => {
    const small = { budget: 10_000, admitBudget: 10_000 };
    const results = await Promise.all(Array.from({ length: 5 }, () => q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 3_000)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(await q.spent(DAY)).toBeLessThanOrEqual(10_000);
  });

  it("uses neither a call nor an admission when it refuses for the budget", async () => {
    const small = { budget: 10_000, admitBudget: 10_000, perInquiry: 1 };
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 20_000)).toEqual({ ok: false, scope: "budget" });
    expect((await q.status(DAY, "d1", "1.1.1.1")).device.used).toBe(0);
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 1_000)).toEqual({ ok: true, remaining: 0 });
  });

  it("stops admitting new inquiries at the admission budget, but lets the ones under way go on to the full budget", async () => {
    const small = { budget: 10_000, admitBudget: 5_000 };
    await q.charge(DAY, "d1", "1.1.1.1", "d1:mine", small, 5_000);

    expect(await q.charge(DAY, "d2", "2.2.2.2", "d2:new", small, 1_000)).toEqual({ ok: false, scope: "global" });
    expect(await q.budget(DAY, small)).toEqual({ admitting: false, open: true });
    expect(await q.charge(DAY, "d1", "1.1.1.1", "d1:mine", small, 1_000)).toMatchObject({ ok: true });
  });

  it("reports the budget closed once the day's spend reaches it", async () => {
    const small = { budget: 10_000, admitBudget: 5_000 };
    expect(await q.budget(DAY, small)).toEqual({ admitting: true, open: true });
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 10_000);
    expect(await q.budget(DAY, small)).toEqual({ admitting: false, open: false });
  });

  it("gives the reservation back with the call when the provider refused it", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", {}, 7_000);
    await q.refund("d1:inq", DAY, 7_000);
    expect(await q.spent(DAY)).toBe(0);
  });

  it("settles a call on the day it was charged to, even when it finishes after midnight", async () => {
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", {}, 7_000);
    await q.charge(DAY + 1, "d1", "1.1.1.1", "d1:inq", {}, 7_000);
    await q.settle(DAY, 7_000, 100);
    expect(await q.spent(DAY)).toBe(100);
    expect(await q.spent(DAY + 1)).toBe(7_000);
  });

  it("starts each day with nothing spent", async () => {
    const small = { budget: 10_000, admitBudget: 5_000 };
    await q.charge(DAY, "d1", "1.1.1.1", "d1:inq", small, 10_000);
    expect(await q.charge(DAY + 1, "d1", "1.1.1.1", "d1:inq", small, 10_000)).toMatchObject({ ok: true });
  });
});

describe("estimating a call's cost", () => {
  const prices = { input: 0.2, output: 1.2 }; // USD per 1M tokens = micro-USD per token

  it("reserves every UTF-8 byte of the prompt as an input token, plus the whole output allowance", () => {
    // "あ" is 3 bytes: 3 + 1 + 64 framing = 68 bytes -> 13.6; 4,000 output tokens -> 4,800.
    expect(reserveMicros(["あ", "x"], 4000, prices)).toBe(Math.ceil(68 * 0.2 + 4000 * 1.2));
  });

  it("never reserves less than the billed cost of a call that stayed within its limits", () => {
    const system = "You are a data source. ".repeat(200);
    const user = "嫌な意見も聞くべきだし、噂は自然と聞こえてくる。".repeat(50);
    const reserve = reserveMicros([system, user], 4000, prices);
    // The most tokens a byte-level tokenizer can make of that text, and a reply that used every output token.
    const worst = costMicros({ input: new TextEncoder().encode(system + user).length, output: 4000 }, prices);
    expect(reserve).toBeGreaterThanOrEqual(worst);
  });

  it("keeps the 2026-09 worst case for gpt-5.6-luna around a cent, so the $0.50 left after admissions covers dozens of calls", () => {
    // MAX_USER_CHARS of Japanese plus a generous system prompt and schema, at MAX_TOKENS_CAP.
    const reserve = reserveMicros(["s".repeat(10_000), "あ".repeat(8000), "{}".repeat(1000)], 4000, prices);
    expect(reserve).toBeLessThan(13_000);
  });
});

describe("feedback allowance", () => {
  it("admits messages up to the per-IP limit, then stops that sender", async () => {
    expect(await q.admitFeedback(DAY, "1.1.1.1", 2, 50)).toBe(true);
    expect(await q.admitFeedback(DAY, "1.1.1.1", 2, 50)).toBe(true);
    expect(await q.admitFeedback(DAY, "1.1.1.1", 2, 50)).toBe(false);
    expect(await q.admitFeedback(DAY, "2.2.2.2", 2, 50)).toBe(true);
  });

  it("stops everyone at the global limit", async () => {
    expect(await q.admitFeedback(DAY, "1.1.1.1", 5, 1)).toBe(true);
    expect(await q.admitFeedback(DAY, "2.2.2.2", 5, 1)).toBe(false);
  });

  it("gives the day's allowance back per IP and globally when the mail could not be sent", async () => {
    await q.admitFeedback(DAY, "1.1.1.1", 1, 1);
    await q.refundFeedback(DAY, "1.1.1.1");

    expect(await q.admitFeedback(DAY, "1.1.1.1", 1, 1)).toBe(true);
  });

  it("does not spend the AI allowance", async () => {
    await q.admitFeedback(DAY, "1.1.1.1", 5, 50);
    expect((await q.status(DAY, "d1", "1.1.1.1")).ip.used).toBe(0);
  });

  it("resets the next day", async () => {
    expect(await q.admitFeedback(DAY, "1.1.1.1", 1, 50)).toBe(true);
    expect(await q.admitFeedback(DAY, "1.1.1.1", 1, 50)).toBe(false);
    expect(await q.admitFeedback(DAY + 1, "1.1.1.1", 1, 50)).toBe(true);
  });
});
