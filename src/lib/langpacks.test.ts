import { describe, expect, it } from "vitest";
import { getLangPack, langPacks } from "./langpacks";

describe("getLangPack", () => {
  it("gives a language its own pack", () => {
    expect(getLangPack("en").syntaxRoles.map((r) => r.id)).toContain("THAT");
    expect(getLangPack("ja").syntaxRoles.map((r) => r.id)).toContain("NI");
  });

  it("ignores the region part of a tag", () => {
    expect(getLangPack("en-GB")).toBe(langPacks.en);
    expect(getLangPack("EN")).toBe(langPacks.en);
  });

  it("falls back to the generic pack for a language with none of its own", () => {
    expect(getLangPack("fr")).toBe(langPacks.generic);
    expect(getLangPack("")).toBe(langPacks.generic);
  });
});

describe("every pack", () => {
  it("offers perspectives and roles, labelled in both screen languages with unique ids", () => {
    for (const [name, pack] of Object.entries(langPacks)) {
      expect({ name, perspectives: pack.perspectives.length > 0, roles: pack.syntaxRoles.length > 0 }).toEqual({ name, perspectives: true, roles: true });
      for (const p of pack.perspectives) expect({ name, id: p.id, labelled: !!p.ja && !!p.en }).toEqual({ name, id: p.id, labelled: true });
      for (const r of pack.syntaxRoles) expect({ name, id: r.id, labelled: !!r.ja && !!r.en }).toEqual({ name, id: r.id, labelled: true });
      expect(new Set(pack.perspectives.map((p) => p.id)).size).toBe(pack.perspectives.length);
      expect(new Set(pack.syntaxRoles.map((r) => r.id)).size).toBe(pack.syntaxRoles.length);
    }
  });

  it("keeps the perspectives the cards special-case: a free one, and one that uses no examples", () => {
    for (const pack of Object.values(langPacks)) {
      const ids = pack.perspectives.map((p) => p.id);
      expect(ids).toContain("gloss");
      expect(ids).toContain("free");
      expect(pack.perspectives.some((p) => !p.usesExamples)).toBe(true);
    }
  });

  it("offers a role every syntax suggestion can fall back to", () => {
    for (const pack of Object.values(langPacks)) {
      const ids = pack.syntaxRoles.map((r) => r.id);
      expect(ids.includes("MOD") || ids.includes("OTHER")).toBe(true);
      expect(ids).toContain("V");
    }
  });
});
