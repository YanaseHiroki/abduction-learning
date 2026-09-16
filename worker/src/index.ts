/**
 * Shared-key proxy for Abduction Learning.
 *
 * The static site cannot keep a secret, so the owner's API key lives here as a Worker
 * secret. The free tier is counted in inquiries, not calls: a device may start a few
 * inquiries per day (per device, per IP, and globally), and each admitted inquiry gets a
 * fixed budget of AI calls it can use until it expires. A learner therefore never runs out
 * in the middle of an inquiry, except on the rare day the owner's money runs out: every call
 * reserves its worst-case cost before it is sent and settles to the billed cost afterwards, and
 * nothing is sent once the reservations would cross the daily budget. The model is fixed to a cheap one, and only prompts carrying
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
  DAILY_BUDGET_USD: string;
  ADMIT_BUDGET_USD: string;
  PRICE_INPUT_PER_M: string;
  PRICE_OUTPUT_PER_M: string;
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
  /** Part of a donation that reaches the owner after payment fees; only that much is added to the pool */
  DONATION_SHARE: string;
  /** USD per unit of each currency donations may arrive in, e.g. "USD=1,JPY=0.0067"; others are not credited */
  DONATION_USD_RATES: string;
  /** Ko-fi's webhook verification token; /donation/kofi answers 503 until it is set */
  KOFI_VERIFICATION_TOKEN?: string;
  /** secret of the GitHub Sponsors webhook; /donation/github answers 503 until it is set */
  SPONSORS_WEBHOOK_SECRET?: string;
  QUOTA: DurableObjectNamespace<QuotaCounter>;
}

interface Limits {
  device: number;
  deviceFirstDay: number;
  ip: number;
  global: number;
  perInquiry: number;
  ttlDays: number;
  /** micro-USD: no call is sent once today's spend plus its reservation would pass this */
  budget: number;
  /** micro-USD: no new inquiry is admitted once today's spend reaches this, leaving room for the ones under way */
  admitBudget: number;
}

type Scope = "device" | "ip" | "global";
type Status = Record<Scope, { used: number; limit: number }>;
export type Charge = { ok: true; remaining: number } | { ok: false; scope: Scope | "inquiry" | "budget" };

/** USD per 1M tokens, which is also micro-USD per token: the unit the spend is kept in. */
export interface Prices {
  input: number;
  output: number;
}

/**
 * The most a call can be billed, in micro-USD. Byte-level tokenizers never produce more tokens than
 * the text has UTF-8 bytes, so bytes bound the input; the schema is sent too (structured output), and
 * the fixed overhead covers the message framing. Output (reasoning included) is bounded by maxTokens.
 */
export function reserveMicros(texts: string[], maxTokens: number, prices: Prices): number {
  const bytes = texts.reduce((n, t) => n + new TextEncoder().encode(t).length, 0);
  return Math.ceil((bytes + 64) * prices.input + maxTokens * prices.output);
}

/** What a finished call was billed, in micro-USD. */
export function costMicros(usage: { input: number; output: number }, prices: Prices): number {
  return Math.ceil(usage.input * prices.input + usage.output * prices.output);
}

