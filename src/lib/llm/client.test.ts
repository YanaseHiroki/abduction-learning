import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import { callProvider, ProviderError } from "./providers";
import { describeError, fetchQuota, hasCredential, MissingApiKeyError, noNewInquiries, QuotaError, sendFeedback, setActiveInquiry, sharedFreeTierFull, structured, toJsonSchema } from "./client";
import { defaultSettings, setProviderSettings, setSettings } from "../settings";

vi.mock("./providers", async (orig) => {
  const actual = await orig<typeof import("./providers")>();
  return { ...actual, callProvider: vi.fn() };
});

// PROXY_URL is read from the environment at import time; the test env sets it in vitest.config.ts.
const PROXY = "https://proxy.test";
const Schema = z.object({ answer: z.string() });

const mockedCall = vi.mocked(callProvider);

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => handler(String(url), init));
  vi.stubGlobal("fetch", fn);
  return fn;
}

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  setSettings({ ...defaultSettings, deviceId: "device-1" });
  setActiveInquiry(null);
  mockedCall.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toJsonSchema", () => {
  it("drops $schema and inlines reused sub-schemas, which the strict modes need", () => {
    const Inner = z.object({ a: z.string() });
    const js = toJsonSchema(z.object({ one: Inner, two: Inner }));
    expect(js.$schema).toBeUndefined();
    expect(JSON.stringify(js)).not.toContain("$ref");
    expect(JSON.stringify(js)).not.toContain("$defs");
  });
});

