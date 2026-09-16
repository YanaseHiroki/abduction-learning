/**
 * Regenerates the home-screen icons listed in the web app manifest (vite.config.ts):
 * `pnpm pwa-icons`.
 *
 *   public/pwa-192.png            purpose "any"
 *   public/pwa-512.png            purpose "any"
 *   public/pwa-maskable-512.png   purpose "maskable"
 *
 * The motif is the header's own: lucide's Sprout in lime-400 on the header gray, so the icon on the
 * home screen and the bar the app opens to look like one thing. Same proportions as public/favicon.svg
 * (the 24-unit sprout at 1.1x on a 32 grid, stroke 2.4). PNG rather than SVG because Android
 * Chrome still wants raster icons to offer installation.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HEADER = "#3a3a3a"; // --header in src/index.css
const LIME_400 = "#a3e635";
// lucide-react's sprout.mjs, drawn on its 24-unit grid
const SPROUT = [
  "M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3",
  "M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4",
  "M5 21h14",
];

/** `glyph` is the share of the side the 24-unit sprout grid takes up. */
function svg(size: number, glyph: number) {
  const scale = (size * glyph) / 24;
  const offset = (size - size * glyph) / 2;
  const paths = SPROUT.map((d) => `<path d="${d}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" fill="${HEADER}"/>
<g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${LIME_400}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
</svg>`;
}

const icons = [
  { file: "pwa-192.png", size: 192, glyph: 0.825 },
  { file: "pwa-512.png", size: 512, glyph: 0.825 },
  // Launchers crop maskable icons to as little as the central 80% circle, so the sprout stays well inside it.
  { file: "pwa-maskable-512.png", size: 512, glyph: 0.6 },
];

const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
try {
  for (const { file, size, glyph } of icons) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${svg(size, glyph)}`);
    await page.screenshot({ path: path.join(root, "public", file), omitBackground: false });
    await page.close();
    console.log(`public/${file}`);
  }
} finally {
  await browser.close();
}
