import { describe, expect, it } from "vitest";
import { chooseLanguage, courses, defaultExampleSettings, genres, languageName, languageOptions, levels } from "./courses";

const english = courses.find((c) => c.l2 === "en")!;

describe("the English course", () => {
  it("exists and covers the 13 basic verbs in 4 groups", () => {
    expect(english.groups).toHaveLength(4);
    expect(english.groups.flatMap((g) => g.targets)).toHaveLength(13);
  });

  it("gives every group an id, an emoji and both screen labels", () => {
    for (const g of english.groups) {
      expect({ id: !!g.id, emoji: !!g.emoji, ja: !!g.label.ja, en: !!g.label.en }).toEqual({ id: true, emoji: true, ja: true, en: true });
    }
  });

  it("uses each group id only once", () => {
    const ids = english.groups.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every target and marks phrases as phrases", () => {
    const all = english.groups.flatMap((g) => g.targets);
    expect(all.every((t) => t.label.trim().length > 0)).toBe(true);
    expect(all.find((t) => t.label === "look at")!.kind).toBe("phrase");
    expect(all.find((t) => t.label === "listen")!.kind).toBe("word");
  });

  it("starts with the hear/listen pair the tutorial walks through", () => {
    expect(english.groups[0].id).toBe("hear");
    expect(english.groups[0].targets.map((t) => t.label)).toEqual(["listen", "hear"]);
  });

  it("writes every hint in both screen languages", () => {
    for (const g of english.groups.filter((x) => x.hint)) {
      expect(!!g.hint!.ja && !!g.hint!.en).toBe(true);
    }
  });
});

describe("genres and levels", () => {
  it("label every genre in both languages with a unique id", () => {
    expect(genres.every((g) => g.ja && g.en && g.emoji)).toBe(true);
    expect(new Set(genres.map((g) => g.id)).size).toBe(genres.length);
  });

  it("label every level in both languages with a unique id", () => {
    expect(levels.every((l) => l.ja && l.en)).toBe(true);
    expect(new Set(levels.map((l) => l.id)).size).toBe(levels.length);
  });
});

describe("defaultExampleSettings", () => {
  it("defaults to a news set of ten beginner sentences with no limits", () => {
    expect(defaultExampleSettings()).toEqual({ genre: "news", level: "beginner", count: 10, maxWords: "", adverbs: false });
  });

  it("takes the genre and level it is given", () => {
    expect(defaultExampleSettings("daily", "advanced")).toMatchObject({ genre: "daily", level: "advanced" });
  });

  it("only ever names a genre and level the screens offer", () => {
    const d = defaultExampleSettings();
    expect(genres.map((g) => g.id)).toContain(d.genre);
    expect(levels.map((l) => l.id)).toContain(d.level);
  });

  it("returns a fresh object each time, so editing one set does not change the next", () => {
    const a = defaultExampleSettings();
    a.count = 2;
    expect(defaultExampleSettings().count).toBe(10);
  });
});

describe("languageName", () => {
  it("names a language in the screen language", () => {
    expect(languageName("en", "ja")).toBe("英語");
    expect(languageName("ja", "en")).toBe("Japanese");
  });

  it("falls back to the code itself when it cannot be named", () => {
    expect(languageName("not a tag", "en")).toBe("not a tag");
  });

  it("can name every language the settings screen offers", () => {
    for (const code of languageOptions) {
      expect(languageName(code, "en")).not.toBe("");
    }
  });
});

describe("chooseLanguage", () => {
  it("leaves the other side alone when the two do not collide", () => {
    expect(chooseLanguage("l2", "fr", { l1: "ja", l2: "en" })).toEqual({ l1: "ja", l2: "fr" });
    expect(chooseLanguage("l1", "ko", { l1: "ja", l2: "en" })).toEqual({ l1: "ko", l2: "en" });
  });

  it("never leaves the learner studying the language they speak", () => {
    for (const code of languageOptions) {
      for (const pair of [{ l1: "ja", l2: "en" }, { l1: "en", l2: "en" }, { l1: code, l2: code }]) {
        expect(chooseLanguage("l1", code, pair).l1).not.toBe(chooseLanguage("l1", code, pair).l2);
        expect(chooseLanguage("l2", code, pair).l1).not.toBe(chooseLanguage("l2", code, pair).l2);
      }
    }
  });

  it("turns the pair around when the native language becomes the one being learned", () => {
    expect(chooseLanguage("l1", "en", { l1: "ja", l2: "en" })).toEqual({ l1: "en", l2: "ja" });
    expect(chooseLanguage("l2", "ja", { l1: "ja", l2: "en" })).toEqual({ l1: "en", l2: "ja" });
  });

  it("frees a pair that was already stored as the same language on both sides", () => {
    expect(chooseLanguage("l1", "en", { l1: "en", l2: "en" })).toMatchObject({ l1: "en" });
    expect(chooseLanguage("l1", "en", { l1: "en", l2: "en" }).l2).not.toBe("en");
    expect(chooseLanguage("l2", "en", { l1: "en", l2: "en" }).l1).not.toBe("en");
  });

  it("only ever names a language the screens offer", () => {
    const { l1, l2 } = chooseLanguage("l1", "ja", { l1: "ja", l2: "ja" });
    expect(languageOptions).toContain(l1);
    expect(languageOptions).toContain(l2);
  });
});
