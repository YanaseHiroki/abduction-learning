import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves the site under /<repo>/ — override with VITE_BASE when needed.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
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
