import { beforeEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_SIGNATURE } from "./providers";
import { structured } from "./client";
import { consultTargets, frameTest, generateExamples, generateExamplesForTarget, qaCheck, translateTest, writingFeedback } from "./prompts";
import type { GenerateExamplesInput } from "./prompts";
import type { Sentence, Target } from "../types";
import { courses } from "../courses";

vi.mock("./client", () => ({ structured: vi.fn() }));

const mocked = vi.mocked(structured);
const reply = (data: unknown) => mocked.mockResolvedValue({ data, model: "test-model", generatedAt: 1000, elapsedMs: 5 } as never);
const lastCall = () => {
  const [system, user, schema, opts] = mocked.mock.calls.at(-1)!;
  return { system: system as string, user: user as string, schema, opts: (opts ?? {}) as Record<string, unknown> };
};

const listen: Target = { id: "t1", label: "listen", kind: "word" };
const hear: Target = { id: "t2", label: "hear", kind: "word" };

const input = (over: Partial<GenerateExamplesInput> = {}): GenerateExamplesInput => ({
  l1: "ja", l2: "en", targets: [listen, hear], contrastWith: [], count: 6, level: "beginner", genre: "daily", maxWords: null, adverbs: false, ...over,
});

const sentence = (l2: string): Sentence => ({ l2, l1: "訳", target_form: "listened", object: null, complement: null, adverb: null, preposition_phrase: null });

beforeEach(() => {
  mocked.mockReset();
});

describe("the system prompt", () => {
  it("carries the signature the shared-key proxy requires", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(input(), listen);
    expect(lastCall().system).toContain(SYSTEM_SIGNATURE);
  });

  it("names both languages by name, not by code", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(input(), listen);
    const { system } = lastCall();
    expect(system).toContain("English");
    expect(system).toContain("Japanese");
    expect(system).not.toMatch(/studies en\b/);
  });

  it("forbids explaining the difference — the point of the method", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(input(), listen);
    expect(lastCall().system).toMatch(/Do NOT explain meanings/);
  });

  it("falls back to the code itself for a language tag it cannot name", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(input({ l2: "zzz" }), listen);
    expect(lastCall().system).toContain("zzz");
  });
});

describe("generateExamplesForTarget", () => {
  it("asks for one target at a time, with the count, level and genre", async () => {
    reply({ sentences: [sentence("I listened to the radio.")] });

    const r = await generateExamplesForTarget(input(), listen);

    const { user } = lastCall();
    expect(user).toContain('"listen"');
    expect(user).toContain("exactly 6 sentences");
    expect(user).toContain("Level: beginner");
    expect(user).toContain("Genre / register: daily");
    expect(r.targetId).toBe("t1");
    expect(r.meta.model).toBe("test-model");
  });

  it("marks every returned sentence as unflagged, ready for the QA pass", async () => {
    reply({ sentences: [sentence("I listened.")] });
    const r = await generateExamplesForTarget(input(), listen);
    expect(r.sentences[0].flag).toBeNull();
  });

  it("bans the words being compared against, so each set stays clean", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(input({ contrastWith: ["overhear"] }), listen);
    const { user } = lastCall();
    expect(user).toContain('"hear"');
    expect(user).toContain('"overhear"');
    expect(user).toContain("Do not use those expressions");
  });

  it("adds the word limit only when there is one", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(input({ maxWords: 12 }), listen);
    expect(lastCall().user).toContain("at most 12 words");

    await generateExamplesForTarget(input(), listen);
    expect(lastCall().user).not.toContain("at most");
  });

  it("requires a revealing adverb in every sentence when the learner asked for adverbs", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(input({ adverbs: true }), listen);
    const { user } = lastCall();
    expect(user).toContain("must contain an adverb");
    expect(user).toContain('differs from "hear"');
  });

  it("describes a pattern target as a construction, with its spec", async () => {
    reply({ sentences: [] });
    const pattern: Target = { id: "t9", label: "consider + O + C", kind: "pattern", spec: "consider followed by object and complement" };
    await generateExamplesForTarget(input({ targets: [pattern] }), pattern);
    const { user } = lastCall();
    expect(user).toContain("construction pattern");
    expect(user).toContain("consider followed by object and complement");
  });

  it("keeps the guide spans quotable by demanding literal substrings", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(input(), listen);
    expect(lastCall().user).toContain("substrings that literally appear in l2");
  });
});

