import { addCard, db } from "./db";
import { getSettings } from "./settings";
import { generateExamples, qaCheck } from "./llm/prompts";
import type { ExamplesParams, Inquiry, Sentence } from "./types";

/** STEP 1: generate an example set, run the cheap QA pass, and store it as a card. */
export async function createExamplesCard(inquiry: Inquiry, params: ExamplesParams) {
  const targets = inquiry.targets.filter((t) => params.targetIds.includes(t.id));
  const { sets, meta } = await generateExamples({
    l1: inquiry.l1,
    l2: inquiry.l2,
    targets,
    contrastWith: params.contrastWith,
    count: params.count,
    level: params.level,
    genre: params.genre,
    maxWords: params.maxWords,
    adverbs: params.adverbs,
  });
  if (getSettings().qaEnabled) {
    try {
      const issues = await qaCheck(inquiry.l1, inquiry.l2, sets);
      for (const issue of issues) {
        const s: Sentence | undefined = sets[issue.set_index]?.sentences[issue.sentence_index];
        if (s) s.flag = { source: "auto", reason: issue.reason };
      }
    } catch {
      /* QA is best-effort */
    }
  }
  return addCard(inquiry.id, "examples", { params, sets, meta, showGuides: false });
}

export async function saveSchemaNote(inquiry: Inquiry, lines: { targetId: string; text: string; uncertain: boolean }[]) {
  const id = crypto.randomUUID().slice(0, 10);
  await db.schemaNotes.add({
    id,
    inquiryId: inquiry.id,
    l1: inquiry.l1,
    l2: inquiry.l2,
    targets: inquiry.targets,
    lines,
    createdAt: Date.now(),
    lastRevisitedAt: null,
  });
  return id;
}
