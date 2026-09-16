import { describe, expect, it } from "vitest";
import { fmtDate, markersIn, segment, sentenceKey } from "./text";

const texts = (segs: { text: string }[]) => segs.map((s) => s.text);
const typed = (segs: { text: string; type: string | null }[], type: string) => segs.filter((s) => s.type === type).map((s) => s.text);

describe("segment", () => {
  it("returns the whole sentence as one plain segment when nothing is marked", () => {
    expect(segment("I listen to music.", {})).toEqual([{ text: "I listen to music.", type: null }]);
  });

  it("marks the target and keeps the surrounding text", () => {
    const segs = segment("I listen to music.", { target: "listen" });
    expect(texts(segs)).toEqual(["I ", "listen", " to music."]);
    expect(typed(segs, "target")).toEqual(["listen"]);
  });

  it("marks every occurrence of the target but only the first of a guide span", () => {
    const segs = segment("Listen, and listen again to the radio.", { target: "listen", object: "the" });
    expect(typed(segs, "target")).toEqual(["Listen", "listen"]);
    expect(typed(segs, "object")).toEqual(["the"]);
  });

  it("matches case-insensitively while keeping the original casing", () => {
    expect(typed(segment("Listen to me.", { target: "listen" }), "target")).toEqual(["Listen"]);
  });

  it("drops a guide span that overlaps one already taken (the target wins)", () => {
    const segs = segment("I look at the sky.", { target: "look at", object: "at the sky" });
    expect(typed(segs, "target")).toEqual(["look at"]);
    expect(typed(segs, "object")).toEqual([]);
    expect(texts(segs).join("")).toBe("I look at the sky.");
  });

  it("keeps segments in sentence order regardless of the order the spans were given", () => {
    const segs = segment("She quietly told him a secret.", { target: "told", adverb: "quietly", object: "a secret" });
    expect(texts(segs).join("")).toBe("She quietly told him a secret.");
    expect(segs.filter((s) => s.type).map((s) => s.type)).toEqual(["adverb", "target", "object"]);
  });

  it("ignores empty, null and absent spans", () => {
    const segs = segment("I hear you.", { target: "hear", object: "", complement: null, adverb: undefined, pp: "not present" });
    expect(typed(segs, "target")).toEqual(["hear"]);
    expect(segs.filter((s) => s.type).length).toBe(1);
  });

  it("never loses or duplicates text", () => {
    const text = "Watch the show and watch out for the ads.";
    const segs = segment(text, { target: "watch", object: "the show", pp: "for the ads" });
    expect(texts(segs).join("")).toBe(text);
  });
});

describe("markersIn", () => {
  it("lists the circled numbers present, in ascending order", () => {
    expect(markersIn("嫌な意見も①聞くべきだし、噂は②聞こえる。")).toEqual([1, 2]);
  });

  it("reports each marker once and ignores the rest of the text", () => {
    expect(markersIn("③だけ ③ふたつめ")).toEqual([3]);
    expect(markersIn("no markers here")).toEqual([]);
  });
});

describe("sentenceKey", () => {
  it("joins the target id and the index", () => {
    expect(sentenceKey("t-listen", 3)).toBe("t-listen:3");
  });

  it("stays splittable when the target id itself contains a colon", () => {
    const key = sentenceKey("a:b", 7);
    expect(key.slice(0, key.lastIndexOf(":"))).toBe("a:b");
  });
});

describe("fmtDate", () => {
  it("formats in the given language and falls back for an unusable tag", () => {
    const ts = Date.UTC(2026, 8, 1, 3, 0);
    expect(fmtDate(ts, "ja")).toMatch(/2026/);
    expect(fmtDate(ts, "en")).toMatch(/2026/);
  });
});
