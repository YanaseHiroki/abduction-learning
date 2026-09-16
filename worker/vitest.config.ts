import { defineConfig } from "vitest/config";
import { cloudflarePool, cloudflareTest } from "@cloudflare/vitest-pool-workers";

/** The worker's tests run inside workerd, so the Durable Object and its SQL storage are the real ones. */
const options = {
  wrangler: { configPath: "./wrangler.toml" },
  miniflare: {
    // secrets live outside wrangler.toml; no test ever lets a real request out
    bindings: { PROVIDER_API_KEY: "test-key", RESEND_API_KEY: "test-resend-key", FEEDBACK_TO: "owner@example.com" },
  },
};

export default defineConfig({
  plugins: [cloudflareTest(options)],
  test: {
    include: ["test/**/*.test.ts"],
    pool: cloudflarePool(options),
  },
});
