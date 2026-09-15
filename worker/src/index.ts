/**
 * Shared-key proxy for Abduction Lab.
 *
 * The static site cannot keep a secret, so the owner's API key lives here as a Worker
 * secret. Every call is counted per device, per IP, and globally per day; the model is
 * fixed to a cheap one; and only prompts carrying the app's system-prompt signature are
 * accepted, so the endpoint is useless as a general-purpose relay.
 */
import { DurableObject } from "cloudflare:workers";
import { callProvider, ProviderError, SYSTEM_SIGNATURE, type Provider } from "../../src/lib/llm/providers";

export interface Env {
  PROVIDER: Provider;
  MODEL: string;
  PROVIDER_API_KEY: string;
  ALLOWED_ORIGINS: string;
  LIMIT_DEVICE: string;
  LIMIT_IP: string;
  LIMIT_GLOBAL: string;
  RESET_TZ_OFFSET_HOURS: string;
  MAX_TOKENS_CAP: string;
  MAX_USER_CHARS: string;
  QUOTA: DurableObjectNamespace<QuotaCounter>;
}

interface Usage {
  device: number;
  ip: number;
  global: number;
}

/** One global counter object with SQLite-backed daily tallies. */
export class QuotaCounter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS counters (day INTEGER NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, scope, key))",
    );
  }

  private read(day: number, scope: string, key: string): number {
    const row = this.ctx.storage.sql.exec("SELECT n FROM counters WHERE day = ? AND scope = ? AND key = ?", day, scope, key).one() as { n: number } | null;
    return row?.n ?? 0;
  }

  async usage(day: number, device: string, ip: string): Promise<Usage> {
    return { device: this.read(day, "device", device), ip: this.read(day, "ip", ip), global: this.read(day, "global", "*") };
  }

  /** Count one call. Also prunes tallies older than two days. */
  async increment(day: number, device: string, ip: string): Promise<Usage> {
    const sql = this.ctx.storage.sql;
    for (const [scope, key] of [
      ["device", device],
      ["ip", ip],
      ["global", "*"],
    ] as const) {
      sql.exec("INSERT INTO counters (day, scope, key, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, scope, key) DO UPDATE SET n = n + 1", day, scope, key);
    }
    sql.exec("DELETE FROM counters WHERE day < ?", day - 2);
    return this.usage(day, device, ip);
  }
}

function dayInfo(env: Env) {
  const offset = Number(env.RESET_TZ_OFFSET_HOURS || 0) * 3600_000;
  const day = Math.floor((Date.now() + offset) / 86_400_000);
  const resetAt = (day + 1) * 86_400_000 - offset;
  return { day, resetAt };
}

function corsHeaders(env: Env, origin: string | null) {
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  const ok = !allowed.length || (origin && allowed.includes(origin));
  return {
    "access-control-allow-origin": ok && origin ? origin : allowed[0] ?? "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-device-id",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");
    const cors = corsHeaders(env, origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length && origin && !allowed.includes(origin)) return json({ error: "origin not allowed" }, 403, cors);

    const url = new URL(request.url);
    const device = (request.headers.get("x-device-id") ?? "").slice(0, 64) || "anonymous";
    const ip = request.headers.get("cf-connecting-ip") ?? "0.0.0.0";
    const { day, resetAt } = dayInfo(env);
    const limits = { device: Number(env.LIMIT_DEVICE), ip: Number(env.LIMIT_IP), global: Number(env.LIMIT_GLOBAL) };
    const counter = env.QUOTA.get(env.QUOTA.idFromName("global"));

    if (url.pathname === "/quota" && request.method === "GET") {
      const u = await counter.usage(day, device, ip);
      return json(
        {
          device: { used: u.device, limit: limits.device },
          ip: { used: u.ip, limit: limits.ip },
          global: { used: u.global, limit: limits.global },
          model: env.MODEL,
          resetAt,
        },
        200,
        cors,
      );
    }

    if (url.pathname === "/generate" && request.method === "POST") {
      let body: { system?: unknown; user?: unknown; schema?: unknown; effort?: unknown; maxTokens?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid json" }, 400, cors);
      }
      const { system, user, schema } = body;
      if (typeof system !== "string" || !system.includes(SYSTEM_SIGNATURE)) return json({ error: "unsupported prompt" }, 400, cors);
      if (typeof user !== "string" || user.length > Number(env.MAX_USER_CHARS)) return json({ error: "user text too long" }, 400, cors);
      if (!schema || typeof schema !== "object") return json({ error: "schema required" }, 400, cors);
      const maxTokens = Math.min(Number(body.maxTokens) || 4000, Number(env.MAX_TOKENS_CAP));
      const effort = body.effort === "medium" || body.effort === "high" ? body.effort : "low";

      const u = await counter.usage(day, device, ip);
      for (const scope of ["device", "ip", "global"] as const) {
        if (u[scope] >= limits[scope]) return json({ error: "quota", scope, resetAt }, 429, cors);
      }

      try {
        const r = await callProvider({
          provider: env.PROVIDER,
          apiKey: env.PROVIDER_API_KEY,
          model: env.MODEL,
          system,
          user,
          schema: schema as Record<string, unknown>,
          effort,
          maxTokens,
        });
        const after = await counter.increment(day, device, ip);
        return json({ text: r.text, model: r.model }, 200, { ...cors, "x-quota-device-remaining": String(limits.device - after.device) });
      } catch (e) {
        if (e instanceof ProviderError) return json({ error: `${e.provider} ${e.status}: ${e.message}` }, 502, cors);
        return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
      }
    }

    return json({ error: "not found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
