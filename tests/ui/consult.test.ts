import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { openApp, shown, startApp, stopApp, type AppPage } from "./harness";

/** Choosing the words in a chat, then carrying them into a new custom inquiry. The AI is the fake proxy. */

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
const quota = { device: room, ip: room, global: room, budget: { admitting: true, open: true }, rules: { device: 3, deviceFirstDay: 5, perInquiry: 60, ttlDays: 3 }, model: "m", resetAt: Date.now() + 3600_000 };
const suggestion = { reply: "この2つを比べてみましょう。", suggestion: [{ label: "think", kind: "word" }, { label: "believe", kind: "word" }] };

describe("the word consultation", () => {
  it("suggests a combination in the chat and starts a custom inquiry with it", async () => {
    app = await openApp({
      proxy: (path) => (path === "/quota" ? { status: 200, body: quota } : path === "/generate" ? { status: 200, body: { text: JSON.stringify(suggestion), model: "m" } } : { status: 404, body: {} }),
    });
    await app.go("/");
    await app.page.getByRole("button", { name: "いいえ", exact: true }).click();
    await app.page.getByRole("button", { name: /相談して決める/ }).click();
    await app.page.getByRole("dialog").locator("textarea").fill("「思う」の言い分けが知りたい");
    await app.page.getByRole("button", { name: "送信" }).click();

    expect(await shown(app.page.getByText("この2つを比べてみましょう。"))).toBe(true);
    await app.page.getByRole("button", { name: /この組み合わせで始める/ }).click();

    const dialog = app.page.getByRole("dialog");
    expect(await shown(dialog.getByText("自分で決めた組み合わせ"))).toBe(true);
    expect(await shown(dialog.getByRole("button", { name: "think" }))).toBe(true);
    expect(await shown(dialog.getByRole("button", { name: "believe" }))).toBe(true);
    // Carried-over words are in the inquiry, so they must not look like words left out.
    expect(await dialog.getByRole("button", { name: "think" }).getAttribute("class")).not.toContain("opacity-60");
    expect(await dialog.getByRole("button", { name: /進む/ }).isEnabled()).toBe(true);
  });
});
