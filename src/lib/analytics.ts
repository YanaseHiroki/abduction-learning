/**
 * Cloudflare Web Analytics site token. The beacon itself is injected into index.html at build time by
 * vite.config.ts; this copy only lets the screen say that visits are counted, so a fork that deploys
 * without the token doesn't claim to measure anything. Never in dev, so UI tests stay offline.
 */
export const ANALYTICS_ENABLED: boolean =
  import.meta.env.PROD && Boolean(import.meta.env.VITE_CF_BEACON_TOKEN as string | undefined);
