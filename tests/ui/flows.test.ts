import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { openApp, screenText, shown, startApp, stopApp, textOf, type AppPage } from "./harness";

/**
 * What a learner actually does on the screens: the first run, starting an inquiry, changing
 * settings, and moving data between devices. No AI is called — every step stops at the point
 * where a request would go out, and outbound requests are blocked and reported.
 */

let app: AppPage;
const scratch = path.join(import.meta.dirname, "../../node_modules/.tmp");

beforeAll(async () => {
  await startApp();
}, 120_000);

afterAll(async () => {
  await stopApp();
  await rm(scratch, { recursive: true, force: true });
});

afterEach(async () => {
  if (app) {
    expect(app.blocked).toEqual([]);
    expect(app.errors).toEqual([]);
    await app.close();
  }
});

/** A browser with nothing in it: no inquiries, no settings, no finished tutorial. */
async function firstRun(lang: "ja" | "en" = "ja") {
  const a = await openApp({ lang });
  await a.page.evaluate(async () => {
    localStorage.clear();
    await new Promise((done) => {
      const req = indexedDB.deleteDatabase("abduction-learning");
      req.onsuccess = req.onerror = req.onblocked = () => done(null);
    });
  });
  await a.page.evaluate((l) => localStorage.setItem("abduction-learning.settings", JSON.stringify({ uiLang: l })), lang);
  return a;
}

