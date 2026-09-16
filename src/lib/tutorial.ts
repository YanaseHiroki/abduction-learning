import { nanoid } from "nanoid";
import { courses, defaultExampleSettings } from "./courses";
import { createInquiry } from "./db";
import { setTutorial, useSettings } from "./settings";
import { translationSampleIn } from "./text";
import type { ExamplesParams, Inquiry, Target } from "./types";

/** The tutorial's example set: short everyday scenes, fewer sentences than usual so the first read is light. */
export const tutorialExampleSettings = { ...defaultExampleSettings("daily", "beginner"), count: 6 };

/** The course group the tutorial walks through (the book's first one), when the L2 has a course. */
export function tutorialGroup(l2: string) {
  return courses.find((c) => c.l2 === l2)?.groups[0] ?? null;
}

/**
 * The ready-made translation-test sentence (translationSamples, the same one the card offers as its
 * placeholder), when the inquiry compares the tutorial group's words in that order: ① comes out as the
 * first target, ② as the second, so any other pair or order would point them the wrong way. Learners may
 * rewrite it.
 */
export function translationSampleFor(inquiry: Inquiry) {
  const group = tutorialGroup(inquiry.l2);
  const matches = !!group && group.targets.every((x, i) => inquiry.targets[i]?.label === x.label);
  return matches ? (translationSampleIn(inquiry.l1) ?? "") : "";
}

/** Bring a card's header into view below the sticky top bar. */
export function scrollToCard(id: string) {
  const el = document.getElementById(`card-${id}`);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 64, behavior: "smooth" });
}

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
    // Stays in l1, like NewInquiryDialog's: Home's groupProgress matches past inquiries by this exact string.
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
