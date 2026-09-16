/**
 * Shared-key proxy for Abduction Learning.
 *
 * The static site cannot keep a secret, so the owner's API key lives here as a Worker
 * secret. The free tier is counted in inquiries, not calls: a device may start a few
 * inquiries per day (per device, per IP, and globally), and each admitted inquiry gets a
 * fixed budget of AI calls it can use until it expires. A learner therefore never runs out
 * in the middle of an inquiry. The model is fixed to a cheap one, and only prompts carrying
 * the app's system-prompt signature are accepted, so the endpoint is useless as a
 * general-purpose relay.
 */
import { DurableObject } from "cloudflare:workers";
import { callProvider, ProviderError, SYSTEM_SIGNATURE, type Provider } from "../../src/lib/llm/providers";

export interface Env {
  PROVIDER: Provider;
  MODEL: string;
  PROVIDER_API_KEY: string;
  ALLOWED_ORIGINS: string;
  LIMIT_DEVICE: string;
  LIMIT_DEVICE_FIRST_DAY: string;
  LIMIT_IP: string;
  LIMIT_GLOBAL: string;
  CALLS_PER_INQUIRY: string;
  INQUIRY_TTL_DAYS: string;
  RESET_TZ_OFFSET_HOURS: string;
  MAX_TOKENS_CAP: string;
  MAX_USER_CHARS: string;
  FEEDBACK_LIMIT_IP: string;
  FEEDBACK_LIMIT_GLOBAL: string;
  FEEDBACK_MAX_CHARS: string;
  /** Resend API key; the feedback form is off until this and FEEDBACK_TO are set */
  RESEND_API_KEY?: string;
  /** where feedback is delivered; must be the address the Resend account was registered with */
  FEEDBACK_TO?: string;
  QUOTA: DurableObjectNamespace<QuotaCounter>;
}

interface Limits {
  device: number;
  deviceFirstDay: number;
  ip: number;
  global: number;
  perInquiry: number;
  ttlDays: number;
}

type Scope = "device" | "ip" | "global";
type Status = Record<Scope, { used: number; limit: number }>;
export type Charge = { ok: true; remaining: number } | { ok: false; scope: Scope | "inquiry" };

