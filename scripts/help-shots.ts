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
 * No AI is called: no AI button is pressed and every request leaving the dev server is blocked.
 * See docs/help-screenshots.md.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { createServer } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src/assets/help");
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

const courseCard = (page: Page) => page.getByRole("button", { name: /listen · hear/ });
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
    rings: (page) => [[dialog(page).getByRole("button", { name: "listen", exact: true }), dialog(page).getByRole("button", { name: "hear", exact: true })]],
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
    prepare: async (_page, go) => go("/inquiry/demo"),
    rings: (page) => [[page.getByText(either("次の一手", "Next step", true)).locator("xpath=..")]],
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

  const server = await createServer({ root, logLevel: "warn", server: { port: 5190, strictPort: false, open: false } });
  await server.listen();
  const base = server.resolvedUrls!.local[0];
  const origin = new URL(base).origin;
  const browser = await launch();
  const encoder = await browser.newPage();
  const manifestPath = path.join(outDir, "shots.json");
  const manifest: Record<string, Record<string, unknown>> = partial ? JSON.parse(await readFile(manifestPath, "utf8").catch(() => "{}")) : {};

  try {
    for (const lang of langs) {
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE, colorScheme: "light", reducedMotion: "reduce", locale: lang === "ja" ? "ja-JP" : "en-US" });
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
      if (!partial) await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      manifest[lang] ??= {};

      for (const shot of selected) {
        await shot.prepare(page, go);
        const rings = shot.rings(page);
        if (shot.scroll) await scrollTo(page, rings);
        await page.waitForTimeout(300); // let dialogs and scrolling settle
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
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
