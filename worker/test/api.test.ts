import { SELF, env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_SIGNATURE } from "../../src/lib/llm/providers";
import worker, { reserveMicros, type Env, type QuotaCounter } from "../src/index";

/**
 * End-to-end through the Worker's fetch handler. The main worker shares this isolate, so
 * stubbing `fetch` intercepts everything it sends upstream: no request leaves the test.
 */

const ORIGIN = "https://yanasehiroki.github.io";
const system = `${SYSTEM_SIGNATURE} English through abductive reasoning.`;

interface Upstream {
  calls: { url: string; headers: Record<string, string>; body: Record<string, any> }[];
  reply: (url: string) => { status: number; body: unknown };
}

let upstream: Upstream;
/** A fresh device and IP per test: the worker keeps one counter, so tests must not share its tallies. */
let device = 0;

const okOpenAi = (content = "{}") => ({ status: 200, body: { model: env.MODEL, choices: [{ message: { content } }] } });
const okResend = () => ({ status: 200, body: { id: "mail-1" } });

beforeEach(() => {
  device++;
  upstream = {
    calls: [],
    reply: (url) => (url.includes("openai") ? okOpenAi() : okResend()),
  };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "object" && "url" in input ? input.url : input);
    let body: Record<string, any> = {};
    try {
      body = JSON.parse(String(init?.body ?? "{}"));
    } catch {
      /* not JSON */
    }
    const headers: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit).forEach((v, k) => (headers[k] = v));
    upstream.calls.push({ url, headers, body });
    const { status, body: out } = upstream.reply(url);
    return new Response(JSON.stringify(out), { status, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const headers = (over: Record<string, string> = {}) => ({
  "content-type": "application/json",
  "x-device-id": `device-${device}`,
  "cf-connecting-ip": `10.0.0.${device}`,
  "x-inquiry-id": "inquiry-1",
  ...over,
});

const generate = (body: Record<string, unknown> = {}, init: { headers?: Record<string, string> } = {}) =>
  SELF.fetch("https://proxy.test/generate", {
    method: "POST",
    headers: headers(init.headers),
    body: JSON.stringify({ system, user: "Target: listen", schema: { type: "object" }, effort: "low", maxTokens: 1000, ...body }),
  });

function callTo(host: string) {
  const call = upstream.calls.find((c) => c.url.includes(host));
  if (!call) throw new Error(`nothing was sent to ${host} (sent: ${upstream.calls.map((c) => c.url).join(", ") || "nothing"})`);
  return call;
}
const sentTo = (host: string) => callTo(host).body;

/** Today's spend on the worker's own counter, in micro-USD; `set` overwrites it (tests put it back afterwards). */
const today = () => Math.floor((Date.now() + Number(env.RESET_TZ_OFFSET_HOURS) * 3600_000) / 86_400_000);
const globalCounter = () => env.QUOTA.get(env.QUOTA.idFromName("global"));
const spent = () =>
  runInDurableObject(globalCounter(), (_o: QuotaCounter, state) => (state.storage.sql.exec("SELECT micros FROM spend WHERE day = ?", today()).toArray()[0]?.micros as number | undefined) ?? 0);
const setSpent = (micros: number) =>
  runInDurableObject(globalCounter(), (_o: QuotaCounter, state) => {
    state.storage.sql.exec("INSERT INTO spend (day, micros) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET micros = excluded.micros", today(), micros);
  });
const prices = () => ({ input: Number(env.PRICE_INPUT_PER_M), output: Number(env.PRICE_OUTPUT_PER_M) });

describe("CORS and origins", () => {
  it("answers a preflight with the allowed origin and the headers the app sends", async () => {
    const res = await SELF.fetch("https://proxy.test/generate", { method: "OPTIONS", headers: { origin: ORIGIN } });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("access-control-allow-headers")).toContain("x-device-id");
    expect(res.headers.get("access-control-allow-headers")).toContain("x-inquiry-id");
    expect(res.headers.get("vary")).toBe("origin");
  });

  it("turns away a site that is not the app", async () => {
    const res = await SELF.fetch("https://proxy.test/quota", { headers: { origin: "https://evil.example" } });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "origin not allowed" });
  });

  it("serves a request with no origin at all, which is how some browsers send the page's own fetch", async () => {
    expect((await SELF.fetch("https://proxy.test/quota")).status).toBe(200);
  });
});