/** One global object holding the daily admission tallies, the admitted inquiries, and each device's first day. */
export class QuotaCounter extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    // v1 counted calls per day; those tallies mean nothing under per-inquiry counting.
    sql.exec("DROP TABLE IF EXISTS counters");
    sql.exec("CREATE TABLE IF NOT EXISTS admissions (day INTEGER NOT NULL, scope TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, scope, key))");
    sql.exec("CREATE TABLE IF NOT EXISTS inquiries (key TEXT PRIMARY KEY, day INTEGER NOT NULL, used INTEGER NOT NULL)");
    // micro-USD per day: settled cost of finished calls plus reservations of calls still in flight
    sql.exec("CREATE TABLE IF NOT EXISTS spend (day INTEGER PRIMARY KEY, micros INTEGER NOT NULL)");
    sql.exec("CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, first_day INTEGER NOT NULL, last_day INTEGER NOT NULL)");
    // Donations extend the free tier. `credited` is every donation's net amount, `drawn` what days up
    // to `folded_day` spent beyond the base budget; the difference is on top of today's budget.
    // Kept apart from `spend`, which is pruned after two days, so the pool is never forgotten.
    sql.exec("CREATE TABLE IF NOT EXISTS pool (id INTEGER PRIMARY KEY CHECK (id = 1), credited INTEGER NOT NULL, drawn INTEGER NOT NULL, folded_day INTEGER NOT NULL)");
    // Only the payment service's own id, so a retried webhook is not credited twice. No name, message or address.
    // `no` numbers donations in the order they arrived and never changes, so one can be referred to without saying who gave it.
    sql.exec("CREATE TABLE IF NOT EXISTS donations (id TEXT PRIMARY KEY, no INTEGER NOT NULL UNIQUE, micros INTEGER NOT NULL, at INTEGER NOT NULL)");
  }

  /**
   * Donated money not yet spent, in micro-USD, as of the start of `day`. Closes the books on every
   * earlier day first: whatever a day spent past the base budget came out of the pool. A call that
   * settles after midnight lowers a day already closed, so the pool can come out a little short, never over.
   */
  private pooled(day: number, limits: Limits): number {
    const sql = this.ctx.storage.sql;
    const row = sql.exec("SELECT credited, drawn, folded_day FROM pool WHERE id = 1").toArray()[0] as { credited: number; drawn: number; folded_day: number } | undefined;
    if (!row) return 0;
    if (row.folded_day < day - 1) {
      const over = sql.exec("SELECT COALESCE(SUM(MAX(micros - ?, 0)), 0) AS over FROM spend WHERE day > ? AND day < ?", limits.budget, row.folded_day, day).toArray()[0] as { over: number };
      row.drawn = Math.min(row.drawn + over.over, row.credited);
      sql.exec("UPDATE pool SET drawn = ?, folded_day = ? WHERE id = 1", row.drawn, day - 1);
    }
    return row.credited - row.drawn;
  }

  /** Today's limits with the pool added: the money on top of both budgets, and the inquiries it pays for on top of the global count. */
  private extended(day: number, limits: Limits): { limits: Limits; pooledMicros: number } {
    const pooled = this.pooled(day, limits);
    if (!pooled || !(limits.budget > 0)) return { limits, pooledMicros: pooled };
    // The global count is sized to the base budget, so it grows in the same proportion.
    const extra = Math.floor((pooled * limits.global) / limits.budget);
    return { limits: { ...limits, budget: limits.budget + pooled, admitBudget: limits.admitBudget + pooled, global: limits.global + extra }, pooledMicros: pooled };
  }

  /** Add a donation to the pool once, however many times its webhook is delivered. Returns whether it was new. */
  async credit(id: string, micros: number, day: number): Promise<boolean> {
    const sql = this.ctx.storage.sql;
    if (sql.exec("SELECT 1 FROM donations WHERE id = ?", id).toArray().length) return false;
    sql.exec("INSERT INTO donations (id, no, micros, at) VALUES (?, (SELECT COALESCE(MAX(no), 0) + 1 FROM donations), ?, ?)", id, micros, Date.now());
    // A new pool starts closed through yesterday, so days before any donation never draw on it.
    sql.exec("INSERT INTO pool (id, credited, drawn, folded_day) VALUES (1, ?, 0, ?) ON CONFLICT (id) DO UPDATE SET credited = credited + excluded.credited", micros, day - 1);
    return true;
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

  private spent(day: number): number {
    const row = this.ctx.storage.sql.exec("SELECT micros FROM spend WHERE day = ?", day).toArray()[0] as { micros: number } | undefined;
    return row?.micros ?? 0;
  }

  async status(day: number, device: string, ip: string, limits: Limits): Promise<Status> {
    return this.statusNow(day, device, ip, this.extended(day, limits).limits);
  }

  /** Whether today's budget still lets new inquiries start, and still lets calls through at all. */
  async budgetStatus(day: number, base: Limits): Promise<{ admitting: boolean; open: boolean }> {
    const { limits } = this.extended(day, base);
    const spent = this.spent(day);
    return { admitting: spent < limits.admitBudget, open: spent < limits.budget };
  }

  /** Everything /quota reports, read in one go: the tallies and budget with donations folded into the limits they raise. */
  async quota(day: number, device: string, ip: string, base: Limits): Promise<{ status: Status; budget: { admitting: boolean; open: boolean }; limits: Limits; pooledMicros: number; donors: Donors }> {
    const { limits, pooledMicros } = this.extended(day, base);
    return { status: this.statusNow(day, device, ip, limits), budget: await this.budgetStatus(day, base), limits, pooledMicros, donors: this.donors() };
  }

  /**
   * The public record of donations: how many, how much in all, and the latest few by number and time.
   * Never a single donation's amount — the list names nobody, but an amount next to a number would
   * still rank the people behind them.
   */
  private donors(): Donors {
    const sql = this.ctx.storage.sql;
    const all = sql.exec("SELECT COUNT(*) AS count, COALESCE(SUM(micros), 0) AS micros FROM donations").toArray()[0] as { count: number; micros: number };
    const recent = sql.exec("SELECT no, at FROM donations ORDER BY no DESC LIMIT ?", RECENT_DONORS).toArray() as { no: number; at: number }[];
    return { count: all.count, micros: all.micros, recent };
  }

  /**
   * Charge one AI call to an inquiry, admitting it first when it is new (or expired).
   * The call's worst-case cost (`reserve`, micro-USD) is added to today's spend; settle() replaces it
   * with the billed cost. Runs without awaiting, so parallel calls cannot overdraw the budget or
   * both admit the same inquiry.
   */
  async charge(day: number, device: string, ip: string, inquiryKey: string, base: Limits, reserve: number): Promise<Charge> {
    const sql = this.ctx.storage.sql;
    const { limits } = this.extended(day, base);
    let row = sql.exec("SELECT day, used FROM inquiries WHERE key = ?", inquiryKey).toArray()[0] as { day: number; used: number } | undefined;
    if (row && day - row.day >= limits.ttlDays) row = undefined;
    const spent = this.spent(day);
    if (!row) {
      const s = this.statusNow(day, device, ip, limits);
      for (const scope of ["device", "ip", "global"] as const) {
        if (s[scope].used >= s[scope].limit) return { ok: false, scope };
      }
      // To the learner this is the same as the global count running out: no new inquiries today.
      if (spent >= limits.admitBudget) return { ok: false, scope: "global" };
    }
    // Checked before anything is written, so a refused call neither admits the inquiry nor uses up a call.
    if (row && row.used >= limits.perInquiry) return { ok: false, scope: "inquiry" };
    if (spent + reserve > limits.budget) return { ok: false, scope: "budget" };
    if (!row) {
      for (const [scope, key] of [["device", device], ["ip", ip], ["global", "*"]] as const) {
        sql.exec("INSERT INTO admissions (day, scope, key, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, scope, key) DO UPDATE SET n = n + 1", day, scope, key);
      }
      sql.exec("INSERT INTO inquiries (key, day, used) VALUES (?, ?, 0) ON CONFLICT (key) DO UPDATE SET day = excluded.day, used = 0", inquiryKey, day);
      row = { day, used: 0 };
    }
    sql.exec("UPDATE inquiries SET used = used + 1 WHERE key = ?", inquiryKey);
    sql.exec("INSERT INTO spend (day, micros) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET micros = micros + excluded.micros", day, reserve);
    sql.exec("INSERT INTO devices (id, first_day, last_day) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET last_day = excluded.last_day", device, day, day);
    // Forget old tallies; a device idle for 30 days counts as new again.
    sql.exec("DELETE FROM admissions WHERE day < ?", day - 2);
    sql.exec("DELETE FROM spend WHERE day < ?", day - 2);
    sql.exec("DELETE FROM inquiries WHERE day <= ?", day - limits.ttlDays);
    sql.exec("DELETE FROM devices WHERE last_day < ?", day - 30);
    return { ok: true, remaining: limits.perInquiry - row.used - 1 };
  }

  /** Replace a call's reservation with what it was billed (the day is the one it was charged to). */
  async settle(day: number, reserve: number, cost: number) {
    this.ctx.storage.sql.exec("UPDATE spend SET micros = MAX(micros - ? + ?, 0) WHERE day = ?", reserve, cost, day);
  }

  /** Give a call back when the provider refused it, so errors eat neither the inquiry's calls nor the day's money. */
  async refund(inquiryKey: string, day: number, reserve: number) {
    this.ctx.storage.sql.exec("UPDATE inquiries SET used = MAX(used - 1, 0) WHERE key = ?", inquiryKey);
    await this.settle(day, reserve, 0);
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

/** How many donations /quota lists by number; the rest are only in the count and the total. */
const RECENT_DONORS = 10;

export type Donors = { count: number; micros: number; recent: { no: number; at: number }[] };

/** A payment reported by a webhook, or null for an event that is not money coming in (a ping, a shop order, a cancellation). */
export type Donation = { id: string; amount: number; currency: string } | null;

/**
 * Ko-fi posts form data whose `data` field is JSON carrying the token shown on the account's webhook
 * page. Donations and subscription payments count; shop orders and commissions are sales, not gifts.
 */
async function kofiDonation(request: Request, token: string): Promise<Donation | "forbidden"> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(String((await request.formData()).get("data") ?? ""));
  } catch {
    return "forbidden";
  }
  if (typeof data.verification_token !== "string" || !(await sameSecret(data.verification_token, token))) return "forbidden";
  if (data.type !== "Donation" && data.type !== "Subscription") return null;
  if (typeof data.kofi_transaction_id !== "string" || !data.kofi_transaction_id) return null;
  return { id: `kofi:${data.kofi_transaction_id}`, amount: Number(data.amount), currency: String(data.currency ?? "").toUpperCase() };
}

