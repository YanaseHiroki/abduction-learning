/**
 * Renders scripts/og-image.svg to public/og-image.png: `pnpm og-image`.
 *
 * A browser does the rendering so the Japanese line gets a real font; the SVG asks for Geist (loaded
 * from the package below) and then the system's Japanese sans. PNG, not WebP, because several link
 * preview crawlers still ignore WebP.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(path.join(root, "scripts/og-image.svg"), "utf8");
const geist = await readFile(path.join(root, "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"));

const html = `<style>
@font-face { font-family: "Geist Variable"; font-weight: 100 900; src: url(data:font/woff2;base64,${geist.toString("base64")}) format("woff2"); }
html, body { margin: 0; }
</style>${svg}`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.locator("svg").screenshot({ type: "png" });
  const out = path.join(root, "public/og-image.png");
  await writeFile(out, png);
  console.log(`${path.relative(root, out)}: ${Math.round(png.length / 1024)} KB`);
} finally {
  await browser.close();
}