describe("GET /quota", () => {
  it("reports today's counts, the rules behind them, the model and the reset time", async () => {
    const res = await SELF.fetch("https://proxy.test/quota", { headers: { "x-device-id": "quota-device" } });
    const body = (await res.json()) as Record<string, any>;

    expect(res.status).toBe(200);
    expect(body.device).toEqual({ used: 0, limit: Number(env.LIMIT_DEVICE_FIRST_DAY) });
    expect(body.ip).toEqual({ used: 0, limit: Number(env.LIMIT_IP) });
    expect(body.global.limit).toBe(Number(env.LIMIT_GLOBAL));
    expect(body.rules).toEqual({
      device: Number(env.LIMIT_DEVICE),
      deviceFirstDay: Number(env.LIMIT_DEVICE_FIRST_DAY),
      perInquiry: Number(env.CALLS_PER_INQUIRY),
      ttlDays: Number(env.INQUIRY_TTL_DAYS),
      dailyBudgetUsd: Number(env.DAILY_BUDGET_USD),
      donatedUsd: 0,
    });
    expect(body.model).toBe(env.MODEL);
    expect(body.budget).toEqual({ admitting: true, open: true });
    expect(body.resetAt).toBeGreaterThan(Date.now());
  });

  it("resets at midnight in the configured time zone", async () => {
    const body = (await (await SELF.fetch("https://proxy.test/quota")).json()) as { resetAt: number };
    const offset = Number(env.RESET_TZ_OFFSET_HOURS) * 3600_000;
    expect((body.resetAt + offset) % 86_400_000).toBe(0);
  });

  it("counts an inquiry the moment it is admitted", async () => {
    await generate();
    const body = (await (await SELF.fetch("https://proxy.test/quota", { headers: { "x-device-id": `device-${device}` } })).json()) as Record<string, any>;
    expect(body.device.used).toBe(1);
  });
});

