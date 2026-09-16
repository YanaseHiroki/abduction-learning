/// <reference lib="dom" />
// (dom: the callbacks passed to page.evaluate run in the browser)
/**
 * Regenerates the help slideshow screenshots: `pnpm shots` (all), or e.g.
 * `pnpm shots --lang=ja --only=observe` while fixing one slide.
 *
 * Starts its own Vite dev server, seeds the demo inquiry (src/dev/demo.ts) through /#/dev/seed,
 * walks each screen at phone width and writes
 *   src/assets/help/<lang>/<id>.webp   the screenshot
 *   src/assets/help/shots.json         its size and where the rings go (in %)
 *   src/assets/help/shots-text.json    the words on that screen, to notice a screenshot going stale
 * No AI is called: no AI button is pressed and every request leaving the dev server is blocked.
 * See docs/help-screenshots.md.
 *
 * Two more modes walk the same screens without touching the pictures:
 *   `pnpm shots:check`   does the wording on screen still match the screenshots? (CI runs this)
 *   `pnpm shots:record`  write shots-text.json for screenshots that are already right
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src/assets/help");
/** Kept out of shots.json because the help page imports that one into the bundle; this is only for the check. */
const TEXT_FILE = "shots-text.json";
const VIEWPORT = { width: 390, height: 680 };
const SCALE = 2;
const WEBP_QUALITY = 0.8;
const RING_PAD = 6;

type Lang = "ja" | "en";
const LANGS: Lang[] = ["ja", "en"];

/** A regex matching a label in either screen language (from its start; `whole` to the end too). */
const either = (ja: string, en: string, whole = false) => new RegExp(`^(${ja}|${en})${whole ? "$" : ""}`);

interface ShotDef {
  id: string;
  /** Brings the page to the state to photograph. */
  prepare: (page: Page, go: (hashPath: string) => Promise<void>) => Promise<void>;
  /** Each entry is one ring, drawn around all of its locators together. */
  rings: (page: Page) => Locator[][];
  /** Scroll so the rings sit in view (not for dialogs). */
  scroll?: boolean;
}

// The demo inquiry finishes "聞く" (which then reopens it), so the course slides use "話す", the recommended next group.
// The words read "say · tell · speak · talk" under the Japanese name and "say / tell / speak / talk" as the English name itself.
const courseCard = (page: Page) => page.getByRole("button", { name: /say [·/] tell [·/] speak [·/] talk/ });
const dialog = (page: Page) => page.getByRole("dialog");
const card = (page: Page, id: string) => page.locator(`#card-demo-${id}`);

// Keep the ids in step with `slides` in src/pages/HelpPage.tsx.
const shots: ShotDef[] = [
  {
    id: "course",
    prepare: async (_page, go) => go("/"),
    rings: (page) => [[courseCard(page)]],
    scroll: true,
  },
  {
    id: "words",
    prepare: async (page, go) => {
      await go("/");
      await courseCard(page).click();
      await dialog(page).waitFor();
    },
    rings: (page) => [[dialog(page).getByRole("button", { name: "say", exact: true }), dialog(page).getByRole("button", { name: "tell", exact: true })]],
  },
  {
    id: "genre",
    prepare: async (page, go) => {
      await go("/");
      await courseCard(page).click();
      await dialog(page).getByRole("button", { name: either("進む", "Next") }).click();
      await dialog(page).locator('[aria-pressed="true"]').waitFor();
    },
    rings: (page) => [[dialog(page).locator('[aria-pressed="true"]')]],
  },
  {
    id: "examples",
    prepare: async (_page, go) => go("/inquiry/demo"),
    rings: (page) => [[card(page, "examples").locator("ol").first()]],
    scroll: true,
  },
  {
    id: "observe",
    prepare: async (page, go) => {
      await go("/inquiry/demo");
      // Select "to music" in the first sentence the way a drag would, so the "Add" bar shows.
      await card(page, "observation").locator('p[data-skey="t-listen:0"][data-side="l2"]').evaluate((p) => {
        const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const at = n.textContent?.indexOf("to music") ?? -1;
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(n, at);
          range.setEnd(n, at + "to music".length);
          getSelection()?.removeAllRanges();
          getSelection()?.addRange(range);
          p.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
          return;
        }
        throw new Error('"to music" not found in the observation card');
      });
      await card(page, "observation").getByRole("button", { name: either("追加", "Add", true) }).waitFor();
    },
    rings: (page) => [[card(page, "observation").getByRole("button", { name: either("追加", "Add", true) }).locator("xpath=..")]],
    scroll: true,
  },
  {
    id: "hypothesis",
    prepare: async (_page, go) => go("/inquiry/demo"),
    rings: (page) => [[card(page, "hypothesis").locator("textarea").nth(0), card(page, "hypothesis").locator("textarea").nth(1)]],
    scroll: true,
  },
  {
    id: "translate",
    prepare: async (_page, go) => go("/inquiry/demo"),
    rings: (page) => [[card(page, "translation").getByText("I was listening"), card(page, "translation").locator("table")]],
    scroll: true,
  },
  {
    id: "save",
    prepare: async (_page, go) => go("/inquiry/demo"),
    rings: (page) => [[card(page, "summary").getByRole("button", { name: either("気づきノートに保存", "Save to notes") })]],
    scroll: true,
  },
  {
    id: "next",
    prepare: async (page, go) => {
      await go("/inquiry/demo");
      // The demo's summary is unsaved, so the next-step panel is still a quiet line until "move on anyway".
      await page.getByRole("button", { name: either("先に次へ進む", "Move on anyway") }).click();
    },
    rings: (page) => [[page.getByText(/^(👉 )?(次の一手|Next step)$/).locator("xpath=..")]],
    scroll: true,
  },
];

