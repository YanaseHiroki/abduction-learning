/**
 * Where the free tier's money comes from. The owner pays for the shared key, and the Worker stops
 * spending at DAILY_BUDGET_USD (new inquiries at ADMIT_BUDGET_USD) in worker/wrangler.toml, so
 * more funding is the only thing that raises the ceiling. LIMIT_GLOBAL is only a backstop counted
 * in inquiries, sized to roughly the same budget.
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

/**
 * Average cost of one inquiry on the free-tier model, from the 2026-09 benchmark
 * (docs/model-bench-2026-09.md, "探究1つあたりの概算"). It only explains what the budget buys; the
 * budget itself comes from the proxy. Update it when the model or its price changes:
 * src/lib/llm/candidates.test.ts checks it against that doc's row for the Worker's MODEL.
 */
export const COST_PER_INQUIRY_USD = 0.009;

/**
 * The day's spending ceiling as the support page states it. A proxy that reports its budget
 * (DAILY_BUDGET_USD) is the source of truth, since it actually stops calls at that amount; an older
 * one does not send it, so fall back to estimating from the inquiry limit and say it is an estimate.
 */
export function dailyBudget(q: { global: { limit: number }; rules: { dailyBudgetUsd?: number } }): { usd: string; capped: boolean } {
  const cap = q.rules.dailyBudgetUsd;
  // Cents, not whole dollars: a small ceiling (50 inquiries is $0.45) would otherwise read as free.
  if (typeof cap === "number" && cap > 0) return { usd: cap.toFixed(2), capped: true };
  return { usd: (q.global.limit * COST_PER_INQUIRY_USD).toFixed(2), capped: false };
}

/**
 * How a donation is named in public: its arrival number with the same noun, never a name the donor
 * could choose, so nothing free-form is published and nobody's real name can end up on the page.
 * It numbers donations rather than people, since one person may give more than once.
 */
export function donationLabel(no: number): { ja: string; en: string } {
  return { ja: `支援 #${no}`, en: `Donation #${no}` };
}

/** Roughly how many inquiries a sum of donations pays for, at the average cost above. */
export function inquiriesFunded(usd: number): number {
  return Math.floor(usd / COST_PER_INQUIRY_USD);
}
