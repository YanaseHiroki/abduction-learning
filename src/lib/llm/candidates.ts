import type { Provider } from "./providers";

/**
 * Models the #/bench page compares for the shared free tier, with the prices it costs them at.
 * It lives outside the page so candidates.test.ts can hold worker/wrangler.toml (MODEL and
 * PRICE_*_PER_M, which the Worker's spending cap is computed from) to the same numbers: otherwise
 * the two are only kept in step by a comment asking to change them together.
 */
export interface Candidate {
  provider: Provider;
  model: string;
  /** USD per 1M tokens, taken from each provider's public price list (Sep 2026) */
  inputPrice: number;
  outputPrice: number;
}

export const candidates: Candidate[] = [
  { provider: "gemini", model: "gemini-2.5-flash-lite", inputPrice: 0.1, outputPrice: 0.4 },
  { provider: "openai", model: "gpt-5-nano", inputPrice: 0.05, outputPrice: 0.4 },
  { provider: "openai", model: "gpt-5.6-luna", inputPrice: 0.2, outputPrice: 1.2 },
  { provider: "gemini", model: "gemini-3.1-flash-lite", inputPrice: 0.25, outputPrice: 1.5 },
  { provider: "openai", model: "gpt-5-mini", inputPrice: 0.25, outputPrice: 2.0 },
  { provider: "gemini", model: "gemini-3.5-flash-lite", inputPrice: 0.3, outputPrice: 2.5 },
  { provider: "gemini", model: "gemini-2.5-flash", inputPrice: 0.3, outputPrice: 2.5 },
  { provider: "anthropic", model: "claude-haiku-4-5", inputPrice: 1.0, outputPrice: 5.0 },
];