describe("POST /generate", () => {
  it("passes the prompt to the provider with the fixed model and returns its answer", async () => {
    upstream.reply = () => okOpenAi('{"sentences":[]}');

    const res = await generate();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: '{"sentences":[]}', model: env.MODEL });
    const sent = sentTo("openai");
    expect(sent.model).toBe(env.MODEL);
    expect(sent.messages[1].content).toBe("Target: listen");
  });

  it("authenticates with the owner's key, never with one from the request", async () => {
    await generate({ apiKey: "sk-caller-supplied" });

    // the key travels in the header, so that is where a leak would show
    const call = callTo("openai");
    expect(call.headers.authorization).toBe("Bearer test-key");
    expect(JSON.stringify(call)).not.toContain("sk-caller-supplied");
  });

  it("tells the app how many calls the inquiry has left", async () => {
    const res = await generate();
    expect(res.headers.get("x-quota-inquiry-remaining")).toBe(String(Number(env.CALLS_PER_INQUIRY) - 1));
  });

  it("caps the tokens and the effort a caller may ask for", async () => {
    await generate({ maxTokens: 999999, effort: "nonsense" });

    const sent = sentTo("openai");
    expect(sent.max_completion_tokens).toBe(Number(env.MAX_TOKENS_CAP));
    expect(sent.reasoning_effort).toBe("low");
  });

  it("refuses a prompt that is not the app's, so the key cannot be used as a general relay", async () => {
    const res = await generate({ system: "You are a helpful assistant." });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "unsupported prompt" });
    expect(upstream.calls).toHaveLength(0);
  });

  it("refuses a request with no inquiry to charge, a body that is not JSON, no schema, or too much text", async () => {
    expect((await generate({}, { headers: { "x-inquiry-id": "" } })).status).toBe(400);
    expect((await SELF.fetch("https://proxy.test/generate", { method: "POST", headers: headers(), body: "not json" })).status).toBe(400);
    expect((await generate({ schema: undefined })).status).toBe(400);
    expect((await generate({ user: "x".repeat(Number(env.MAX_USER_CHARS) + 1) })).status).toBe(400);
    expect(upstream.calls).toHaveLength(0);
  });

  it("reports the provider's failure without exposing the key, and does not charge the inquiry for it", async () => {
    upstream.reply = () => ({ status: 500, body: { error: { message: "upstream exploded" } } });

    const failed = await generate();

    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain("test-key");

    upstream.reply = () => okOpenAi();
    const next = await generate();
    expect(next.headers.get("x-quota-inquiry-remaining")).toBe(String(Number(env.CALLS_PER_INQUIRY) - 1));
  });

  it("answers 429 with the scope and the reset time once the device's inquiries for today are gone", async () => {
    const d = { "x-device-id": `busy-${device}` };
    for (let i = 0; i < Number(env.LIMIT_DEVICE_FIRST_DAY); i++) {
      expect((await generate({}, { headers: { ...d, "x-inquiry-id": `inq-${i}` } })).status).toBe(200);
    }

    const res = await generate({}, { headers: { ...d, "x-inquiry-id": "one-too-many" } });

    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; scope: string; resetAt: number };
    expect(body).toMatchObject({ error: "quota", scope: "device" });
    expect(body.resetAt).toBeGreaterThan(0);
  });

  it("lets an inquiry that is already under way keep going after the day's admissions are gone", async () => {
    const d = { "x-device-id": `busy-again-${device}` };
    await generate({}, { headers: { ...d, "x-inquiry-id": "mine" } });
    for (let i = 1; i < Number(env.LIMIT_DEVICE_FIRST_DAY); i++) {
      await generate({}, { headers: { ...d, "x-inquiry-id": `other-${i}` } });
    }
    expect((await generate({}, { headers: { ...d, "x-inquiry-id": "new-one" } })).status).toBe(429);

    expect((await generate({}, { headers: { ...d, "x-inquiry-id": "mine" } })).status).toBe(200);
  });

  it("does not answer GET", async () => {
    expect((await SELF.fetch("https://proxy.test/generate")).status).toBe(404);
  });
});

describe("the daily budget on /generate", () => {
  const budget = () => Math.floor(Number(env.DAILY_BUDGET_USD) * 1e6);
  let before = 0;
  beforeEach(async () => {
    before = await spent();
  });
  afterEach(async () => {
    await setSpent(before);
  });

  it("charges the day what the provider billed, from the usage it reports", async () => {
    upstream.reply = () => ({ status: 200, body: { model: env.MODEL, choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1000, completion_tokens: 2000 } } });

    expect((await generate()).status).toBe(200);

    // 1,000 × $0.2/M + 2,000 × $1.2/M = $0.0026, the benchmark's cost of one example set
    expect((await spent()) - before).toBe(Math.ceil(1000 * prices().input + 2000 * prices().output));
  });

  it("keeps the whole reservation when the provider reports no usage, since the bill is then unknown", async () => {
    await generate();
    const reserve = reserveMicros([`${SYSTEM_SIGNATURE} English through abductive reasoning.`, "Target: listen", JSON.stringify({ type: "object" })], 1000, prices());
    expect((await spent()) - before).toBe(reserve);
  });

  it("charges nothing for a call the provider turned away", async () => {
    upstream.reply = () => ({ status: 429, body: { error: { message: "rate limited" } } });
    expect((await generate()).status).toBe(502);
    expect(await spent()).toBe(before);
  });

  it("sends nothing upstream once the day's money is gone, even for an inquiry under way", async () => {
    const d = { "x-device-id": `spender-${device}`, "x-inquiry-id": "mine" };
    expect((await generate({}, { headers: d })).status).toBe(200);
    upstream.calls = [];
    await setSpent(budget() - 1);

    const res = await generate({}, { headers: d });

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "quota", scope: "budget" });
    expect(upstream.calls).toHaveLength(0);
    const quota = (await (await SELF.fetch("https://proxy.test/quota")).json()) as Record<string, any>;
    expect(quota.budget).toEqual({ admitting: false, open: true });
  });

  it("refuses a call whose own worst case does not fit, while a smaller one still goes through", async () => {
    const d = { "x-device-id": `spender-${device}`, "x-inquiry-id": "mine" };
    expect((await generate({}, { headers: d })).status).toBe(200);
    await setSpent(budget() - reserveMicros([system, "Target: listen", "{}"], 1000, prices()) - 100);

    const big = await generate({ maxTokens: 4000 }, { headers: d });
    expect(big.status).toBe(429);
    expect(await big.json()).toMatchObject({ scope: "budget" });
    expect((await generate({ maxTokens: 1000, schema: {} }, { headers: d })).status).toBe(200);
  });

  it("refuses to spend at all when the prices are not configured", async () => {
    const request = new Request("https://proxy.test/generate", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ system, user: "Target: listen", schema: { type: "object" } }),
    });
    const res = await worker.fetch(request, { ...(env as unknown as Env), PRICE_INPUT_PER_M: "" });

    expect(res.status).toBe(503);
    expect(upstream.calls).toHaveLength(0);
  });
});

