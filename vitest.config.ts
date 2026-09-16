import path from "node:path";
import { defineConfig } from "vitest/config";

const alias = { "@": path.resolve(import.meta.dirname, "./src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
          setupFiles: ["src/test/setup.ts"],
          env: { VITE_PROXY_URL: "https://proxy.test" },
        },
      },
      {
        resolve: { alias },
        test: {
          name: "ui",
          environment: "node",
          include: ["tests/ui/**/*.test.ts"],
          // one browser and one dev server for the whole project, and the walks are slow
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
