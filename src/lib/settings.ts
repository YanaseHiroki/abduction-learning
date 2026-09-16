import { useSyncExternalStore } from "react";
import { chooseLanguage } from "./courses";
import type { Provider } from "./llm/providers";

export type Theme = "light" | "dark" | "system";

export interface ProviderSettings {
  apiKey: string;
  model: string;
}

/**
 * The first-run tutorial: "new" until the learner starts it (or is found to have data already),
 * "running" while its inquiry is being guided, "done" afterwards (also after skipping or importing).
 */
export interface TutorialState {
  status: "new" | "running" | "done";
  inquiryId: string | null;
  /** which guide step the inquiry page shows (0-based), kept so a reload resumes there */
  step: number;
}

export interface Settings {
  /** which tab is active in Settings: the shared free tier, or one provider with the learner's own key */
  provider: Provider | "shared";
  providers: Record<Provider, ProviderSettings>;
  qaEnabled: boolean;
  uiLang: "ja" | "en";
  /** "system" follows the OS light/dark preference */
  theme: Theme;
  defaultL1: string;
  defaultL2: string;
  showTranslations: boolean;
  ttsRate: number;
  deviceId: string;
  tutorial: TutorialState;
}

const KEY = "abduction-learning.settings";

/**
 * Default model per provider when the learner brings their own key (QA uses providerMeta[p].cheapModel).
 * Keep in sync with providerMeta.defaultModel; see docs/model-bench-2026-09.md for how they were chosen.
 */
export const defaultSettings: Settings = {
  provider: "shared",
  providers: {
    anthropic: { apiKey: "", model: "claude-opus-5" },
    openai: { apiKey: "", model: "gpt-5.6-luna" },
    gemini: { apiKey: "", model: "gemini-3.1-flash-lite" },
  },
  qaEnabled: true,
  uiLang: "ja",
  theme: "system",
  defaultL1: "ja",
  defaultL2: "en",
  showTranslations: true,
  ttsRate: 0.95,
  deviceId: "",
  tutorial: { status: "new", inquiryId: null, step: 0 },
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<Settings> & { apiKey?: string; model?: string };
    const merged: Settings = {
      ...defaultSettings,
      ...parsed,
      providers: { ...defaultSettings.providers, ...(parsed.providers ?? {}) },
    };
    // A pair saved as the same language on both sides was reachable before chooseLanguage, and would
    // leave the learner studying the language they speak. Free it on the way in, so a profile that is
    // never touched again does not keep starting inquiries like that.
    if (merged.defaultL1 === merged.defaultL2) {
      merged.defaultL2 = chooseLanguage("l1", merged.defaultL1, { l1: merged.defaultL1, l2: merged.defaultL2 }).l2;
    }
    // migrate the v1 single-key layout
    if (parsed.apiKey && !merged.providers.anthropic.apiKey) {
      merged.providers.anthropic = { apiKey: parsed.apiKey, model: parsed.model ?? "claude-opus-5" };
      merged.provider = "anthropic";
    }
    return merged;
  } catch {
    return defaultSettings;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings() {
  return current;
}

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/**
 * index.html runs the same dark check before first paint, so a dark page doesn't flash white.
 * `lang` follows the screen language so screen readers and hyphenation get the page right.
 */
function applyDisplay() {
  const dark = current.theme === "dark" || (current.theme === "system" && darkQuery.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.lang = current.uiLang;
}
applyDisplay();
darkQuery.addEventListener("change", applyDisplay);

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  if (patch.theme || patch.uiLang) applyDisplay();
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage may be unavailable */
  }
  listeners.forEach((l) => l());
}

export function setProviderSettings(provider: Provider, patch: Partial<ProviderSettings>) {
  setSettings({ providers: { ...current.providers, [provider]: { ...current.providers[provider], ...patch } } });
}

export function setTutorial(patch: Partial<TutorialState>) {
  setSettings({ tutorial: { ...current.tutorial, ...patch } });
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
