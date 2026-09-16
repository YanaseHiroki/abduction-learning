/**
 * Browser harness for the screen tests: one Vite dev server and one browser for the file,
 * a fresh page per test. Nothing but the dev server may be reached, so no test can call an
 * AI or the free tier — the screens are driven entirely by seeded local data.
 */
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";

const root = path.resolve(import.meta.dirname, "../..");

let server: ViteDevServer | undefined;
let browser: Browser | undefined;
let base = "";

/** Where a build started with `{ proxy: true }` sends its free-tier requests; openApp's `proxy` answers them. */
export const FAKE_PROXY = "https://proxy.test";

export async function startApp(opts: { proxy?: boolean } = {}) {
  // A dev build has no proxy, but the support links are plain build-time settings: set one (and
  // leave Ko-fi unset) so the screens that offer the support page can be walked here.
  process.env.VITE_SUPPORT_GITHUB = "https://github.com/sponsors/test";
  // A file that needs the free tier points the build at a proxy nobody can reach and answers it in the page.
  if (opts.proxy) process.env.VITE_PROXY_URL = FAKE_PROXY;
  else delete process.env.VITE_PROXY_URL;
  server = await createServer({ root, logLevel: "error", server: { port: 0, strictPort: false, open: false } });
  await server.listen();
  base = server.resolvedUrls!.local[0];
  browser = await launch();
  return base;
}

export async function stopApp() {
  await browser?.close();
  await server?.close();
}

async function launch(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" }); // the installed Google Chrome: no download needed
  } catch {
    return await chromium.launch();
  }
}

export interface OpenOptions {
  lang?: "ja" | "en";
  /** seed the demo inquiry used by the help screenshots before going anywhere */
  seed?: boolean;
  viewport?: { width: number; height: number };
  colorScheme?: "light" | "dark";
  /** answers the fake proxy's requests by path (e.g. "/quota"); only for an app started with `{ proxy: true }` */
  proxy?: (path: string) => { status: number; body: unknown };
}

export interface AppPage {
  page: Page;
  context: BrowserContext;
  /** navigate to a hash route and wait for the screen */
  go: (hashPath: string) => Promise<void>;
  /** requests the page tried to make outside the dev server (should always be empty) */
  blocked: string[];
  errors: string[];
  close: () => Promise<void>;
}

export async function openApp(opts: OpenOptions = {}): Promise<AppPage> {
  const lang = opts.lang ?? "ja";
  const context = await browser!.newContext({
    viewport: opts.viewport ?? { width: 1024, height: 900 },
    colorScheme: opts.colorScheme ?? "light",
    reducedMotion: "reduce",
    locale: lang === "ja" ? "ja-JP" : "en-US",
  });
  const origin = new URL(base).origin;
  const blocked: string[] = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    if (opts.proxy && url.startsWith(FAKE_PROXY)) {
      const { status, body } = opts.proxy(new URL(url).pathname);
      return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }, body: JSON.stringify(body) });
    }
    blocked.push(url);
    return route.abort();
  });

  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  const go = async (hashPath: string) => {
    await page.goto(`${base}#${hashPath}`);
    await page.reload(); // a hash change alone does not remount the router
    await page.locator("main").waitFor();
    await page.evaluate(() => document.fonts.ready);
  };

  if (opts.seed) {
    await page.goto(`${base}#/dev/seed?lang=${lang}&auto=1`);
    await page.locator("[data-seeded]").waitFor();
  } else {
    // the screen language still has to be set, which the seed page would have done
    await page.goto(base);
    await page.evaluate((l) => localStorage.setItem("abduction-learning.settings", JSON.stringify({ uiLang: l, tutorial: { status: "done", inquiryId: null, step: 0 } })), lang);
  }

  return { page, context, go, blocked, errors, close: () => context.close() };
}

/** A label in either screen language. */
export const either = (ja: string, en: string) => new RegExp(`^(${ja}|${en})`);

/** Wait for the element and report whether it showed up (Playwright's own matchers need its runner). */
export async function shown(locator: { first(): { waitFor(o: { state: "visible"; timeout: number }): Promise<void> } }, timeout = 5000) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

/** The visible text of an element, once it is there. */
export async function textOf(locator: { first(): { waitFor(o: { state: "attached"; timeout: number }): Promise<void>; innerText(): Promise<string> } }, timeout = 5000) {
  const el = locator.first();
  await el.waitFor({ state: "attached", timeout });
  return el.innerText();
}

/** The visible text of the screen. */
export const screenText = (page: Page) => textOf(page.locator("main"));
