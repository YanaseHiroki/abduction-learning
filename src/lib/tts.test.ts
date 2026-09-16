import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** jsdom has no speech synthesis; these stand in for the browser's. */
class FakeUtterance {
  text: string;
  lang = "";
  rate = 1;
  voice: unknown = null;
  constructor(text: string) {
    this.text = text;
  }
}

const voices = [
  { lang: "en-US", name: "Samantha" },
  { lang: "en-GB", name: "Daniel" },
  { lang: "ja-JP", name: "Kyoko" },
];

let spoken: FakeUtterance[];
let cancelled: number;

async function freshTts(available = voices) {
  spoken = [];
  cancelled = 0;
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => available,
    addEventListener: () => {},
    cancel: () => cancelled++,
    speak: (u: FakeUtterance) => spoken.push(u),
  });
  vi.resetModules();
  return import("./tts");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("hasVoiceFor", () => {
  it("is true when the OS has a voice for the language, region aside", async () => {
    const { hasVoiceFor } = await freshTts();
    expect(hasVoiceFor("en")).toBe(true);
    expect(hasVoiceFor("en-AU")).toBe(true);
    expect(hasVoiceFor("ja")).toBe(true);
  });

  it("is false for a language the OS cannot say", async () => {
    const { hasVoiceFor } = await freshTts();
    expect(hasVoiceFor("fr")).toBe(false);
  });

  it("is false, rather than throwing, where there is no speech at all", async () => {
    vi.resetModules();
    const { hasVoiceFor } = await import("./tts");
    expect(hasVoiceFor("en")).toBe(false);
  });
});

describe("speak", () => {
  it("picks the exact voice for the tag when there is one", async () => {
    const { speak } = await freshTts();
    speak("Hello.", "en-GB");
    expect(spoken[0].voice).toEqual({ lang: "en-GB", name: "Daniel" });
    expect(spoken[0].lang).toBe("en-GB");
  });

  it("falls back to any voice for the language", async () => {
    const { speak } = await freshTts();
    speak("Hello.", "en-AU");
    expect(spoken[0].voice).toEqual({ lang: "en-US", name: "Samantha" });
    expect(spoken[0].lang).toBe("en-US");
  });

  it("still speaks with the requested language when no voice matches", async () => {
    const { speak } = await freshTts();
    speak("Bonjour.", "fr");
    expect(spoken[0].voice).toBeNull();
    expect(spoken[0].lang).toBe("fr");
  });

  it("uses the learner's reading speed, defaulting to a little under natural", async () => {
    const { speak } = await freshTts();
    speak("Hello.", "en", 0.7);
    speak("Hello.", "en");
    expect(spoken.map((u) => u.rate)).toEqual([0.7, 0.95]);
  });

  it("stops whatever was being read before starting the next sentence", async () => {
    const { speak } = await freshTts();
    speak("One.", "en");
    speak("Two.", "en");
    expect(cancelled).toBe(2);
    expect(spoken.map((u) => u.text)).toEqual(["One.", "Two."]);
  });

  it("does nothing where the browser has no speech", async () => {
    vi.resetModules();
    const { speak, stopSpeaking } = await import("./tts");
    expect(() => speak("Hello.", "en")).not.toThrow();
    expect(() => stopSpeaking()).not.toThrow();
  });
});

describe("stopSpeaking", () => {
  it("cancels what is being read", async () => {
    const { speak, stopSpeaking } = await freshTts();
    speak("One.", "en");
    stopSpeaking();
    expect(cancelled).toBe(2);
  });
});