describe("generateExamples", () => {
  it("requests every target and returns one set each, in order", async () => {
    mocked.mockImplementation(async (_s, user) => ({
      // every request names the other words too, so tell them apart by the Target: block
      data: { sentences: [sentence(String(user).startsWith('Target:\n- "listen"') ? "listen sentence" : "hear sentence")] },
      model: "test-model", generatedAt: 1, elapsedMs: 1,
    }) as never);

    const r = await generateExamples(input());

    expect(mocked).toHaveBeenCalledTimes(2);
    expect(r.sets.map((s) => s.targetId)).toEqual(["t1", "t2"]);
    expect(r.sets[0].sentences[0].l2).toBe("listen sentence");
    expect(r.sets[1].sentences[0].l2).toBe("hear sentence");
  });
});

describe("qaCheck", () => {
  it("lists every sentence with its coordinates and asks the cheap model for real problems only", async () => {
    reply({ issues: [{ set_index: 0, sentence_index: 1, reason: "時制が合いません" }] });

    const issues = await qaCheck("ja", "en", [{ sentences: [sentence("A."), sentence("B.")] }]);

    const { user, opts } = lastCall();
    expect(user).toContain("[0,0] A.");
    expect(user).toContain("[0,1] B.");
    expect(user).toContain("Report only real problems");
    expect(opts.cheap).toBe(true);
    expect(issues).toEqual([{ set_index: 0, sentence_index: 1, reason: "時制が合いません" }]);
  });

  it("asks for the reasons in the learner's own language", async () => {
    reply({ issues: [] });
    await qaCheck("ja", "en", [{ sentences: [] }]);
    expect(lastCall().user).toContain("Reasons in Japanese");
  });
});

describe("translateTest", () => {
  const targets = [listen, hear];

  it("explains the circled numbers and asks for the word used at each", async () => {
    reply({ l2_text: "…", alignments: [{ index: 1, word: "listened", target: "listen" }], note: null });

    const r = await translateTest({ l1: "ja", l2: "en", l1Text: "①聞く", targets, restrictToTargets: true, fixedGloss: "", feasibilityTarget: null });

    const { user } = lastCall();
    expect(user).toContain("circled numbers");
    expect(user).toContain("Do not include the circled numbers in l2_text");
    expect(user).toContain("①聞く");
    expect(r.alignments).toEqual([{ index: 1, word: "listened", target: "listen" }]);
    expect(r.meta.model).toBe("test-model");
  });

  it("asks for the inflected form and the expression under study separately", async () => {
    // the surface form alone cannot be matched back to the target in a language that conjugates it
    reply({ l2_text: "…", alignments: [{ index: 1, word: "眺めて", target: "眺める" }], note: null });

    await translateTest({ l1: "en", l2: "ja", l1Text: "①gaze", targets, restrictToTargets: true, fixedGloss: "", feasibilityTarget: null });

    const { user, schema } = lastCall();
    expect(user).toContain("copied letter for letter from the list under study");
    const alignment = (schema as unknown as { shape: Record<string, { element: { shape: object } }> }).shape.alignments.element;
    expect(Object.keys(alignment.shape)).toContain("target");
  });

  it("restricts the choice to the targets, or explicitly does not", async () => {
    reply({ l2_text: "", alignments: [], note: null });
    await translateTest({ l1: "ja", l2: "en", l1Text: "x", targets, restrictToTargets: true, fixedGloss: "", feasibilityTarget: null });
    expect(lastCall().user).toContain("you must choose the most appropriate one of these candidates only");

    await translateTest({ l1: "ja", l2: "en", l1Text: "x", targets, restrictToTargets: false, fixedGloss: "", feasibilityTarget: null });
    expect(lastCall().user).toContain("you are not restricted to them");
  });

  it("passes a fixed gloss on, and asks the feasibility question when there is one", async () => {
    reply({ l2_text: "", alignments: [], note: null });
    await translateTest({ l1: "ja", l2: "en", l1Text: "x", targets, restrictToTargets: true, fixedGloss: "思う", feasibilityTarget: hear });
    const { user } = lastCall();
    expect(user).toContain('"思う"');
    expect(user).toContain('can this be expressed using "hear"');
  });

  it("asks for no note when no feasibility question was asked", async () => {
    reply({ l2_text: "", alignments: [], note: null });
    await translateTest({ l1: "ja", l2: "en", l1Text: "x", targets, restrictToTargets: true, fixedGloss: "", feasibilityTarget: null });
    expect(lastCall().user).toContain("Leave note null");
  });
});