/** One global object holding the daily admission tallies, the admitted inquiries, and each device's first day. */
export class QuotaCounter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    // v1 counted calls per day; those tallies mean nothing under per-inquiry counting.
    sql.exec("DROP TABLE IF EXISTS counters");
    sql.exec("CREATE TABLE IF NOT EXISTS admissions (day INTEGER NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, scope, key))");
    sql.exec("CREATE TABLE IF NOT EXISTS inquiries (key TEXT PRIMARY KEY, day INTEGER NOT NULL, used INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, first_day INTEGER NOT NULL, last_day INTEGER NOT NULL)");
  }

  private admitted(day: number, scope: Scope, key: string): number {
    // .one() throws when there is no row yet, so take the first row of the array instead.
    const row = this.ctx.storage.sql.exec("SELECT n FROM admissions WHERE day = ? AND scope = ? AND key = ?", day, scope, key).toArray()[0] as { n: number } | undefined;
    return row?.n ?? 0;
  }

  private statusNow(day: number, device: string, ip: string, limits: Limits): Status {
    const seen = this.ctx.storage.sql.exec("SELECT first_day FROM devices WHERE id = ?", device).toArray()[0] as { first_day: number } | undefined;
    const firstDay = (seen?.first_day ?? day) === day;
    return {
      device: { used: this.admitted(day, "device", device), limit: firstDay ? limits.deviceFirstDay : limits.device },
      ip: { used: this.admitted(day, "ip", ip), limit: limits.ip },
      global: { used: this.admitted(day, "global", "*"), limit: limits.global },
    };
  }

  async status(day: number, device: string, ip: string, limits: Limits): Promise<Status> {
    return this.statusNow(day, device, ip, limits);
  }

  /**
   * Charge one AI call to an inquiry, admitting it first when it is new (or expired).
   * Runs without awaiting, so parallel calls for the same inquiry cannot both be admitted.
   */
  async charge(day: number, device: string, ip: string, inquiryKey: string, limits: Limits): Promise<Charge> {
    const sql = this.ctx.storage.sql;
    let row = sql.exec("SELECT day, used FROM inquiries WHERE key = ?", inquiryKey).toArray()[0] as { day: number; used: number } | undefined;
    if (row && day - row.day >= limits.ttlDays) row = undefined;
    if (!row) {
      const s = this.statusNow(day, device, ip, limits);
      for (const scope of ["device", "ip", "global"] as const) {
        if (s[scope].used >= s[scope].limit) return { ok: false, scope };
      }
      for (const [scope, key] of [["device", device], ["ip", ip], ["global", "*"]] as const) {
        sql.exec("INSERT INTO admissions (day, scope, key, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, scope, key) DO UPDATE SET n = n + 1", day, scope, key);
      }
      sql.exec("INSERT INTO inquiries (key, day, used) VALUES (?, ?, 0) ON CONFLICT (key) DO UPDATE SET day = excluded.day, used = 0", inquiryKey, day);
      row = { day, used: 0 };
    }
    if (row.used >= limits.perInquiry) return { ok: false, scope: "inquiry" };
    sql.exec("UPDATE inquiries SET used = used + 1 WHERE key = ?", inquiryKey);
    sql.exec("INSERT INTO devices (id, first_day, last_day) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET last_day = excluded.last_day", device, day, day);
    // Forget old tallies; a device idle for 30 days counts as new again.
    sql.exec("DELETE FROM admissions WHERE day < ?", day - 2);
    sql.exec("DELETE FROM inquiries WHERE day <= ?", day - limits.ttlDays);
    sql.exec("DELETE FROM devices WHERE last_day < ?", day - 30);
    return { ok: true, remaining: limits.perInquiry - row.used - 1 };
  }

  /** Give a call back when the provider failed, so errors do not eat the inquiry's budget. */
  async refund(inquiryKey: string) {
    this.ctx.storage.sql.exec("UPDATE inquiries SET used = MAX(used - 1, 0) WHERE key = ?", inquiryKey);
  }

  /** Count one feedback message per IP and globally, so the form cannot flood the owner's inbox. */
  async admitFeedback(day: number, ip: string, perIp: number, global: number): Promise<boolean> {
    const sql = this.ctx.storage.sql;
    const count = (key: string) => (sql.exec("SELECT n FROM admissions WHERE day = ? AND scope = 'feedback' AND key = ?", day, key).toArray()[0] as { n: number } | undefined)?.n ?? 0;
    if (count(ip) >= perIp || count("*") >= global) return false;
    for (const key of [ip, "*"]) {
      sql.exec("INSERT INTO admissions (day, scope, key, n) VALUES (?, 'feedback', ?, 1) ON CONFLICT (day, scope, key) DO UPDATE SET n = n + 1", day, key);
    }
    sql.exec("DELETE FROM admissions WHERE day < ?", day - 2);
    return true;
  }

  /** Give the message back when the mail could not be sent, so a broken setup does not eat the day's allowance. */
  async refundFeedback(day: number, ip: string) {
    for (const key of [ip, "*"]) {
      this.ctx.storage.sql.exec("UPDATE admissions SET n = MAX(n - 1, 0) WHERE day = ? AND scope = 'feedback' AND key = ?", day, key);
    }
  }
}

const FEEDBACK_KINDS = { usage: "使い方", bug: "不具合", request: "要望", support: "支援", other: "その他" } as const;

/**
 * Build the Resend request for one feedback message, or return why it was rejected. The learner's
 * address (when given) becomes Reply-To, so the owner answers from their own mailbox and nothing
 * is stored here.
 */