describe("structured, with the learner's own key", () => {
  beforeEach(() => {
    setSettings({ provider: "openai" });
    setProviderSettings("openai", { apiKey: "sk-own", model: "gpt-5.6" });
  });

  it("calls the chosen provider with the chosen model and returns the parsed answer", async () => {
    mockedCall.mockResolvedValue({ text: '{"answer":"hi"}', model: "gpt-5.6", usage: { input: 1, output: 2 } });

    const r = await structured("sys", "user", Schema);

    expect(mockedCall).toHaveBeenCalledWith(expect.objectContaining({ provider: "openai", apiKey: "sk-own", model: "gpt-5.6", system: "sys", user: "user", browser: true }));
    expect(r.data).toEqual({ answer: "hi" });
    expect(r.model).toBe("gpt-5.6");
    expect(r.usage).toEqual({ input: 1, output: 2 });
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("uses the provider's cheap model for the QA pass", async () => {
    mockedCall.mockResolvedValue({ text: '{"answer":"x"}', model: "m" });
    await structured("sys", "user", Schema, { cheap: true });
    expect(mockedCall.mock.calls[0][0].model).toBe("gpt-5.6-luna");
  });

  it("falls back to the provider's default model when none was chosen", async () => {
    setProviderSettings("openai", { model: "" });
    mockedCall.mockResolvedValue({ text: '{"answer":"x"}', model: "m" });
    await structured("sys", "user", Schema);
    expect(mockedCall.mock.calls[0][0].model).toBe("gpt-5.6-luna");
  });

  it("defaults to low effort and passes an override through", async () => {
    mockedCall.mockResolvedValue({ text: '{"answer":"x"}', model: "m" });
    await structured("sys", "user", Schema);
    expect(mockedCall.mock.calls[0][0]).toMatchObject({ effort: "low", maxTokens: 8000 });
    await structured("sys", "user", Schema, { effort: "high", maxTokens: 100 });
    expect(mockedCall.mock.calls[1][0]).toMatchObject({ effort: "high", maxTokens: 100 });
  });

  it("refuses to call anything when the tab has no key", async () => {
    setProviderSettings("openai", { apiKey: "" });
    await expect(structured("sys", "user", Schema)).rejects.toBeInstanceOf(MissingApiKeyError);
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it("uses the override's provider, model and key instead of the settings", async () => {
    mockedCall.mockResolvedValue({ text: '{"answer":"x"}', model: "m" });
    await structured("sys", "user", Schema, { override: { provider: "gemini", model: "gemini-3.8-flash", apiKey: "k" } });
    expect(mockedCall.mock.calls[0][0]).toMatchObject({ provider: "gemini", model: "gemini-3.8-flash", apiKey: "k" });
  });

  it("reports an answer that is not JSON, or does not match the schema, as a parse failure", async () => {
    mockedCall.mockResolvedValue({ text: "not json", model: "m" });
    await expect(structured("sys", "user", Schema)).rejects.toThrow("parse-failed");

    mockedCall.mockResolvedValue({ text: '{"answer":42}', model: "m" });
    await expect(structured("sys", "user", Schema)).rejects.toThrow(/parse-failed: answer/);
  });
});

describe("structured, on the free tier", () => {
  beforeEach(() => {
    setSettings({ provider: "shared" });
  });

  it("posts to the proxy with the device and inquiry, and returns its answer", async () => {
    setActiveInquiry("inq-1");
    const fetchMock = mockFetch(() => jsonResponse({ text: '{"answer":"from proxy"}', model: "gpt-5.6-luna" }));

    const r = await structured("sys", "user", Schema);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${PROXY}/generate`);
    expect((init!.headers as Record<string, string>)["x-inquiry-id"]).toBe("inq-1");
    expect((init!.headers as Record<string, string>)["x-device-id"]).toBe("device-1");
    expect(JSON.parse(init!.body as string)).toMatchObject({ system: "sys", user: "user", effort: "low" });
    expect(r.data).toEqual({ answer: "from proxy" });
    expect(r.model).toBe("gpt-5.6-luna");
    expect(mockedCall).not.toHaveBeenCalled();
  });

  it("does not spend a call outside an inquiry, where the free tier has nothing to charge", async () => {
    const fetchMock = mockFetch(() => jsonResponse({}));
    await expect(structured("sys", "user", Schema)).rejects.toThrow(/inside an inquiry/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turns the proxy's 429 into a quota error carrying the scope and the reset time", async () => {
    setActiveInquiry("inq-1");
    mockFetch(() => jsonResponse({ error: "quota", scope: "device", resetAt: 1780000000000 }, 429));

    const err = await structured("sys", "user", Schema).catch((e) => e);

    expect(err).toBeInstanceOf(QuotaError);
    expect({ scope: err.scope, resetAt: err.resetAt }).toEqual({ scope: "device", resetAt: 1780000000000 });
  });

  it("reports the proxy's own error text for other failures", async () => {
    setActiveInquiry("inq-1");
    mockFetch(() => jsonResponse({ error: "openai 500: upstream" }, 502));
    await expect(structured("sys", "user", Schema)).rejects.toThrow("openai 500: upstream");
  });

  it("generates and keeps a device id when there is none yet", async () => {
    setSettings({ deviceId: "" });
    setActiveInquiry("inq-1");
    const fetchMock = mockFetch(() => jsonResponse({ text: '{"answer":"x"}', model: "m" }));

    await structured("sys", "user", Schema);
    const first = (fetchMock.mock.calls[0][1]!.headers as Record<string, string>)["x-device-id"];
    await structured("sys", "user", Schema);
    const second = (fetchMock.mock.calls[1][1]!.headers as Record<string, string>)["x-device-id"];

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toBe(first);
  });
});

describe("hasCredential", () => {
  it("is true on the free tier while a proxy is configured", () => {
    setSettings({ provider: "shared" });
    expect(hasCredential()).toBe(true);
  });

  it("follows the key of the tab that is open", () => {
    setSettings({ provider: "anthropic" });
    expect(hasCredential()).toBe(false);
    setProviderSettings("anthropic", { apiKey: "sk-ant" });
    expect(hasCredential()).toBe(true);
    setSettings({ provider: "gemini" });
    expect(hasCredential()).toBe(false);
  });
});

describe("noNewInquiries", () => {
  const room = { used: 0, limit: 5 };
  const quota = { device: room, ip: room, global: room, rules: { device: 3, deviceFirstDay: 5, perInquiry: 60, ttlDays: 3 }, model: "m", resetAt: 1 };

  it("is false while every count has room and the budget still admits", () => {
    expect(noNewInquiries(quota)).toBe(false);
    expect(noNewInquiries({ ...quota, budget: { admitting: true, open: true } })).toBe(false);
  });

  it("is true once any count is used up", () => {
    expect(noNewInquiries({ ...quota, global: { used: 5, limit: 5 } })).toBe(true);
  });

  it("is true once the day's money stops admissions, even with counts to spare", () => {
    expect(noNewInquiries({ ...quota, budget: { admitting: false, open: true } })).toBe(true);
  });
});

describe("sharedFreeTierFull", () => {
  const room = { used: 0, limit: 5 };
  const quota = { device: room, ip: room, global: room, budget: { admitting: true, open: true }, rules: { device: 3, deviceFirstDay: 5, perInquiry: 60, ttlDays: 3 }, model: "m", resetAt: 1 };

  it("is true when the global count or the day's money ran out, which a donation extends", () => {
    expect(sharedFreeTierFull({ ...quota, global: { used: 5, limit: 5 } })).toBe(true);
    expect(sharedFreeTierFull({ ...quota, budget: { admitting: false, open: true } })).toBe(true);
    expect(sharedFreeTierFull({ ...quota, budget: { admitting: false, open: false } })).toBe(true);
  });

  it("is false when only this device or IP is out, since no donation would give those back", () => {
    expect(sharedFreeTierFull(quota)).toBe(false);
    expect(sharedFreeTierFull({ ...quota, device: { used: 5, limit: 5 }, ip: { used: 5, limit: 5 } })).toBe(false);
  });
});

describe("fetchQuota", () => {
  it("returns what the proxy reports", async () => {
    const quota = { device: { used: 1, limit: 5 }, ip: { used: 1, limit: 10 }, global: { used: 3, limit: 50 }, rules: { device: 3, deviceFirstDay: 5, perInquiry: 60, ttlDays: 3 }, model: "gpt-5.6-luna", resetAt: 1 };
    const fetchMock = mockFetch(() => jsonResponse(quota));

    expect(await fetchQuota()).toEqual(quota);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${PROXY}/quota`);
  });

  it("returns nothing rather than throwing when the proxy is down or unhappy", async () => {
    mockFetch(() => jsonResponse({ error: "nope" }, 500));
    expect(await fetchQuota()).toBeNull();

    vi.unstubAllGlobals();
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await fetchQuota()).toBeNull();
  });
});

describe("sendFeedback", () => {
  const input = { kind: "bug" as const, message: "壊れています", email: "", website: "", context: { page: "home" } };

  it("posts the message and reports success", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ok: true }));
    expect(await sendFeedback(input)).toBe("ok");
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${PROXY}/feedback`);
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual(input);
  });

  it("distinguishes too-many-today from a real failure", async () => {
    mockFetch(() => jsonResponse({ error: "quota" }, 429));
    expect(await sendFeedback(input)).toBe("quota");

    vi.unstubAllGlobals();
    mockFetch(() => jsonResponse({ error: "boom" }, 502));
    expect(await sendFeedback(input)).toBe("error");

    vi.unstubAllGlobals();
    mockFetch(() => Promise.reject(new TypeError("offline")));
    expect(await sendFeedback(input)).toBe("error");
  });
});

describe("describeError", () => {
  it("names the cases the screens show a specific message for", () => {
    expect(describeError(new MissingApiKeyError("shared"))).toBe("missing-api-key");
    expect(describeError(new QuotaError("device", 0))).toBe("quota");
    expect(describeError(new QuotaError("inquiry", 0))).toBe("quota-inquiry");
    // The global scope is the owner's daily budget, not this learner's share, and is said differently.
    expect(describeError(new QuotaError("global", 0))).toBe("quota-global");
    expect(describeError(new QuotaError("budget", 0))).toBe("quota-budget");
  });

  it("keeps the provider, status and message of a provider failure", () => {
    expect(describeError(new ProviderError("openai", 401, "bad key"))).toBe("openai 401: bad key");
  });

  it("falls back to the message, or to the value itself", () => {
    expect(describeError(new Error("parse-failed"))).toBe("parse-failed");
    expect(describeError("odd")).toBe("odd");
  });
});
