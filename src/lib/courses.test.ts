import { describe, expect, it } from "vitest";
import { courses, defaultExampleSettings, genres, languageName, languageOptions, levels, showsTargetList, type CourseGroup } from "./courses";

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

describe("showsTargetList", () => {
  const group = (label: Record<string, string>, ...targets: string[]): CourseGroup =>
    ({ id: "g", emoji: "x", label, targets: targets.map((l) => ({ label: l, kind: "word" as const })) });

  it("shows the words under a Japanese name, which never spells them out", () => {
    for (const g of english.groups) expect(showsTargetList(g, "ja")).toBe(true);
  });

  it("hides them under an English name that is already the same list", () => {
    const say = english.groups.find((g) => g.id === "say")!;
    expect(say.label.en).toBe("say / tell / speak / talk");
    expect(showsTargetList(say, "en")).toBe(false);
  });

  it("keeps them when a target is missing from the name, like \"look at\" under \"look\"", () => {
    const look = english.groups.find((g) => g.id === "see")!;
    expect(look.targets.map((t) => t.label)).toContain("look at");
    expect(showsTargetList(look, "en")).toBe(true);
  });

  it("ignores order, spacing and case when comparing", () => {
    expect(showsTargetList(group({ en: "Tell /say" }, "say", "tell"), "en")).toBe(false);
  });

  it("keeps them when the name lists fewer or more words than the group has", () => {
    expect(showsTargetList(group({ en: "say / tell" }, "say", "tell", "speak"), "en")).toBe(true);
    expect(showsTargetList(group({ en: "say / tell / speak" }, "say", "tell"), "en")).toBe(true);
  });

  it("judges by the name actually shown, falling back to English like the screens do", () => {
    const g = group({ en: "say / tell" }, "say", "tell");
    expect(showsTargetList(g, "ja")).toBe(false);
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