describe("POST /feedback", () => {
  const send = (body: Record<string, unknown> = {}, ip = "") =>
    SELF.fetch("https://proxy.test/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip || `10.0.0.${device}` },
      body: JSON.stringify({ kind: "bug", message: "うまく動きません", email: "", website: "", context: {}, ...body }),
    });

  it("mails the owner, with the sender's address as reply-to", async () => {
    const res = await send({ email: "learner@example.com", context: { page: "/inquiry" } });

    expect(res.status).toBe(200);
    expect(callTo("resend").headers.authorization).toBe("Bearer test-resend-key");
    const mail = sentTo("resend");
    expect(mail.to).toBe("owner@example.com");
    expect(mail.reply_to).toBe("learner@example.com");
    expect(mail.subject).toContain("不具合");
    expect(mail.text).toContain("うまく動きません");
    expect(mail.text).toContain("page: /inquiry");
  });

  it("leaves out reply-to when no address was given, and says so in the mail", async () => {
    await send({ email: "" });

    const mail = sentTo("resend");
    expect(mail.reply_to).toBeUndefined();
    expect(mail.text).toContain("（未記入）");
  });

  it("accepts a bot's honeypot silently, without mailing anything", async () => {
    const res = await send({ website: "http://spam.example" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upstream.calls).toHaveLength(0);
  });

  it("refuses an empty message, an over-long one, and an address that is not one", async () => {
    expect((await send({ message: "   " })).status).toBe(400);
    expect((await send({ message: "x".repeat(Number(env.FEEDBACK_MAX_CHARS) + 1) })).status).toBe(400);
    expect((await send({ email: "not-an-address" })).status).toBe(400);
    expect(upstream.calls).toHaveLength(0);
  });

  it("carries the support kind, so an offer to help is not filed as a bug report", async () => {
    await send({ kind: "support", message: "継続で支援したいのですが" });

    const mail = sentTo("resend");
    expect(mail.subject).toContain("支援");
    expect(mail.text).toContain("継続で支援したいのですが");
  });

  it("does not let an inherited property name become the kind", async () => {
    await send({ kind: "toString" });

    const mail = sentTo("resend");
    expect(mail.subject).toContain("その他");
    expect(mail.subject).not.toContain("function");
  });

  it("keeps the context to strings, and cuts an over-long one", async () => {
    await send({ context: { page: "x".repeat(500), nested: { a: 1 }, count: 3 } });

    const text = sentTo("resend").text as string;
    expect(text).toContain("count: 3");
    expect(text).not.toContain("nested");
    expect(text).toContain("x".repeat(300));
    expect(text).not.toContain("x".repeat(301));
  });

  it("reports a mail that could not be sent, and does not spend the sender's allowance on it", async () => {
    upstream.reply = () => ({ status: 422, body: { message: "domain not verified" } });
    expect((await send({}, "5.5.5.5")).status).toBe(502);

    upstream.reply = () => okResend();
    expect((await send({}, "5.5.5.5")).status).toBe(200);
  });

  it("stops a sender who has written too many times today", async () => {
    const ip = "6.6.6.6";
    for (let i = 0; i < Number(env.FEEDBACK_LIMIT_IP); i++) {
      expect((await send({ message: `${i}` }, ip)).status).toBe(200);
    }

    const res = await send({ message: "one too many" }, ip);

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: "quota" });
  });
});

