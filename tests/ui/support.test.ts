import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { openApp, screenText, shown, startApp, stopApp, type AppPage } from "./harness";

/**
 * The way to donate, which only exists while the shared free tier is full. The build talks to a fake
 * proxy answered inside the page, so the quota can run out and then be extended by a donation mid-test.
 */

let app: AppPage;

beforeAll(async () => {
  await startApp({ proxy: true });
}, 120_000);

afterAll(async () => {
  await stopApp();
});

afterEach(async () => {
  if (app) {
    expect(app.blocked).toEqual([]);
    expect(app.errors).toEqual([]);
    await app.close();
  }
});

const room = { used: 0, limit: 5 };
const rules = { device: 3, deviceFirstDay: 5, perInquiry: 60, ttlDays: 3, dailyBudgetUsd: 3, donatedUsd: 0 };
const withRoom = { device: room, ip: room, global: { used: 10, limit: 330 }, budget: { admitting: true, open: true }, rules, model: "m", resetAt: Date.now() + 3600_000 };
const sharedFull = { ...withRoom, budget: { admitting: false, open: true } };
const deviceFull = { ...withRoom, device: { used: 5, limit: 5 } };
const extended = { ...withRoom, rules: { ...rules, dailyBudgetUsd: 7.5, donatedUsd: 4.5 }, donations: { count: 3, totalUsd: 9, recent: [{ no: 3, date: "2026-09-16" }, { no: 2, date: "2026-09-10" }, { no: 1, date: "2026-09-02" }] } };

/** A proxy whose /quota answer the test can change, the way a donation changes the real one. */
function proxy(initial: object) {
  const state = { quota: initial };
  return { state, answer: (path: string) => (path === "/quota" ? { status: 200, body: state.quota } : { status: 404, body: {} }) };
}

describe("the support screen", () => {
  it("offers no way to give while the free tier still has room", async () => {
    const p = proxy(withRoom);
    app = await openApp({ seed: true, proxy: p.answer });
    await app.go("/support");

    expect(await screenText(app.page)).toContain("運営者が自分で払っているAPIキー");
    expect(await app.page.locator("a", { hasText: "GitHub Sponsors" }).count()).toBe(0);
  });

  it("offers GitHub Sponsors once the shared free tier is full, and says a donation raises the shared ceiling", async () => {
    const p = proxy(sharedFull);
    app = await openApp({ seed: true, proxy: p.answer });
    await app.go("/support");

    const github = app.page.locator("a", { hasText: "GitHub Sponsors" });
    expect(await shown(github)).toBe(true);
    expect(await github.getAttribute("href")).toBe("https://github.com/sponsors/test");
    expect(await screenText(app.page)).toContain("あなた自身が1日に始められる探究の数は増えません");
    // Ko-fi is unset in this build, so its button must not be there at all.
    expect(await screenText(app.page)).not.toContain("Ko-fi");
  });

  it("takes the buttons away as soon as a donation has extended the free tier, and says so", async () => {
    const p = proxy(sharedFull);
    app = await openApp({ seed: true, proxy: p.answer });
    await app.go("/support");
    expect(await shown(app.page.locator("a", { hasText: "GitHub Sponsors" }))).toBe(true);

    p.state.quota = extended;
    // Coming back from the donation tab is what the page listens for.
    await app.page.evaluate(() => window.dispatchEvent(new Event("focus")));

    expect(await shown(app.page.getByText("支援が届き、今日の無料枠が広がりました"))).toBe(true);
    expect(await app.page.locator("a", { hasText: "GitHub Sponsors" }).count()).toBe(0);
    expect(await screenText(app.page)).toContain("うち支援で広がった分");
    // The giver finds their own donation by the newest number, in the list that appeared with it.
    expect(await screenText(app.page)).toContain("いちばん新しい支援は「支援 #3」");
  });

  it("lists donations by number and date even while the free tier has room, with only the total's amount", async () => {
    app = await openApp({ seed: true, proxy: proxy({ ...extended, rules }).answer });
    await app.go("/support");

    const text = await screenText(app.page);
    expect(text).toContain("これまで 3 件、合計 $9.00");
    expect(text).toContain("およそ 1000 回分");
    expect(text).toContain("支援 #1");
    expect(text).toContain("2026-09-16");
    expect(text).not.toContain("支援者");
    // Room left, so the list is there without any way to give.
    expect(await app.page.locator("a", { hasText: "GitHub Sponsors" }).count()).toBe(0);
  });

  it("shows no list before the first donation", async () => {
    app = await openApp({ seed: true, proxy: proxy({ ...withRoom, donations: { count: 0, totalUsd: 0, recent: [] } }).answer });
    await app.go("/support");
    expect(await screenText(app.page)).not.toContain("これまでの支援");
  });

  it("offers using your own key as the other way to help, and declines donated keys", async () => {
    app = await openApp({ seed: true, proxy: proxy(withRoom).answer });
    await app.go("/support");

    expect(await screenText(app.page)).toContain("🔑 お金を使わずに支える");
    await app.page.getByText("APIキーの提供をお受けしていない理由").click();
    expect(await screenText(app.page)).toContain("お受けしていません");
  });
});

describe("the ways into the support screen", () => {
  it("are not at the end of the help or in the settings", async () => {
    app = await openApp({ seed: true, proxy: proxy(sharedFull).answer });
    await app.go("/help?s=9");
    expect(await screenText(app.page)).not.toContain("無料枠を支える");
    await app.go("/settings");
    await app.page.getByRole("tab", { name: "無料枠" }).click();
    expect(await shown(app.page.getByText("この端末"))).toBe(true);
    expect(await app.page.locator("a[href$='#/support']").count()).toBe(0);
  });

  it("appear in the new-inquiry note only while the shared free tier is full, and go once a donation extends it", async () => {
    const p = proxy(sharedFull);
    // Unseeded, so the settings keep their default: the free tier (the demo seed brings its own key).
    app = await openApp({ proxy: p.answer });
    await app.go("/");
    await app.page.getByRole("button", { name: /自由に探究する/ }).click();
    const offer = app.page.getByRole("link", { name: /投げ銭で、今日の無料枠を広げられます/ });
    expect(await shown(offer)).toBe(true);

    p.state.quota = extended;
    await app.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

    await offer.waitFor({ state: "detached", timeout: 5000 });
    expect(await app.page.getByText("今日ぶんの無料枠が、利用者全体で尽きました").count()).toBe(0);
  });

  it("do not mention money when it is this device's own share that ran out", async () => {
    app = await openApp({ proxy: proxy(deviceFull).answer });
    await app.go("/");
    await app.page.getByRole("button", { name: /自由に探究する/ }).click();
    expect(await shown(app.page.getByText("今日無料で始められる探究の数を使い切りました"))).toBe(true);
    expect(await app.page.getByText("投げ銭").count()).toBe(0);
  });
});
