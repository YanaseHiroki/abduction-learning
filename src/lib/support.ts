/**
 * Where the free tier's money comes from. The owner pays for the shared key, and LIMIT_GLOBAL in
 * worker/wrangler.toml turns that daily budget into a number of inquiries, so more funding is the
 * only thing that raises the ceiling.
 *
 * Donations are handled entirely by external services: no payment code, card data or supporter
 * record ever touches this app. Each link is set at build time and its route into the UI stays
 * hidden while it is unset, the same way the feedback form follows VITE_PROXY_URL.
 */
export const SUPPORT_GITHUB: string = (import.meta.env.VITE_SUPPORT_GITHUB as string | undefined) ?? "";
export const SUPPORT_KOFI: string = (import.meta.env.VITE_SUPPORT_KOFI as string | undefined) ?? "";

/** Whether anywhere in the app should offer the support page at all. */
export function hasSupportLinks() {
  return !!(SUPPORT_GITHUB || SUPPORT_KOFI);
}
