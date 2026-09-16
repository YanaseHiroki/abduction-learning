import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { QuotaCounter } from "../src/index";

/**
 * The free tier is counted in inquiries: a device is admitted a few per day, and an admitted
 * inquiry then has a fixed budget of calls it cannot be cut off in the middle of.
 * These drive the Durable Object directly so the limits and the day number can be chosen.
 */

const limits = { device: 3, deviceFirstDay: 5, ip: 10, global: 50, perInquiry: 60, ttlDays: 3 };
const DAY = 20_000;

/** A counter of its own per test: the worker keeps one global object, so tests must not share its tallies. */
let n = 0;
function counter() {
  const stub = env.QUOTA.get(env.QUOTA.idFromName(`test-${n++}`));
  return {
    charge: (day: number, device: string, ip: string, inquiry: string, over: Partial<typeof limits> = {}) =>
      runInDurableObject(stub, (o: QuotaCounter) => o.charge(day, device, ip, inquiry, { ...limits, ...over })),
    status: (day: number, device: string, ip: string, over: Partial<typeof limits> = {}) =>
      runInDurableObject(stub, (o: QuotaCounter) => o.status(day, device, ip, { ...limits, ...over })),
    refund: (inquiry: string) => runInDurableObject(stub, (o: QuotaCounter) => o.refund(inquiry)),
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
