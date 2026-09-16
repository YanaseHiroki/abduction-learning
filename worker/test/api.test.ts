import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_SIGNATURE } from "../../src/lib/llm/providers";

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
    });
    expect(body.model).toBe(env.MODEL);
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

describe("unknown routes", () => {
  it("answers 404 with CORS headers, so the app can read the error", async () => {
    const res = await SELF.fetch("https://proxy.test/nope", { headers: { origin: ORIGIN } });

    expect(res.status).toBe(404);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });
});
