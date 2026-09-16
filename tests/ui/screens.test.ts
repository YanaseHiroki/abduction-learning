import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { openApp, screenText, shown, startApp, stopApp, textOf, type AppPage } from "./harness";

/**
 * Every screen, rendered by the real app in a real browser over the seeded demo inquiry.
 * No AI is called: requests leaving the dev server are blocked and reported.
 */

let app: AppPage;

beforeAll(async () => {
  await startApp();
}, 120_000);

afterAll(async () => {
  await stopApp();
});

afterEach(async () => {
  if (app) {
    // a screen that reached for the network, or threw, is a failure however it looked
    expect(app.blocked).toEqual([]);
    expect(app.errors).toEqual([]);
    await app.close();
  }
});

describe("the home screen", () => {
  it("shows the course, its groups and the inquiry to continue", async () => {
    app = await openApp({ seed: true });
    await app.go("/");
    const main = app.page.locator("main");

    expect(await textOf(main)).toContain("基本動詞コース");
    expect(await textOf(main)).toContain("listen · hear");
    expect(await textOf(main)).toContain("say · tell · speak · talk");
    expect(await textOf(main)).toContain("続きから");
  });

  it("recommends the next group to explore, not the one already finished", async () => {
    app = await openApp({ seed: true });
    await app.go("/");

    const recommended = app.page.locator("section", { hasText: "基本動詞コース" }).getByText("おすすめ").first();
    expect(await shown(recommended)).toBe(true);
    // the demo finished "listen / hear", so that card offers to reopen it instead
    expect(await textOf(app.page.getByRole("button", { name: /listen · hear/ }))).toContain("続きから");
  });

  it("shows the schema left by the last inquiry and a link to the notes", async () => {
    app = await openApp({ seed: true });
    await app.go("/");

    const main = await screenText(app.page);
    expect(main).toContain("listen = 自分から耳を向けて聞く");
    expect(main).toContain("気づきノートを見る（1件）");
  });

  it("renders in English when the screen language is English", async () => {
    app = await openApp({ seed: true, lang: "en" });
    await app.go("/");

    const main = app.page.locator("main");
    expect(await textOf(main)).toContain("Form your own hypotheses");
    expect(await textOf(main)).toContain("Basic verbs course");
    expect(await textOf(main)).not.toContain("基本動詞コース");
  });
});

describe("the inquiry screen", () => {
  it("lays out the whole inquiry: examples, observation, hypothesis, verification and summary", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");
    const main = app.page.locator("main");

    expect(await textOf(main)).toContain("📝 例文セット");
    expect(await textOf(main)).toContain("🔍 観察");
    expect(await textOf(main)).toContain("💡 仮説");
    expect(await textOf(main)).toContain("🌐 検証：翻訳テスト");
    expect(await textOf(main)).toContain("🏁 まとめ・出力");
  });

  it("numbers the steps of the method across the cards", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");

    const steps = await app.page.locator("main").getByText(/^STEP [123]$/).allInnerTexts();
    expect(steps).toContain("STEP 1");
    expect(steps).toContain("STEP 2");
    expect(steps).toContain("STEP 3");
  });

  it("shows each target's sentences with their translations", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");
    const examples = app.page.locator("#card-demo-examples");

    expect(await textOf(examples)).toContain("I always listen to music on the train.");
    expect(await textOf(examples)).toContain("電車ではいつも音楽を聴いている。");
    expect(await textOf(examples)).toContain("I heard a strange noise last night.");
  });

  it("shows the comparison table built from what was marked", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");
    const observation = app.page.locator("#card-demo-observation");

    expect(await textOf(observation)).toContain("📊 比較表");
    expect(await textOf(observation)).toContain("to music");
    expect(await textOf(observation)).toContain("a strange noise");
  });

  it("shows the translation test's predictions beside what actually came out", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");
    const verify = app.page.locator("#card-demo-translation");

    expect(await textOf(verify)).toContain("予想");
    expect(await textOf(verify)).toContain("実際");
    expect(await textOf(verify)).toContain("listening");
    expect(await textOf(verify)).toContain("一致");
  });

  it("names the inquiry's languages and genre in the header", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/demo");

    expect(await textOf(app.page.locator("main"))).toContain("ja → en · 日常会話");
  });

  it("shows nothing alarming for an inquiry that does not exist", async () => {
    app = await openApp({ seed: true });
    await app.go("/inquiry/no-such-inquiry");

    expect(await shown(app.page.locator("main"))).toBe(true);
    expect(await screenText(app.page)).not.toContain("📝 例文セット");
  });
});

describe("the notes screen", () => {
  it("lists the schema saved from the inquiry, with a way back to it", async () => {
    app = await openApp({ seed: true });
    await app.go("/notes");
    const main = app.page.locator("main");

    expect(await textOf(main)).toContain("📒 気づきノート");
    expect(await textOf(main)).toContain("listen — 自分から耳を向けて聞く");
    expect(await textOf(main)).toContain("hear — 音や話が自然に耳に入ってくる");
    expect(await shown(app.page.getByRole("link", { name: /元の探究を開く/ }))).toBe(true);
  });
});