type Box = { x: number; y: number; width: number; height: number };

async function unionBox(locators: Locator[]): Promise<Box> {
  const boxes: Box[] = [];
  for (const l of locators) {
    const b = await l.boundingBox();
    if (!b) throw new Error(`not visible: ${l}`);
    boxes.push(b);
  }
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, width: Math.max(...boxes.map((b) => b.x + b.width)) - x, height: Math.max(...boxes.map((b) => b.y + b.height)) - y };
}

/** Scrolls so the rings are centred a little below the middle. */
async function scrollTo(page: Page, rings: Locator[][]) {
  await rings[0][0].scrollIntoViewIfNeeded();
  const boxes = await Promise.all(rings.map(unionBox));
  const top = Math.min(...boxes.map((b) => b.y));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  const want = Math.max(24, VIEWPORT.height * 0.55 - (bottom - top) / 2);
  await page.evaluate((dy) => window.scrollBy(0, dy), top - want);
}

async function toWebp(encoder: Page, png: Buffer) {
  const b64 = await encoder.evaluate(
    async ([data, q]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      return c.toDataURL("image/webp", q).split(",")[1];
    },
    [png.toString("base64"), WEBP_QUALITY] as const,
  );
  return Buffer.from(b64, "base64");
}

/**
 * The words on the prepared screen, as one whitespace-free-ish line.
 *
 * Every run of whitespace collapses to a single space on purpose: where a line happens to wrap depends on
 * the font, so a fingerprint that kept the line breaks would differ between a Mac and CI and cry wolf.
 * Wording is what this catches — copy edited without re-shooting. A screenshot that goes stale only by
 * layout (something newly clipped, say) reads the same and slips through; there is no cheap check for that.
 */
async function fingerprint(page: Page) {
  return (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, " ").trim();
}

/** Where two fingerprints part company, with a little of each side, so the report shows the actual edit. */
function firstDifference(before: string, after: string) {
  let i = 0;
  while (i < before.length && i < after.length && before[i] === after[i]) i++;
  const from = Math.max(0, i - 30);
  const cut = (s: string) => `${from > 0 ? "…" : ""}${s.slice(from, i + 60)}${i + 60 < s.length ? "…" : ""}`;
  return { before: cut(before), after: cut(after) };
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" }); // the installed Google Chrome: no download needed
  } catch {
    try {
      return await chromium.launch();
    } catch (e) {
      console.error("No browser found. Install Google Chrome, or run: pnpm exec playwright install chromium");
      throw e;
    }
  }
}

