import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

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
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    absoluteOgTags(),
    VitePWA({
      // Never swap versions under the learner: a new build waits until they press "update" (UpdateBanner).
      registerType: "prompt",
      injectRegister: false,
      includeAssets: [],
      manifest: {
        name: "Abduction Learning",
        short_name: "Abduction",
        description: "例文から自分で仮説を立てて、確かめる語学練習帳。／ Form your own hypotheses from examples, then test them.",
        lang: "ja",
        // Relative to the site root under Pages, so an installed app opens inside /<repo>/ and stays there.
        start_url: base,
        scope: base,
        display: "standalone",
        theme_color: "#3a3a3a", // --header in src/index.css
        background_color: "#3a3a3a",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // The app shell only. AI providers and the Worker are other origins with no runtime route,
        // so those requests go straight to the network and nothing they return is ever cached.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
        // Only link previews fetch the OGP card; there is no reason to download it into every phone.
        globIgnores: ["og-image.png"],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