describe("donations extend the free tier", () => {
  const budget = () => Math.floor(Number(env.DAILY_BUDGET_USD) * 1e6);
  const share = () => Number(env.DONATION_SHARE);
  let before = 0;
  beforeEach(async () => {
    before = await spent();
  });
  afterEach(async () => {
    await setSpent(before);
    // The counter is shared by every test, so a donation left in the pool would lift everyone's limits.
    await runInDurableObject(globalCounter(), (_o: QuotaCounter, state) => {
      state.storage.sql.exec("DELETE FROM pool");
      state.storage.sql.exec("DELETE FROM donations");
    });
  });

  const kofi = (data: Record<string, unknown>) => {
    const form = new FormData();
    form.set("data", JSON.stringify({ verification_token: "test-kofi-token", type: "Donation", kofi_transaction_id: `tx-${device}`, amount: "5.00", currency: "USD", from_name: "Someone", message: "がんばって", ...data }));
    return SELF.fetch("https://proxy.test/donation/kofi", { method: "POST", body: form });
  };
  async function github(body: Record<string, unknown>, opts: { event?: string; secret?: string } = {}) {
    const raw = JSON.stringify(body);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(opts.secret ?? "test-github-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
    const signature = `sha256=${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    return SELF.fetch("https://proxy.test/donation/github", {
      method: "POST",
      headers: { "content-type": "application/json", "x-github-event": opts.event ?? "sponsorship", "x-github-delivery": `delivery-${device}`, "x-hub-signature-256": signature },
      body: raw,
    });
  }
  const quota = async (d = `donation-${device}`) => (await (await SELF.fetch("https://proxy.test/quota", { headers: { "x-device-id": d } })).json()) as Record<string, any>;

  it("lets new inquiries start again right after a donation arrives on a day whose money was gone", async () => {
    await setSpent(budget());
    expect((await quota()).budget).toEqual({ admitting: false, open: false });
    expect((await generate()).status).toBe(429);

    const res = await kofi({});

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, creditedUsd: 5 * share() });
    const q = await quota();
    expect(q.budget).toEqual({ admitting: true, open: true });
    expect(q.rules.dailyBudgetUsd).toBeCloseTo(Number(env.DAILY_BUDGET_USD) + 5 * share());
    expect(q.rules.donatedUsd).toBeCloseTo(5 * share());
    expect((await generate()).status).toBe(200);
  });

  it("raises the global count in proportion, since that backstop is sized to the base budget", async () => {
    await kofi({ amount: "3" });
    const q = await quota();
    expect(q.global.limit).toBe(Number(env.LIMIT_GLOBAL) + Math.floor((3 * share() * 1e6 * Number(env.LIMIT_GLOBAL)) / budget()));
  });

  it("credits a payment once however many times the webhook is delivered", async () => {
    await kofi({});
    const again = await kofi({});
    expect(await again.json()).toEqual({ ok: true, creditedUsd: 0 });
    expect((await quota()).rules.donatedUsd).toBeCloseTo(5 * share());
  });

  it("numbers donations in the order they arrived, without keeping who gave them", async () => {
    await kofi({ kofi_transaction_id: "first" });
    await kofi({ kofi_transaction_id: "second", from_name: "Named Person", email: "someone@example.com" });
    const rows = await runInDurableObject(globalCounter(), (_o: QuotaCounter, state) => state.storage.sql.exec("SELECT * FROM donations ORDER BY no").toArray());
    expect(rows.map((r) => r.no)).toEqual([1, 2]);
    expect(JSON.stringify(rows)).not.toMatch(/Named Person|someone@example.com|がんばって/);
  });

  it("lists donations on /quota by number and date, with the total but no single amount", async () => {
    expect((await quota()).donations).toEqual({ count: 0, totalUsd: 0, recent: [] });
    await kofi({ kofi_transaction_id: "first", amount: "3" });
    await kofi({ kofi_transaction_id: "second", amount: "7", from_name: "Named Person" });

    const { donations } = await quota();
    expect(donations.count).toBe(2);
    expect(donations.totalUsd).toBeCloseTo(10 * share());
    expect(donations.recent.map((d: { no: number }) => d.no)).toEqual([2, 1]);
    expect(donations.recent[0]).toEqual({ no: 2, date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(JSON.stringify(donations)).not.toMatch(/Named Person|first|second/);
  });

  it("converts other currencies, and credits nothing in one it has no rate for", async () => {
    await kofi({ amount: "1000", currency: "JPY", kofi_transaction_id: "jpy" });
    expect((await quota()).rules.donatedUsd).toBeCloseTo(1000 * 0.0067 * share());
    expect(await (await kofi({ amount: "10", currency: "XYZ", kofi_transaction_id: "xyz" })).json()).toEqual({ ok: true, creditedUsd: 0 });
  });

  it("does not count shop orders, which are sales rather than gifts", async () => {
    expect(await (await kofi({ type: "Shop Order" })).json()).toEqual({ ok: true, creditedUsd: 0 });
  });

  it("refuses a Ko-fi call without the verification token, so nobody can mint free-tier money", async () => {
    expect((await kofi({ verification_token: "guess" })).status).toBe(403);
    expect((await SELF.fetch("https://proxy.test/donation/kofi", { method: "POST", body: "data=nonsense", headers: { "content-type": "application/x-www-form-urlencoded" } })).status).toBe(403);
    expect((await quota()).rules.donatedUsd).toBe(0);
  });

  it("credits a new GitHub sponsorship signed with the webhook secret, and nothing else", async () => {
    const sponsorship = { action: "created", sponsorship: { node_id: `S_${device}`, tier: { monthly_price_in_cents: 500, is_one_time: true } } };
    expect((await github(sponsorship, { secret: "wrong" })).status).toBe(403);
    expect(await (await github({ zen: "hi" }, { event: "ping" })).json()).toEqual({ ok: true, creditedUsd: 0 });
    expect(await (await github({ ...sponsorship, action: "cancelled" })).json()).toEqual({ ok: true, creditedUsd: 0 });

    expect(await (await github(sponsorship)).json()).toEqual({ ok: true, creditedUsd: 5 * share() });
  });

  it("keeps a donation for later days when today's base budget was enough, drawing only what a day spent beyond it", async () => {
    await kofi({ amount: "10" });
    const pooled = 10 * share() * 1e6;
    // Yesterday went $1 past the base budget; the day before that stayed within it.
    await runInDurableObject(globalCounter(), (_o: QuotaCounter, state) => {
      state.storage.sql.exec("UPDATE pool SET folded_day = ?", today() - 3);
      state.storage.sql.exec("INSERT INTO spend (day, micros) VALUES (?, ?), (?, ?) ON CONFLICT (day) DO UPDATE SET micros = excluded.micros", today() - 1, budget() + 1_000_000, today() - 2, 1_000);
    });

    expect((await quota()).rules.donatedUsd).toBeCloseTo((pooled - 1_000_000) / 1e6);
    // Closing a day happens once: asking again does not draw yesterday's overrun twice.
    expect((await quota()).rules.donatedUsd).toBeCloseTo((pooled - 1_000_000) / 1e6);
    await runInDurableObject(globalCounter(), (_o: QuotaCounter, state) => {
      state.storage.sql.exec("DELETE FROM spend WHERE day < ?", today());
    });
  });
});

describe("unknown routes", () => {
  it("answers 404 with CORS headers, so the app can read the error", async () => {
    const res = await SELF.fetch("https://proxy.test/nope", { headers: { origin: ORIGIN } });

    expect(res.status).toBe(404);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });
});