function feedbackMail(env: Env, body: Record<string, unknown>, ip: string): Record<string, unknown> | string {
  // hasOwn, not `in`: "toString" and friends are inherited and would print a function into the subject.
  const kind = typeof body.kind === "string" && Object.hasOwn(FEEDBACK_KINDS, body.kind) ? (body.kind as keyof typeof FEEDBACK_KINDS) : "other";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const context = body.context && typeof body.context === "object" ? (body.context as Record<string, unknown>) : {};
  if (!message) return "message required";
  if (message.length > Number(env.FEEDBACK_MAX_CHARS)) return "message too long";
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return "invalid email";

  const lines = Object.entries(context)
    .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    .map(([k, v]) => `${k.slice(0, 40)}: ${String(v).slice(0, 300)}`);
  const text = [
    message,
    "",
    "----",
    `種類: ${FEEDBACK_KINDS[kind]}`,
    `返信先: ${email || "（未記入）"}`,
    ...lines,
    `IP: ${ip}`,
  ].join("\n");
  const summary = message.replace(/\s+/g, " ").slice(0, 40);

  return {
    // resend.dev may only send to the Resend account's own address, which is all this needs.
    from: "Abduction Learning <onboarding@resend.dev>",
    to: env.FEEDBACK_TO,
    ...(email ? { reply_to: email } : {}),
    subject: `[Abduction Learning] ${FEEDBACK_KINDS[kind]}: ${summary}`,
    text,
  };
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
    "access-control-allow-headers": "content-type, x-device-id, x-inquiry-id",
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
    const limits: Limits = {
      device: Number(env.LIMIT_DEVICE),
      deviceFirstDay: Number(env.LIMIT_DEVICE_FIRST_DAY),
      ip: Number(env.LIMIT_IP),
      global: Number(env.LIMIT_GLOBAL),
      perInquiry: Number(env.CALLS_PER_INQUIRY),
      ttlDays: Number(env.INQUIRY_TTL_DAYS),
    };
    const counter = env.QUOTA.get(env.QUOTA.idFromName("global"));

    if (url.pathname === "/quota" && request.method === "GET") {
      const s = await counter.status(day, device, ip, limits);
      return json(
        {
          ...s,
          rules: { device: limits.device, deviceFirstDay: limits.deviceFirstDay, perInquiry: limits.perInquiry, ttlDays: limits.ttlDays },
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
      const inquiry = (request.headers.get("x-inquiry-id") ?? "").slice(0, 64);
      if (!inquiry) return json({ error: "inquiry required" }, 400, cors);
      const maxTokens = Math.min(Number(body.maxTokens) || 4000, Number(env.MAX_TOKENS_CAP));
      const effort = body.effort === "medium" || body.effort === "high" ? body.effort : "low";

      const inquiryKey = `${device}:${inquiry}`;
      const charged = await counter.charge(day, device, ip, inquiryKey, limits);
      if (!charged.ok) return json({ error: "quota", scope: charged.scope, resetAt }, 429, cors);

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
        return json({ text: r.text, model: r.model }, 200, { ...cors, "x-quota-inquiry-remaining": String(charged.remaining) });
      } catch (e) {
        await counter.refund(inquiryKey);
        if (e instanceof ProviderError) return json({ error: `${e.provider} ${e.status}: ${e.message}` }, 502, cors);
        return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
      }
    }

    if (url.pathname === "/feedback" && request.method === "POST") {
      if (!env.RESEND_API_KEY || !env.FEEDBACK_TO) return json({ error: "feedback not configured" }, 503, cors);
      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid json" }, 400, cors);
      }
      // Hidden field only bots fill in: pretend it worked so they do not retry.
      if (typeof body.website === "string" && body.website) return json({ ok: true }, 200, cors);
      const mail = feedbackMail(env, body, ip);
      if (typeof mail === "string") return json({ error: mail }, 400, cors);
      if (!(await counter.admitFeedback(day, ip, Number(env.FEEDBACK_LIMIT_IP), Number(env.FEEDBACK_LIMIT_GLOBAL)))) {
        return json({ error: "quota", resetAt }, 429, cors);
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(mail),
      });
      if (!res.ok) {
        // Nothing was delivered, so the attempt must not count against the sender's day.
        await counter.refundFeedback(day, ip);
        return json({ error: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` }, 502, cors);
      }
      return json({ ok: true }, 200, cors);
    }

    return json({ error: "not found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
