import { addCard, db } from "./db";
import { getSettings } from "./settings";
import { describeError } from "./llm/client";
import { generateExamplesForTarget, qaCheck } from "./llm/prompts";
import type { Card, ExamplesParams, ExamplesPayload, Inquiry, Sentence } from "./types";

export type TargetStatus = "generating" | "checking" | "done" | "error";
export interface TargetProgress {
  status: TargetStatus;
  error?: string;
}
/** targetId -> progress, reported while an example set is being generated */
export type ExamplesProgress = Record<string, TargetProgress>;

/** Read-modify-write one examples card inside a transaction, so parallel target updates never overwrite each other. */
async function patchExamplesCard(cardId: string, fn: (p: ExamplesPayload) => Partial<ExamplesPayload>) {
  await db.transaction("rw", db.cards, async () => {
    const card = (await db.cards.get(cardId)) as Card<"examples"> | undefined;
    if (!card) return;
    await db.cards.update(cardId, { payload: { ...card.payload, ...fn(card.payload) }, updatedAt: Date.now() });
  });
}

/**
 * STEP 1: create the card at once, then generate each target in its own request (in parallel),
 * run the cheap QA pass per target, and add every finished set to the card as soon as it arrives.
 */
export async function createExamplesCard(
  inquiry: Inquiry,
  params: ExamplesParams,
  onProgress?: (cardId: string, progress: ExamplesProgress) => void,
) {
  const targets = inquiry.targets.filter((t) => params.targetIds.includes(t.id));
  const order = targets.map((t) => t.id);
  const input = {
    l1: inquiry.l1,
    l2: inquiry.l2,
    targets,
    contrastWith: params.contrastWith,
    count: params.count,
    level: params.level,
    genre: params.genre,
    maxWords: params.maxWords,
    adverbs: params.adverbs,
  };
  const card = await addCard(inquiry.id, "examples", { params, sets: [], meta: { model: "", generatedAt: Date.now() }, showGuides: false });
  const progress: ExamplesProgress = Object.fromEntries(targets.map((t) => [t.id, { status: "generating" as const }]));
  const report = () => onProgress?.(card.id, { ...progress });
  report();

  const qaEnabled = getSettings().qaEnabled;
  const models = new Set<string>();
  const errors: string[] = [];

  await Promise.all(
    targets.map(async (target) => {
      try {
        const { sentences, meta } = await generateExamplesForTarget(input, target);
        models.add(meta.model);
        if (qaEnabled) {
          progress[target.id] = { status: "checking" };
          report();
          try {
            const issues = await qaCheck(inquiry.l1, inquiry.l2, [{ sentences }]);
            for (const issue of issues) {
              const s: Sentence | undefined = issue.set_index === 0 ? sentences[issue.sentence_index] : undefined;
              if (s) s.flag = { source: "auto", reason: issue.reason };
            }
          } catch {
            /* QA is best-effort */
          }
        }
        await patchExamplesCard(card.id, (p) => ({
          sets: [...p.sets.filter((s) => s.targetId !== target.id), { targetId: target.id, sentences }].sort((a, b) => order.indexOf(a.targetId) - order.indexOf(b.targetId)),
          meta: { model: [...models].join(" / "), generatedAt: Date.now() },
        }));
        progress[target.id] = { status: "done" };
        report();
      } catch (e) {
        const error = describeError(e);
        errors.push(error);
        progress[target.id] = { status: "error", error };
        report();
      }
    }),
  );

  const done = (await db.cards.get(card.id)) as Card<"examples"> | undefined;
  if (!done || done.payload.sets.length === 0) {
    await db.cards.delete(card.id);
    throw new Error(errors[0] ?? "no examples generated");
  }
  return done;
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
