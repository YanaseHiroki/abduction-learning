import { nanoid } from "nanoid";
import { courses, defaultExampleSettings } from "./courses";
import { createInquiry } from "./db";
import { setTutorial, useSettings } from "./settings";
import type { ExamplesParams, Target } from "./types";

/** The tutorial's example set: short everyday scenes, fewer sentences than usual so the first read is light. */
export const tutorialExampleSettings = { ...defaultExampleSettings("daily", "beginner"), count: 6 };

/** The course group the tutorial walks through (the book's first one), when the L2 has a course. */
export function tutorialGroup(l2: string) {
  return courses.find((c) => c.l2 === l2)?.groups[0] ?? null;
}

/**
 * A ready-made sentence for the translation test, keyed by L1, for the tutorial group's two targets
 * (① should come out as the first target, ② as the second). Learners may rewrite it.
 */
export const tutorialTranslationSample: Record<string, string> = {
  ja: "嫌な意見も①聞くべきだし、噂は自然と②聞こえてくる。",
  en: "You should ①listen to harsh opinions, and rumors just ②reach your ears anyway.",
};

/**
 * Create the tutorial's inquiry (the learner's first real one; on the free tier it counts as one of
 * today's inquiries) and mark the tutorial as running. Returns the inquiry id and the first example set to generate.
 */
export async function startTutorial(l1: string, l2: string, custom: Omit<Target, "id">[] | null) {
  const group = tutorialGroup(l2);
  const targets: Target[] = (custom ?? group?.targets ?? []).map((x) => ({ ...x, id: nanoid(6) }));
  const s = tutorialExampleSettings;
  const inq = await createInquiry({
    l1,
    l2,
    groupLabel: !custom && group ? group.label[l1] ?? group.label.en : undefined,
    targets,
    genre: s.genre,
    level: s.level,
  });
  setTutorial({ status: "running", inquiryId: inq.id, step: 0 });
  const generate: ExamplesParams = {
    targetIds: targets.map((x) => x.id),
    count: s.count,
    level: s.level,
    genre: s.genre,
    maxWords: null,
    adverbs: s.adverbs,
    contrastWith: [],
  };
  return { id: inq.id, generate };
}

/** Whether the tutorial is currently guiding this inquiry (the inquiry page then shows TutorialGuide instead of its usual next steps). */
export function useGuidedInquiry(inquiryId: string | undefined) {
  const { tutorial } = useSettings();
  return tutorial.status === "running" && !!inquiryId && tutorial.inquiryId === inquiryId;
}
