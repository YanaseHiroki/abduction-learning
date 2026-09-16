import { afterEach, describe, expect, it, vi } from "vitest";
import { callProvider, providerMeta, ProviderError, SYSTEM_SIGNATURE, type ProviderCall } from "./providers";

const base: ProviderCall = {
  provider: "openai",
  apiKey: "sk-test",
  model: "gpt-5.6-luna",
  system: "system text",
  user: "user text",
  schema: { type: "object", properties: {}, additionalProperties: false },
  effort: "low",
  maxTokens: 1000,
};

function mockFetch(response: unknown, init: { status?: number } = {}) {
  const fn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(response), { status: init.status ?? 200, headers: { "content-type": "application/json" } }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const bodyOf = (fn: ReturnType<typeof mockFetch>) => JSON.parse(fn.mock.calls[0][1]!.body as string);
const urlOf = (fn: ReturnType<typeof mockFetch>) => String(fn.mock.calls[0][0]);
const headersOf = (fn: ReturnType<typeof mockFetch>) => fn.mock.calls[0][1]!.headers as Record<string, string>;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("providerMeta", () => {
  it("offers, for every provider, a label, a key page and models that include its defaults", () => {
    for (const [name, m] of Object.entries(providerMeta)) {
      expect({ name, label: !!m.label }).toEqual({ name, label: true });
      expect(m.keysUrl).toMatch(/^https:\/\//);
      expect(m.models).toContain(m.defaultModel);
      expect(m.models).toContain(m.cheapModel);
    }
  });
});

describe("OpenAI", () => {
  it("sends the prompt, a strict json_schema and the token cap, and reads the reply", async () => {
    const fetchMock = mockFetch({ model: "gpt-5.6-luna-2026", choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 11, completion_tokens: 22 } });

    const r = await callProvider(base);

    expect(urlOf(fetchMock)).toBe("https://api.openai.com/v1/chat/completions");
    expect(headersOf(fetchMock).authorization).toBe("Bearer sk-test");
    const body = bodyOf(fetchMock);
    expect(body.messages).toEqual([{ role: "system", content: "system text" }, { role: "user", content: "user text" }]);
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.max_completion_tokens).toBe(1000);
    expect(r).toEqual({ text: '{"ok":true}', model: "gpt-5.6-luna-2026", usage: { input: 11, output: 22 } });
  });

  it("asks a reasoning model for the requested effort, and asks nothing of a model without it", async () => {
    let fetchMock = mockFetch({ choices: [{ message: { content: "{}" } }] });
    await callProvider({ ...base, effort: "high" });
    expect(bodyOf(fetchMock).reasoning_effort).toBe("high");

    vi.unstubAllGlobals();
    fetchMock = mockFetch({ choices: [{ message: { content: "{}" } }] });
    await callProvider({ ...base, model: "some-other-model" });
    expect(bodyOf(fetchMock).reasoning_effort).toBeUndefined();
  });

  it("reports the API's own message and status when the call fails", async () => {
    mockFetch({ error: { message: "Incorrect API key provided" } }, { status: 401 });
    await expect(callProvider(base)).rejects.toMatchObject({ provider: "openai", status: 401, message: "Incorrect API key provided" });
  });

  it("reports a refusal and an empty answer as errors rather than returning nothing", async () => {
    mockFetch({ choices: [{ message: { content: null, refusal: "I can't help with that" } }] });
    await expect(callProvider(base)).rejects.toThrow(/refused/);

    vi.unstubAllGlobals();
    mockFetch({ choices: [{ message: { content: null }, finish_reason: "length" }] });
    await expect(callProvider(base)).rejects.toThrow(/empty response: length/);
  });

  it("returns no usage when the API reported none", async () => {
    mockFetch({ choices: [{ message: { content: "{}" } }] });
    expect((await callProvider(base)).usage).toBeUndefined();
  });
});

describe("Gemini", () => {
  const gemini: ProviderCall = { ...base, provider: "gemini", model: "gemini-3.1-flash-lite" };

  it("sends the system instruction, the schema and the key header, and joins the answer's parts", async () => {
    const fetchMock = mockFetch({
      modelVersion: "gemini-3.1-flash-lite-001",
      candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: '{"a":' }, { text: "1}" }] } }],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7, thoughtsTokenCount: 3 },
    });

    const r = await callProvider(gemini);

    expect(urlOf(fetchMock)).toContain("/models/gemini-3.1-flash-lite:generateContent");
    expect(headersOf(fetchMock)["x-goog-api-key"]).toBe("sk-test");
    expect(bodyOf(fetchMock).systemInstruction.parts[0].text).toBe("system text");
    expect(r.text).toBe('{"a":1}');
    expect(r.model).toBe("gemini-3.1-flash-lite-001");
    // thinking tokens are billed as output, so they are counted there
    expect(r.usage).toEqual({ input: 5, output: 10 });
  });

  it("gives Gemini 3 a thinking level and never a budget", async () => {
    const fetchMock = mockFetch({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    await callProvider(gemini);
    const cfg = bodyOf(fetchMock).generationConfig.thinkingConfig;
    expect(cfg).toEqual({ thinkingLevel: "minimal" });
    expect(cfg.thinkingBudget).toBeUndefined();
  });

  it("asks for 'low' rather than 'minimal' on a Gemini 3 model that has no minimal level", async () => {
    const fetchMock = mockFetch({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    await callProvider({ ...gemini, model: "gemini-3.8-flash" });
    expect(bodyOf(fetchMock).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" });
  });

  it("passes a higher effort straight through as the level", async () => {
    const fetchMock = mockFetch({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    await callProvider({ ...gemini, effort: "high" });
    expect(bodyOf(fetchMock).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "high" });
  });

  it("gives Gemini 2.5 Flash a budget of zero for low effort and nothing above it", async () => {
    let fetchMock = mockFetch({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    await callProvider({ ...gemini, model: "gemini-2.5-flash-lite" });
    expect(bodyOf(fetchMock).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });

    vi.unstubAllGlobals();
    fetchMock = mockFetch({ candidates: [{ content: { parts: [{ text: "{}" }] } }] });
    await callProvider({ ...gemini, model: "gemini-2.5-flash", effort: "medium" });
    expect(bodyOf(fetchMock).generationConfig.thinkingConfig).toBeUndefined();
  });

  it("reports the API's error, and a blocked or empty candidate", async () => {
    mockFetch({ error: { message: "API key not valid" } }, { status: 400 });
    await expect(callProvider(gemini)).rejects.toMatchObject({ provider: "gemini", status: 400, message: "API key not valid" });

    vi.unstubAllGlobals();
    mockFetch({ candidates: [{ finishReason: "SAFETY" }] });
    await expect(callProvider(gemini)).rejects.toThrow(/empty response: SAFETY/);

    vi.unstubAllGlobals();
    mockFetch({ promptFeedback: { blockReason: "OTHER" } });
    await expect(callProvider(gemini)).rejects.toThrow(/empty response: OTHER/);
  });
});

describe("ProviderError", () => {
  it("carries the provider and status alongside the message", () => {
    const e = new ProviderError("anthropic", 429, "rate limited");
    expect(e).toBeInstanceOf(Error);
    expect({ provider: e.provider, status: e.status, message: e.message }).toEqual({ provider: "anthropic", status: 429, message: "rate limited" });
  });
});

describe("SYSTEM_SIGNATURE", () => {
  it("is the phrase the proxy checks for before it spends the shared key", () => {
    expect(SYSTEM_SIGNATURE.length).toBeGreaterThan(20);
  });
});