describe("the help screen", () => {
  it("opens on the first slide and walks forward and back", async () => {
    app = await openApp({ seed: true });
    await app.go("/help");
    const first = app.page.getByText("🧭 コースを選ぶ");
    const second = app.page.getByText("🔤 比べる語を選ぶ");

    expect(await shown(first)).toBe(true);

    await app.page.getByRole("button", { name: /進む/ }).click();
    expect(await shown(second)).toBe(true);
    expect(await screenText(app.page)).not.toContain("🧭 コースを選ぶ");

    await app.page.getByRole("button", { name: /戻る/ }).first().click();
    expect(await shown(first)).toBe(true);
  });

  // The feedback offer on the last slide needs a proxy to send to, which a dev build has none of.
  it("shows a screenshot on every slide, and ends by sending the reader off to start", async () => {
    app = await openApp({ seed: true });
    await app.go("/help");
    const next = app.page.getByRole("button", { name: /進む/ });
    let slides = 0;

    while (await next.count()) {
      expect(await shown(app.page.locator("main img"))).toBe(true);
      const before = await screenText(app.page);
      await next.click();
      await app.page.waitForFunction((t) => document.querySelector("main")!.innerText !== t, before);
      slides++;
      if (slides > 30) throw new Error("the slideshow never ends");
    }

    expect(slides).toBeGreaterThan(5);
    expect(await screenText(app.page)).toContain("🚀 さっそく始める");
  });
});

describe("the settings screen", () => {
  it("shows the AI tabs, with the free tier first", async () => {
    app = await openApp({ seed: true });
    await app.go("/settings");

    expect(await textOf(app.page.locator("main"))).toContain("🤖 AIの接続先");
    for (const name of ["無料枠", "Anthropic (Claude)", "OpenAI", "Google Gemini"]) {
      expect(await shown(app.page.getByRole("tab", { name }))).toBe(true);
    }
  });

  it("says plainly that this build has no free tier rather than pretending to offer one", async () => {
    app = await openApp({ seed: true });
    await app.go("/settings");
    await app.page.getByRole("tab", { name: "無料枠" }).click();

    expect(await textOf(app.page.locator("main"))).toContain("無料枠が設定されていません");
  });

  it("offers the backup section", async () => {
    app = await openApp({ seed: true });
    await app.go("/settings");

    expect(await textOf(app.page.locator("main"))).toContain("💾 データのバックアップ");
  });
});

describe("the support screen", () => {
  it("explains what the free tier costs and where the ceiling comes from", async () => {
    app = await openApp({ seed: true });
    await app.go("/support");

    const main = await screenText(app.page);
    expect(main).toContain("💛 無料枠を支える");
    expect(main).toContain("運営者が自分で払っているAPIキー");
  });

  it("says a donation raises the shared ceiling, not the giver's own allowance", async () => {
    app = await openApp({ seed: true });
    await app.go("/support");

    expect(await screenText(app.page)).toContain("あなた自身が1日に始められる探究の数は増えません");
    const github = app.page.locator("a", { hasText: "GitHub Sponsors" });
    expect(await shown(github)).toBe(true);
    expect(await github.getAttribute("href")).toBe("https://github.com/sponsors/test");
    // Ko-fi is unset in this build, so its button must not be there at all.
    expect(await screenText(app.page)).not.toContain("Ko-fi");
  });

  it("offers using your own key as the other way to help, and declines donated keys", async () => {
    app = await openApp({ seed: true });
    await app.go("/support");

    expect(await screenText(app.page)).toContain("🔑 お金を使わずに支える");
    await app.page.getByText("APIキーの提供をお受けしていない理由").click();
    expect(await screenText(app.page)).toContain("お受けしていません");
  });

  it("is reachable from the end of the help, where a reader has seen the whole method", async () => {
    app = await openApp({ seed: true });
    await app.go(`/help?s=9`);

    expect(await shown(app.page.getByRole("link", { name: /無料枠を支える/ }))).toBe(true);
  });
});

describe("across themes and sizes", () => {
  it("paints the dark theme on the page, not just on the cards", async () => {
    app = await openApp({ seed: true, colorScheme: "dark" });
    await app.go("/");

    expect(await app.page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(true);
    const bg = await app.page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = bg.match(/\d+/g)!.map(Number);
    expect(r + g + b).toBeLessThan(200);
  });

  it("fits a phone screen without sideways scrolling, on every screen", async () => {
    app = await openApp({ seed: true, viewport: { width: 390, height: 680 } });

    for (const route of ["/", "/inquiry/demo", "/notes", "/help", "/settings", "/support"]) {
      await app.go(route);
      const overflow = await app.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect({ route, overflow }).toEqual({ route, overflow: 0 });
    }
  });

  it("keeps the header and its links on every screen", async () => {
    app = await openApp({ seed: true });

    for (const route of ["/", "/inquiry/demo", "/notes", "/help", "/settings", "/support"]) {
      await app.go(route);
      expect({ route, header: await shown(app.page.getByRole("link", { name: "Abduction Learning" })) }).toEqual({ route, header: true });
      expect(await shown(app.page.getByRole("link", { name: /ヘルプ/ }))).toBe(true);
      expect(await shown(app.page.getByRole("link", { name: /設定/ }))).toBe(true);
    }
  });
});