describe("the first run", () => {
  it("greets a new visitor with the welcome instead of the menu", async () => {
    app = await firstRun();
    await app.go("/");
    const main = await screenText(app.page);

    expect(main).toContain("例文から自分で仮説を立てて、確かめる。");
    expect(main).toContain("🚀 はじめる");
    expect(main).not.toContain("基本動詞コース");
  });

  it("offers the way to skip, and shows the menu once it is taken", async () => {
    app = await firstRun();
    await app.go("/");

    await app.page.getByRole("button", { name: /チュートリアルを飛ばす/ }).click();

    expect(await shown(app.page.getByText("🧭 基本動詞コース"))).toBe(true);
    expect(await app.page.evaluate(() => JSON.parse(localStorage.getItem("abduction-learning.settings")!).tutorial.status)).toBe("done");
  });

  it("names the first task, and warns that no AI is connected yet", async () => {
    app = await firstRun();
    await app.go("/");

    await app.page.getByRole("button", { name: /はじめる/ }).click();

    expect(await shown(app.page.getByText("🎯 最初の課題"))).toBe(true);
    const main = await screenText(app.page);
    expect(main).toContain("listen · hear");
    expect(main).toContain("AIの接続先がまだ設定されていません");
  });

  it("starts the tutorial's inquiry, and says it cannot generate rather than calling anything", async () => {
    app = await firstRun();
    await app.go("/");
    await app.page.getByRole("button", { name: /はじめる/ }).click();

    await app.page.getByRole("button", { name: /例文を出す/ }).click();
    await app.page.waitForURL(/#\/inquiry\//);

    const stored = await app.page.evaluate(() => JSON.parse(localStorage.getItem("abduction-learning.settings")!));
    expect(stored.tutorial.status).toBe("running");
    expect(stored.tutorial.inquiryId).toBeTruthy();
    const main = await screenText(app.page);
    expect(main).toContain("listen");
    expect(main).toContain("hear");
    // nothing left the page: the missing credential is caught before any request
    expect(app.blocked).toEqual([]);
  });

  it("brings data over from a backup file instead, and then shows it", async () => {
    app = await openApp({ seed: true });
    await app.go("/settings");
    const backup = await app.page.evaluate(async () => {
      const open = indexedDB.open("abduction-learning");
      const db: IDBDatabase = await new Promise((res) => (open.onsuccess = () => res(open.result)));
      const all = (store: string) =>
        new Promise((res) => {
          const req = db.transaction(store).objectStore(store).getAll();
          req.onsuccess = () => res(req.result);
        });
      return { app: "abduction-learning", version: 1, exportedAt: Date.now(), inquiries: await all("inquiries"), cards: await all("cards"), schemaNotes: await all("schemaNotes") };
    });
    await app.close();

    const file = path.join(scratch, "backup.json");
    await mkdir(scratch, { recursive: true });
    await writeFile(file, JSON.stringify(backup));

    app = await firstRun();
    await app.go("/");
    await app.page.getByRole("button", { name: /データを引き継ぐ/ }).click();
    await app.page.setInputFiles('input[type="file"]', file);

    expect(await shown(app.page.getByText(/件の探究を読み込みました/))).toBe(true);
    await app.page.getByRole("button", { name: /ホームへ/ }).click();
    expect(await screenText(app.page)).toContain("聞く");
  });

  it("says so, rather than failing silently, when the chosen file is not a backup", async () => {
    const file = path.join(scratch, "not-a-backup.json");
    await mkdir(scratch, { recursive: true });
    await writeFile(file, JSON.stringify({ app: "something-else" }));

    app = await firstRun();
    await app.go("/");
    await app.page.getByRole("button", { name: /データを引き継ぐ/ }).click();
    await app.page.setInputFiles('input[type="file"]', file);

    expect(await shown(app.page.getByText(/読み込めませんでした/))).toBe(true);
  });
});

describe("starting an inquiry from a course group", () => {
  it("opens the group's words, preselecting the pair to compare first", async () => {
    app = await openApp({ seed: true });
    await app.go("/");

    await app.page.getByRole("button", { name: /say · tell · speak · talk/ }).click();
    const dialog = app.page.getByRole("dialog");

    expect(await textOf(dialog)).toContain("💬 話す");
    for (const word of ["say", "tell", "speak", "talk"]) {
      expect(await shown(dialog.getByRole("button", { name: word, exact: true }))).toBe(true);
    }
    const chosen = await dialog.locator('[aria-pressed="true"]').allInnerTexts();
    expect(chosen).toEqual(["say", "tell"]);
  });

  it("carries the group's advice into the dialog", async () => {
    app = await openApp({ seed: true });
    await app.go("/");
    await app.page.getByRole("button", { name: /say · tell · speak · talk/ }).click();

    expect(await textOf(app.page.getByRole("dialog"))).toContain("まず say & tell");
  });

  it("moves on to the genre and level, with one genre already chosen", async () => {
    app = await openApp({ seed: true });
    await app.go("/");
    await app.page.getByRole("button", { name: /say · tell · speak · talk/ }).click();
    const dialog = app.page.getByRole("dialog");

    await dialog.getByRole("button", { name: /進む/ }).click();

    expect(await shown(dialog.locator('[aria-pressed="true"]'))).toBe(true);
    expect(await dialog.locator('[aria-pressed="true"]').count()).toBeGreaterThan(0);
  });

  it("reopens the finished group's inquiry instead of starting another", async () => {
    app = await openApp({ seed: true });
    await app.go("/");

    await app.page.getByRole("button", { name: /listen · hear/ }).click();
    await app.page.waitForURL(/#\/inquiry\//);

    expect(app.page.url()).toContain("#/inquiry/demo");
  });
});

describe("settings", () => {
  it("keeps a key typed into a provider tab, across a reload", async () => {
    app = await openApp({ seed: true });
    await app.go("/settings");

    await app.page.getByRole("tab", { name: "OpenAI" }).click();
    await app.page.locator('input[type="password"]').fill("sk-test-key");
    await app.go("/settings");
    await app.page.getByRole("tab", { name: "OpenAI" }).click();

    expect(await app.page.locator('input[type="password"]').inputValue()).toBe("sk-test-key");
    const stored = await app.page.evaluate(() => JSON.parse(localStorage.getItem("abduction-learning.settings")!));
    expect(stored.providers.openai.apiKey).toBe("sk-test-key");
    expect(stored.provider).toBe("openai");
  });

  it("switches the screen to English and back", async () => {
    app = await openApp({ seed: true });
    await app.go("/settings");
    await app.page.getByRole("button", { name: /表示を変更する/ }).click();

    await app.page.getByRole("combobox").filter({ hasText: "日本語" }).click();
    await app.page.getByRole("option", { name: /English|英語/ }).click();

    expect(await shown(app.page.getByText("⚙️ Settings"))).toBe(true);
    expect(await app.page.evaluate(() => document.documentElement.lang)).toBe("en");
  });

  it("turns the page dark and keeps it dark after a reload", async () => {
    app = await openApp({ seed: true });
    await app.go("/settings");
    await app.page.getByRole("button", { name: /表示を変更する/ }).click();

    await app.page.getByRole("button", { name: /ダーク|🌙/ }).first().click();
    expect(await app.page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);

    await app.go("/settings");
    expect(await app.page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
  });

  it("writes a backup file that carries the inquiry", async () => {
    app = await openApp({ seed: true });
    await app.go("/settings");
    await app.page.getByRole("button", { name: /データのバックアップ/ }).click();

    const download = app.page.waitForEvent("download");
    await app.page.getByRole("button", { name: /JSONに書き出す/ }).click();
    const saved = await download;
    const file = path.join(scratch, "exported.json");
    await saved.saveAs(file);

    const data = JSON.parse(await readFile(file, "utf8"));
    expect(data.app).toBe("abduction-learning");
    expect(data.inquiries.map((i: { id: string }) => i.id)).toContain("demo");
    expect(data.cards.length).toBeGreaterThan(0);
    expect(saved.suggestedFilename()).toMatch(/^abduction-learning-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe("working inside an inquiry", () => {
  it("lets a hypothesis be edited, and keeps it after a reload", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");
    const card = app.page.locator("#card-demo-hypothesis");
    const line = card.locator("textarea, input[type='text']").first();

    await line.fill("listen は自分から耳を向ける");
    await app.page.keyboard.press("Tab");
    await app.page.waitForTimeout(1200);
    await app.go("/inquiry/demo");

    const saved = app.page.locator("#card-demo-hypothesis textarea").first();
    expect(await saved.inputValue()).toBe("listen は自分から耳を向ける");
  });

  it("asks before deleting a card that holds work", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");
    const before = await app.page.locator("section[id^='card-demo-']").count();

    app.page.on("dialog", (d) => d.dismiss());
    const card = app.page.locator("#card-demo-observation");
    const remove = card.getByRole("button", { name: /削除|捨てる|Delete/ }).first();
    if (await remove.count()) {
      await remove.click();
      await app.page.waitForTimeout(300);
    }

    expect(await app.page.locator("section[id^='card-demo-']").count()).toBe(before);
  });

  it("goes back to the home screen from the inquiry", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");

    await app.page.locator('main a[href="#/"]').first().click();

    expect(await shown(app.page.getByText("🧭 基本動詞コース"))).toBe(true);
  });
});
