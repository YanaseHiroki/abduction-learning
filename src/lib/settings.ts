import { useSyncExternalStore } from "react";
import type { Provider } from "./llm/providers";

export type Theme = "light" | "dark" | "system";

export interface ProviderSettings {
  apiKey: string;
  model: string;
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

/** index.html runs the same check before first paint, so a dark page doesn't flash white. */
function applyTheme() {
  const dark = current.theme === "dark" || (current.theme === "system" && darkQuery.matches);
  document.documentElement.classList.toggle("dark", dark);
}
applyTheme();
darkQuery.addEventListener("change", applyTheme);

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  if (patch.theme) applyTheme();
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

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
