/**
 * Provider-agnostic structured-output call. Shared by the browser (BYOK) and the
 * Cloudflare Worker (shared key), so it must not touch browser-only APIs.
 */
import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "openai" | "gemini";

export interface ProviderCall {
  provider: Provider;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>; // JSON schema of the expected output
  effort: "low" | "medium" | "high";
  maxTokens: number;
  /** browser-side calls need the direct-access opt-in headers */
  browser?: boolean;
}

export interface ProviderResult {
  text: string; // JSON text
  model: string;
}

export class ProviderError extends Error {
  provider: Provider;
  status: number;
  constructor(provider: Provider, status: number, message: string) {
    super(message);
    this.provider = provider;
    this.status = status;
  }
}

export const providerMeta: Record<Provider, { label: string; keysUrl: string; defaultModel: string; cheapModel: string; models: string[] }> = {
  anthropic: {
    label: "Anthropic (Claude)",
    keysUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-opus-5",
    cheapModel: "claude-haiku-4-5",
    models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  openai: {
    label: "OpenAI",
    keysUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-5-mini",
    cheapModel: "gpt-5-mini",
    models: ["gpt-5", "gpt-5-mini", "gpt-5-nano"],
  },
  gemini: {
    label: "Google Gemini",
    keysUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-flash",
    cheapModel: "gemini-2.5-flash",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
  },
};

export async function callProvider(c: ProviderCall): Promise<ProviderResult> {
  switch (c.provider) {
    case "anthropic":
      return callAnthropic(c);
    case "openai":
      return callOpenAI(c);
    case "gemini":
      return callGemini(c);
  }
}

async function callAnthropic(c: ProviderCall): Promise<ProviderResult> {
  const client = new Anthropic({ apiKey: c.apiKey, dangerouslyAllowBrowser: !!c.browser });
  // Haiku 4.5 rejects `effort`; the 4.6+ family accepts it.
  const supportsEffort = !c.model.startsWith("claude-haiku");
  try {
    const res = await client.messages.create({
      model: c.model,
      max_tokens: c.maxTokens,
      system: c.system,
      messages: [{ role: "user", content: c.user }],
      output_config: { format: { type: "json_schema", schema: c.schema }, ...(supportsEffort ? { effort: c.effort } : {}) },
    });
    if (res.stop_reason === "refusal") throw new ProviderError("anthropic", 200, "refused: " + (res.stop_details?.explanation ?? ""));
    const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { text, model: res.model };
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof Anthropic.APIError) throw new ProviderError("anthropic", e.status ?? 0, e.message);
    throw e;
  }
}

async function callOpenAI(c: ProviderCall): Promise<ProviderResult> {
  const body: Record<string, unknown> = {
    model: c.model,
    messages: [
      { role: "system", content: c.system },
      { role: "user", content: c.user },
    ],
    max_completion_tokens: c.maxTokens,
    response_format: { type: "json_schema", json_schema: { name: "output", schema: c.schema } },
  };
  if (/^(gpt-5|o\d)/.test(c.model)) body.reasoning_effort = c.effort;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${c.apiKey}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as {
    error?: { message: string };
    model?: string;
    choices?: { message: { content: string | null; refusal?: string | null } }[];
  };
  if (!res.ok) throw new ProviderError("openai", res.status, json.error?.message ?? res.statusText);
  const msg = json.choices?.[0]?.message;
  if (msg?.refusal) throw new ProviderError("openai", 200, "refused: " + msg.refusal);
  return { text: msg?.content ?? "", model: json.model ?? c.model };
}

async function callGemini(c: ProviderCall): Promise<ProviderResult> {
  const generationConfig: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseJsonSchema: c.schema,
    maxOutputTokens: c.maxTokens,
  };
  if (/flash/.test(c.model) && c.effort === "low") generationConfig.thinkingConfig = { thinkingBudget: 0 };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": c.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: c.system }] },
      contents: [{ role: "user", parts: [{ text: c.user }] }],
      generationConfig,
    }),
  });
  const json = (await res.json()) as {
    error?: { message: string };
    modelVersion?: string;
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  };
  if (!res.ok) throw new ProviderError("gemini", res.status, json.error?.message ?? res.statusText);
  const cand = json.candidates?.[0];
  if (!cand?.content?.parts?.length) throw new ProviderError("gemini", 200, "empty response: " + (cand?.finishReason ?? "unknown"));
  return { text: cand.content.parts.map((p) => p.text ?? "").join(""), model: json.modelVersion ?? c.model };
}

/** The shared-key proxy only accepts prompts carrying this signature, so it cannot be used as a general-purpose relay. */
export const SYSTEM_SIGNATURE = "You are a data source for a learner who studies";