async function main() {
  const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=") as [string, string]));
  const langs = args.get("lang") ? LANGS.filter((l) => l === args.get("lang")) : LANGS;
  const only = args.get("only")?.split(",");
  const selected = shots.filter((s) => !only || only.includes(s.id));
  if (!langs.length || !selected.length) throw new Error(`nothing to shoot (shots: ${shots.map((s) => s.id).join(", ")})`);
  const partial = langs.length < LANGS.length || !!only;
  // "shoot" writes the pictures; the other two only walk the screens and read the words off them.
  const mode = args.has("check") ? "check" : args.has("record") ? "record" : "shoot";

  const server = await createServer({ root, logLevel: "warn", server: { port: 5190, strictPort: false, open: false } });
  await server.listen();
  const base = server.resolvedUrls!.local[0];
  const origin = new URL(base).origin;
  const browser = await launch();
  const encoder = await browser.newPage();
  const manifestPath = path.join(outDir, "shots.json");
  const manifest: Record<string, Record<string, unknown>> = partial ? JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}")) : {};
  const textPath = path.join(outDir, TEXT_FILE);
  const recorded: Record<string, Record<string, string>> = JSON.parse(await readFile(textPath, "utf8").catch(() => "{}"));
  const texts: Record<string, Record<string, string>> = partial ? recorded : {}; // unused in check, which writes nothing
  const stale: { lang: string; id: string; before?: string; after: string; lost?: string }[] = [];

  try {
    for (const lang of langs) {
      // The demo's times are fixed instants that the screens print in local time, so without pinning the zone
      // a screenshot says something different depending on where it was taken (and the check cries wolf on CI).
      // Asia/Tokyo is what the committed pictures already show.
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: "light", reducedMotion: "reduce", locale: lang === "ja" ? "ja-JP" : "en-US", timezoneId: "Asia/Tokyo" });
      // Only the dev server may be reached, so nothing can call an AI or the free tier by accident.
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith(origin) || url.startsWith("data:")) return route.continue();
        console.warn(`  blocked ${url}`);
        return route.abort();
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
      const go = async (hashPath: string) => {
        await page.goto(`${base}#${hashPath}`);
        await page.reload(); // drop any open dialog or selection from the previous shot
        await page.locator("main").waitFor();
        // The help page has its own header right above the picture; a second one inside it is noise.
        await page.addStyleTag({ content: "#root > header { display: none !important; }" });
        await page.evaluate(() => document.fonts.ready);
      };

      await page.goto(`${base}#/dev/seed?lang=${lang}&auto=1`);
      await page.locator("[data-seeded]").waitFor();

      const dir = path.join(outDir, lang);
      if (mode === "shoot") {
        if (!partial) await rm(dir, { recursive: true, force: true });
        await mkdir(dir, { recursive: true });
      }
      manifest[lang] ??= {};
      texts[lang] ??= {};

      for (const shot of selected) {
        // Every mode walks the screen and finds the rings, check included: a screen that changed enough to
        // lose what a ring points at fails here, instead of waiting to break on somebody's next re-shoot.
        let rings: Locator[][] = [];
        try {
          await shot.prepare(page, go);
          rings = shot.rings(page);
          if (shot.scroll) await scrollTo(page, rings);
        } catch (e) {
          if (mode !== "check") throw e;
          stale.push({ lang, id: shot.id, after: "", lost: `${e}`.split("\n")[0] });
          continue;
        }
        await page.waitForTimeout(300); // let dialogs and scrolling settle

        const words = await fingerprint(page);
        if (mode === "check") {
          const before = recorded[lang]?.[shot.id];
          if (before !== words) stale.push({ lang, id: shot.id, before, after: words });
          continue; // nothing to measure or draw: the pictures are not being touched
        }
        texts[lang][shot.id] = words;
        if (mode === "record") {
          console.log(`${lang}/${shot.id}  recorded`);
          continue;
        }

        const boxes = await Promise.all(rings.map(unionBox));
        const png = await page.screenshot({ animations: "disabled" });
        const webp = await toWebp(encoder, png);
        await writeFile(path.join(dir, `${shot.id}.webp`), webp);

        const pct = (v: number, total: number) => Math.round((v / total) * 1000) / 10;
        manifest[lang][shot.id] = {
          width: VIEWPORT.width * SCALE,
          height: VIEWPORT.height * SCALE,
          rings: boxes.map((b) => {
            const x = Math.max(0, b.x - RING_PAD);
            const y = Math.max(0, b.y - RING_PAD);
            const w = Math.min(VIEWPORT.width, b.x + b.width + RING_PAD) - x;
            const h = Math.min(VIEWPORT.height, b.y + b.height + RING_PAD) - y;
            return { x: pct(x, VIEWPORT.width), y: pct(y, VIEWPORT.height), w: pct(w, VIEWPORT.width), h: pct(h, VIEWPORT.height) };
          }),
        };
        console.log(`${lang}/${shot.id}.webp  ${(webp.length / 1024).toFixed(0)} KB`);
      }
      await context.close();
    }
    if (mode !== "check") {
      if (mode === "shoot") await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await writeFile(textPath, `${JSON.stringify(texts, null, 2)}\n`);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (mode !== "check") return;
  if (!stale.length) {
    console.log(`the help screenshots match the screens (${langs.join(", ")}: ${selected.length} each)`);
    return;
  }
  for (const { lang, id, before, after, lost } of stale) {
    if (lost) {
      console.error(`\n${lang}/${id}: the screen no longer has what this slide rings`);
      console.error(`  ${lost}`);
      console.error("  Fix the slide's prepare/rings in scripts/help-shots.ts, then re-shoot it.");
      continue;
    }
    if (before === undefined) {
      console.error(`\n${lang}/${id}: no wording recorded yet`);
      continue;
    }
    const d = firstDifference(before, after);
    console.error(`\n${lang}/${id}: the screen no longer says what the screenshot shows`);
    console.error(`  screenshot: ${d.before}`);
    console.error(`  screen now: ${d.after}`);
  }
  // A slide whose ring is lost cannot be re-shot until the script is fixed, so it is not listed here.
  const reshoot = stale.filter((s) => !s.lost);
  if (reshoot.length) {
    console.error("\nRe-shoot those slides, then commit the pictures with the change:");
    for (const lang of LANGS.filter((l) => reshoot.some((s) => s.lang === l))) {
      const ids = reshoot.filter((s) => s.lang === lang).map((s) => s.id);
      console.error(`  pnpm shots --lang=${lang} --only=${ids.join(",")}`);
    }
    console.error("\n(If the screenshots are already right and only the recorded wording is behind, run: pnpm shots:record)");
  }
  process.exitCode = 1;
}

await main();