describe("frameTest", () => {
  it("numbers the frames and hands over both targets", async () => {
    reply({ judgments: [{ frame_index: 0, target: "listen", natural: true, example: "…", note: "…" }] });

    const r = await frameTest("ja", "en", [listen, hear], ["〜するつもりで", "うっかり〜する"]);

    const { user } = lastCall();
    expect(user).toContain("0. 〜するつもりで");
    expect(user).toContain("1. うっかり〜する");
    expect(user).toContain('- "listen"');
    expect(r.judgments).toHaveLength(1);
  });
});

describe("writingFeedback", () => {
  it("sends the hypothesis and the sentences, and asks for a partner's remarks rather than a verdict", async () => {
    reply({ comments: [{ index: 0, comment: "…", confidence: "medium" }] });

    const r = await writingFeedback("ja", "en", [listen, hear], "listen は意識して聞く", ["I listened to the news."]);

    const { user } = lastCall();
    expect(user).toContain("listen は意識して聞く");
    expect(user).toContain("0. I listened to the news.");
    expect(user).toContain("Act as a partner, not a teacher");
    expect(user).toContain("Avoid verdict words");
    expect(user).toContain("Write in Japanese");
    expect(r.comments[0].confidence).toBe("medium");
  });
});

describe("the at / in / on course", () => {
  // The real targets, as a card copies them into an inquiry
  const group = courses.find((c) => c.id === "prepositions")!.groups[0];
  const [at, inT, on] = group.targets.map((x, i): Target => ({ ...x, id: `p${i}` }));
  const prepositions = input({ targets: [at, inT, on] });

  it("keeps the examples to place and time, and bans the other two prepositions", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(prepositions, at);
    const { user } = lastCall();
    expect(user).toContain('Target:\n- "at" (word: preposition of place or time)');
    expect(user).toContain('compares "at" with "in", "on"');
    expect(user).toContain("Do not use those expressions");
  });

  it("asks for the preposition alone as the form to bold, not the phrase around it", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget(prepositions, at);
    const shape = (lastCall().schema as unknown as { shape: { sentences: { element: { shape: Record<string, { description?: string }> } } } }).shape;
    expect(shape.sentences.element.shape.target_form.description).toContain("'at' (not 'at the station')");
  });

  it("asks for an adverb a preposition can actually take", async () => {
    reply({ sentences: [] });
    await generateExamplesForTarget({ ...prepositions, adverbs: true }, on);
    expect(lastCall().user).toContain("for a preposition, the phrase it heads");
  });

  it("limits the translation test to the three prepositions, numbered before the phrase a particle ends", async () => {
    reply({ l2_text: "", alignments: [], note: null });
    await translateTest({ l1: "ja", l2: "en", l1Text: "①駅で②3時に会う", targets: [at, inT, on], restrictToTargets: true, fixedGloss: "", feasibilityTarget: null });
    const { user } = lastCall();
    expect(user).toContain('one of these candidates only: "at", "in", "on"');
    expect(user).toContain("Where Japanese expresses the target after its word (a particle or postposition), the number sits before that whole phrase");
  });
});

describe("consultTargets", () => {
  it("replies in the learner's language, never explains the differences, and sends the whole conversation", async () => {
    reply({ reply: "ok", suggestion: null });
    await consultTargets("ja", "en", [{ role: "learner", text: "思うの言い方" }, { role: "assistant", text: "どんな場面？" }, { role: "learner", text: "会議" }]);
    const { system, user } = lastCall();
    expect(system).toContain("Always reply in Japanese");
    // Without it the free-tier proxy answers "unsupported prompt".
    expect(system).toContain(SYSTEM_SIGNATURE);
    expect(system).toContain("Do NOT explain how the expressions differ");
    expect(user).toBe("Learner: 思うの言い方\n\nYou: どんな場面？\n\nLearner: 会議");
  });
});
