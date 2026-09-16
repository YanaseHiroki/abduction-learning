/** Shared setup for the jsdom unit project: a real (in-memory) IndexedDB and the browser globals the app expects. */
import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach } from "vitest";

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

// settings.ts subscribes to this at import time.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});
