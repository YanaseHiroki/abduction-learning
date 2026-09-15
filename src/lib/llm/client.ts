import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type * as z from "zod/v4";
import { getSettings } from "../settings";

export class MissingApiKeyError extends Error {
  constructor() {
    super("missing-api-key");
  }
}

export function getClient() {
  const { apiKey } = getSettings();
  if (!apiKey) throw new MissingApiKeyError();
  // Browser-side usage: the key belongs to the learner (BYOK) and stays in their localStorage.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export interface CallOptions {
  model?: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

/**
 * One structured call. Returns the parsed object plus model/time metadata.
 * Throws a readable Error on refusal or parse failure.
 */
export async function structured<S extends z.ZodType>(
  system: string,
  user: string,
  schema: S,
  opts: CallOptions = {},
): Promise<{ data: z.infer<S>; model: string; generatedAt: number }> {
  const client = getClient();
  const model = opts.model ?? getSettings().model;
  const response = await client.messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 8000,
    system,
    output_config: { format: zodOutputFormat(schema), effort: opts.effort ?? "low" },
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("refused: " + (response.stop_details?.explanation ?? ""));
  }
  if (!response.parsed_output) {
    throw new Error("parse-failed");
  }
  return { data: response.parsed_output, model: response.model, generatedAt: Date.now() };
}

export function describeError(e: unknown): string {
  if (e instanceof MissingApiKeyError) return "missing-api-key";
  if (e instanceof Anthropic.AuthenticationError) return "auth";
  if (e instanceof Anthropic.RateLimitError) return "rate-limit";
  if (e instanceof Anthropic.APIError) return `api-${e.status}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}
