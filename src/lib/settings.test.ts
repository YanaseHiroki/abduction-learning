import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "abduction-learning.settings";

/** settings.ts reads localStorage once at import time, so each case starts from a fresh module. */
async function freshSettings(stored?: unknown) {
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem(KEY, typeof stored === "string" ? stored : JSON.stringify(stored));
  vi.resetModules();
  return import("./settings");
}

beforeEach(() => {
  document.documentElement.className = "";
});

describe("loading", () => {
  it("uses the defaults when nothing is stored", async () => {
    const { getSettings, defaultSettings } = await freshSettings();
    expect(getSettings()).toEqual(defaultSettings);
  });

  it("falls back to the defaults when the stored value is not JSON", async () => {
    const { getSettings, defaultSettings } = await freshSettings("{not json");
    expect(getSettings()).toEqual(defaultSettings);
  });

  it("fills in keys a stored older version did not have", async () => {
    const { getSettings, defaultSettings } = await freshSettings({ uiLang: "en" });
    expect(getSettings().uiLang).toBe("en");
    expect(getSettings().ttsRate).toBe(defaultSettings.ttsRate);
    expect(getSettings().providers.gemini).toEqual(defaultSettings.providers.gemini);
  });

  it("keeps provider entries that were stored and defaults the others", async () => {
    const { getSettings, defaultSettings } = await freshSettings({ providers: { openai: { apiKey: "sk-x", model: "gpt-5.6" } } });
    expect(getSettings().providers.openai).toEqual({ apiKey: "sk-x", model: "gpt-5.6" });
    expect(getSettings().providers.anthropic).toEqual(defaultSettings.providers.anthropic);
  });

  it("migrates the v1 single-key layout onto the Anthropic tab and selects it", async () => {
    const { getSettings } = await freshSettings({ apiKey: "sk-ant-old", model: "claude-sonnet-5" });
    expect(getSettings().providers.anthropic).toEqual({ apiKey: "sk-ant-old", model: "claude-sonnet-5" });
    expect(getSettings().provider).toBe("anthropic");
  });

  it("leaves an already-migrated Anthropic key alone", async () => {
    const { getSettings } = await freshSettings({ apiKey: "sk-ant-old", providers: { anthropic: { apiKey: "sk-ant-new", model: "claude-opus-5" } }, provider: "gemini" });
    expect(getSettings().providers.anthropic.apiKey).toBe("sk-ant-new");
    expect(getSettings().provider).toBe("gemini");
  });
});

describe("writing", () => {
  it("persists a patch and merges it into the current settings", async () => {
    const { getSettings, setSettings } = await freshSettings();
    setSettings({ uiLang: "en" });
    expect(getSettings().uiLang).toBe("en");
    expect(JSON.parse(localStorage.getItem(KEY)!).uiLang).toBe("en");
    expect(getSettings().defaultL2).toBe("en");
  });

  it("patches one provider without touching the others", async () => {
    const { getSettings, setProviderSettings } = await freshSettings();
    setProviderSettings("openai", { apiKey: "sk-new" });
    expect(getSettings().providers.openai).toEqual({ apiKey: "sk-new", model: "gpt-5.6-luna" });
    expect(getSettings().providers.anthropic.apiKey).toBe("");
  });

  it("patches the tutorial state in place", async () => {
    const { getSettings, setTutorial } = await freshSettings();
    setTutorial({ status: "running", inquiryId: "abc" });
    expect(getSettings().tutorial).toEqual({ status: "running", inquiryId: "abc", step: 0 });
    setTutorial({ step: 2 });
    expect(getSettings().tutorial).toEqual({ status: "running", inquiryId: "abc", step: 2 });
  });

  it("survives a localStorage that refuses to write", async () => {
    const { getSettings, setSettings } = await freshSettings();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => setSettings({ uiLang: "en" })).not.toThrow();
    expect(getSettings().uiLang).toBe("en");
    spy.mockRestore();
  });
});

describe("display", () => {
  it("puts the dark class on the root for the dark theme and takes it off for light", async () => {
    const { setSettings } = await freshSettings();
    setSettings({ theme: "dark" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    setSettings({ theme: "light" });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows the OS preference for the system theme", async () => {
    const listeners: (() => void)[] = [];
    vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
      matches: true,
      media,
      onchange: null,
      addEventListener: (_: string, l: () => void) => listeners.push(l),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList);
    const { setSettings } = await freshSettings();
    setSettings({ theme: "system" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    vi.mocked(window.matchMedia).mockRestore();
  });

  it("sets the document language from the screen language", async () => {
    const { setSettings } = await freshSettings();
    setSettings({ uiLang: "en" });
    expect(document.documentElement.lang).toBe("en");
    setSettings({ uiLang: "ja" });
    expect(document.documentElement.lang).toBe("ja");
  });
});
