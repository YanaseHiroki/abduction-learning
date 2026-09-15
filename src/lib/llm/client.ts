import * as z from "zod/v4";
import { getSettings, setSettings } from "../settings";
import { callProvider, ProviderError, providerMeta, type Provider } from "./providers";

export class MissingApiKeyError extends Error {
  provider: Provider | "shared";
  constructor(provider: Provider | "shared") {
    super("missing-api-key");
    this.provider = provider;
  }
}
export class QuotaError extends Error {
  scope: string;
  resetAt: number;
  constructor(scope: string, resetAt: number) {
    super("quota");
    this.scope = scope;
    this.resetAt = resetAt;
  }
}

export const PROXY_URL: string = (import.meta.env.VITE_PROXY_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export interface CallOptions {
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** use the provider's cheapest model (QA pass) */
  cheap?: boolean;
}

function deviceId() {
  const s = getSettings();
  if (s.deviceId) return s.deviceId;
  const id = crypto.randomUUID();
  setSettings({ deviceId: id });
  return id;
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema, { reused: "ref" }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

/**
 * One structured call, routed to the active tab in Settings:
 * the shared free tier (proxy) or the learner's own key for one provider.
 */
export async function structured<S extends z.ZodType>(
  system: string,
  user: string,
  schema: S,
  opts: CallOptions = {},
): Promise<{ data: z.infer<S>; model: string; generatedAt: number }> {
  const s = getSettings();
  const jsonSchema = toJsonSchema(schema);
  const effort = opts.effort ?? "low";
  const maxTokens = opts.maxTokens ?? 8000;
  let text: string;
  let model: string;

  if (s.provider === "shared") {
    if (!PROXY_URL) throw new MissingApiKeyError("shared");
    const res = await fetch(`${PROXY_URL}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": deviceId() },
      body: JSON.stringify({ system, user, schema: jsonSchema, effort, maxTokens }),
    });
    const json = (await res.json().catch(() => ({}))) as { text?: string; model?: string; error?: string; scope?: string; resetAt?: number };
    if (res.status === 429) throw new QuotaError(json.scope ?? "global", json.resetAt ?? 0);
    if (!res.ok) throw new Error(json.error ?? `proxy ${res.status}`);
    text = json.text ?? "";
    model = json.model ?? "shared";
  } else {
    const p = s.providers[s.provider];
    if (!p.apiKey) throw new MissingApiKeyError(s.provider);
    const r = await callProvider({
      provider: s.provider,
      apiKey: p.apiKey,
      model: opts.cheap ? providerMeta[s.provider].cheapModel : p.model || providerMeta[s.provider].defaultModel,
      system,
      user,
      schema: jsonSchema,
      effort,
      maxTokens,
      browser: true,
    });
    text = r.text;
    model = r.model;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("parse-failed");
  }
  const out = schema.safeParse(parsed);
  if (!out.success) throw new Error("parse-failed: " + out.error.issues.slice(0, 3).map((i) => i.path.join(".") + " " + i.message).join("; "));
  return { data: out.data, model, generatedAt: Date.now() };
}

export interface Quota {
  device: { used: number; limit: number };
  ip: { used: number; limit: number };
  global: { used: number; limit: number };
  model: string;
  resetAt: number;
}

export async function fetchQuota(): Promise<Quota | null> {
  if (!PROXY_URL) return null;
  try {
    const res = await fetch(`${PROXY_URL}/quota`, { headers: { "x-device-id": deviceId() } });
    if (!res.ok) return null;
    return (await res.json()) as Quota;
  } catch {
    return null;
  }
}

export function hasCredential() {
  const s = getSettings();
  if (s.provider === "shared") return !!PROXY_URL;
  return !!s.providers[s.provider].apiKey;
}

export function describeError(e: unknown): string {
  if (e instanceof MissingApiKeyError) return "missing-api-key";
  if (e instanceof QuotaError) return "quota";
  if (e instanceof ProviderError) return `${e.provider} ${e.status}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}