/**
 * GitHub signs the raw body with the webhook secret (X-Hub-Signature-256). Only a new sponsorship is
 * credited, one-time or the first month of a monthly one: GitHub sends no event for later monthly charges.
 */
async function githubDonation(request: Request, secret: string): Promise<Donation | "forbidden"> {
  const raw = await request.text();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const expected = `sha256=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (!(await sameSecret(request.headers.get("x-hub-signature-256") ?? "", expected))) return "forbidden";
  if (request.headers.get("x-github-event") !== "sponsorship") return null;
  let body: { action?: unknown; sponsorship?: { node_id?: unknown; tier?: { monthly_price_in_cents?: unknown } } };
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  const cents = Number(body.sponsorship?.tier?.monthly_price_in_cents);
  const id = body.sponsorship?.node_id ?? request.headers.get("x-github-delivery");
  if (body.action !== "created" || !(cents > 0) || typeof id !== "string") return null;
  return { id: `github:${id}`, amount: cents / 100, currency: "USD" };
}

/** Compare secrets in constant time by comparing their digests, which are always the same length. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  return crypto.subtle.timingSafeEqual(x, y);
}

/**
 * Turn a verified donation into free-tier money. Every answer is 200 once the sender is verified, even
 * when nothing is credited (an unknown currency, a ping): the services retry anything else, and a
 * retry would not change the outcome.
 */
async function creditDonation(env: Env, counter: DurableObjectStub<QuotaCounter>, day: number, donation: Donation): Promise<{ ok: true; creditedUsd: number }> {
  if (!donation || !(donation.amount > 0)) return { ok: true, creditedUsd: 0 };
  const rate = usdRates(env.DONATION_USD_RATES)[donation.currency];
  const share = Number(env.DONATION_SHARE);
  if (!(rate > 0) || !(share > 0 && share <= 1)) {
    console.warn(`donation ${donation.id} not credited: no rate for ${donation.currency} or DONATION_SHARE unset`);
    return { ok: true, creditedUsd: 0 };
  }
  const micros = Math.floor(donation.amount * rate * share * 1e6);
  const fresh = await counter.credit(donation.id, micros, day);
  return { ok: true, creditedUsd: fresh ? micros / 1e6 : 0 };
}

/** "USD=1,JPY=0.0067" → { USD: 1, JPY: 0.0067 } */
export function usdRates(spec: string): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const part of (spec ?? "").split(",")) {
    const [code, rate] = part.split("=").map((x) => x.trim());
    if (code && Number(rate) > 0) rates[code.toUpperCase()] = Number(rate);
  }
  return rates;
}

/** "2026-09-16" for a timestamp, in the time zone the daily reset follows. */
function localDate(at: number, env: Env): string {
  return new Date(at + Number(env.RESET_TZ_OFFSET_HOURS || 0) * 3600_000).toISOString().slice(0, 10);
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
      budget: Math.floor(Number(env.DAILY_BUDGET_USD) * 1e6),
      admitBudget: Math.floor(Number(env.ADMIT_BUDGET_USD) * 1e6),
    };
    const prices: Prices = { input: Number(env.PRICE_INPUT_PER_M), output: Number(env.PRICE_OUTPUT_PER_M) };
    const counter = env.QUOTA.get(env.QUOTA.idFromName("global"));

    if (url.pathname === "/quota" && request.method === "GET") {
      const { status, budget, limits: today, pooledMicros, donors } = await counter.quota(day, device, ip, limits);
      return json(
        {
          ...status,
          budget,
          // dailyBudgetUsd includes what donations add today; donatedUsd is that part, so the app can say where it came from.
          rules: { device: limits.device, deviceFirstDay: limits.deviceFirstDay, perInquiry: limits.perInquiry, ttlDays: limits.ttlDays, dailyBudgetUsd: today.budget / 1e6, donatedUsd: pooledMicros / 1e6 },
          // Here rather than on a route of its own: the support page already re-reads /quota the moment a
          // donation may have landed, so the giver sees their number appear together with the wider free tier.
          // Dates only, in the reset time zone: a minute-exact time could be matched against the payment services' own public feeds.
          donations: { count: donors.count, totalUsd: donors.micros / 1e6, recent: donors.recent.map((d) => ({ no: d.no, date: localDate(d.at, env) })) },
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

      // A missing or mistyped price would make every call look free, so refuse rather than spend blind.
      if (!(prices.input > 0 && prices.output > 0 && limits.budget > 0)) return json({ error: "budget not configured" }, 503, cors);

      const inquiryKey = `${device}:${inquiry}`;
      const reserve = reserveMicros([system, user, JSON.stringify(schema)], maxTokens, prices);
      const charged = await counter.charge(day, device, ip, inquiryKey, limits, reserve);
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
        // Without usage the bill is unknown, so the reservation stands as the cost.
        await counter.settle(day, reserve, r.usage ? costMicros(r.usage, prices) : reserve);
        return json({ text: r.text, model: r.model }, 200, { ...cors, "x-quota-inquiry-remaining": String(charged.remaining) });
      } catch (e) {
        // A provider's error status means nothing was billed. Anything else (a dropped connection, an
        // unreadable body) may have been, so that call keeps its reservation but not the learner's call.
        if (e instanceof ProviderError && e.status !== 200) await counter.refund(inquiryKey, day, reserve);
        else await counter.refund(inquiryKey, day, 0);
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

    if (url.pathname === "/donation/kofi" && request.method === "POST") {
      if (!env.KOFI_VERIFICATION_TOKEN) return json({ error: "donations not configured" }, 503, cors);
      const donation = await kofiDonation(request, env.KOFI_VERIFICATION_TOKEN);
      if (donation === "forbidden") return json({ error: "forbidden" }, 403, cors);
      return json(await creditDonation(env, counter, day, donation), 200, cors);
    }

    if (url.pathname === "/donation/github" && request.method === "POST") {
      if (!env.SPONSORS_WEBHOOK_SECRET) return json({ error: "donations not configured" }, 503, cors);
      const donation = await githubDonation(request, env.SPONSORS_WEBHOOK_SECRET);
      if (donation === "forbidden") return json({ error: "forbidden" }, 403, cors);
      return json(await creditDonation(env, counter, day, donation), 200, cors);
    }

    return json({ error: "not found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
