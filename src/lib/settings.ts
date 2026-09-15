import { useSyncExternalStore } from "react";

export interface Settings {
  apiKey: string;
  model: string;
  qaModel: string;
  qaEnabled: boolean;
  uiLang: "ja" | "en";
  defaultL1: string;
  defaultL2: string;
  showTranslations: boolean;
  ttsRate: number;
}

const KEY = "abduction-learning.settings";

export const defaultSettings: Settings = {
  apiKey: "",
  model: "claude-opus-5",
  qaModel: "claude-haiku-4-5",
  qaEnabled: true,
  uiLang: "ja",
  defaultL1: "ja",
  defaultL2: "en",
  showTranslations: true,
  ttsRate: 0.95,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return defaultSettings;
  }
}

let current = load();
const listeners = new Set<() => void>();

export function getSettings() {
  return current;
}

export function setSettings(patch: Partial<Settings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage may be unavailable */
  }
  listeners.forEach((l) => l());
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
