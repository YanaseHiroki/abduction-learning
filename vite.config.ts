import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * og:url and og:image must be absolute URLs (most link previews ignore a relative og:image), and only
 * the deploy knows the site's address, so it passes SITE_URL (see .github/workflows/deploy.yml).
 * Without it — a local build, or a fork that deploys somewhere else — the two tags are left out rather
 * than pointing at someone else's site.
 */
function absoluteOgTags(): Plugin {
  const site = process.env.SITE_URL;
  return {
    name: "absolute-og-tags",
    apply: "build",
    transformIndexHtml(html) {
      const marker = /^.*<!-- og:url and og:image .*-->\n/m;
      if (!site) return html.replace(marker, "");
      const base = site.endsWith("/") ? site : `${site}/`;
      // Right before og:image:width, because og:image:* describe the og:image preceding them.
      const tags = [
        `<meta property="og:url" content="${base}" />`,
        `<meta property="og:image" content="${new URL("og-image.png", base).href}" />`,
      ].map((tag) => `    ${tag}\n`).join("");
      return html.replace(marker, tags);
    },
  };
}

// GitHub Pages serves the site under /<repo>/ — override with VITE_BASE when needed.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react(), tailwindcss(), absoluteOgTags()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
