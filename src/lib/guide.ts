import { getLangPack } from "./langpacks";
import type { Localized } from "./i18n";
import type { Card, CardKind, Inquiry, ObservationPayload, Sentence, SyntaxPayload } from "./types";

/**
 * What each card asks of the learner right now, and whether it is done enough to move on.
 * The same words show inside the cards in everyday use and in the tutorial's coach panel,
 * so the two never drift apart.
 */

const pairOf = (inquiry: Inquiry) => {
  const [a, b] = inquiry.targets.map((x) => x.label);
  return { a: a ?? "", b: b ?? "" };
};

/** Targets that have at least one collected item on an observation card. */
export function markedTargets(p: ObservationPayload) {
  return new Set(p.marks.map((m) => m.targetId));
}

/** Targets that have at least one sentence tagged on a syntax card (keys are `${targetId}:${index}`). */
export function taggedTargets(p: SyntaxPayload) {
  return new Set(Object.entries(p.analyses).filter(([, els]) => els.length > 0).map(([key]) => key.slice(0, key.lastIndexOf(":"))));
}

/** The labels of targets still missing from `have`, joined for a sentence. */
const missing = (inquiry: Inquiry, have: Set<string>) => inquiry.targets.filter((x) => !have.has(x.id)).map((x) => x.label).join(" / ");

function translationMatched(card: Card<"verify_translation">) {
  const r = card.payload.result;
  if (!r) return false;
  const pred = new Map(card.payload.markers.map((m) => [m.index, m.predictedTargetId]));
  return r.alignments.every((a) => a.targetId && pred.get(a.index) === a.targetId);
}

function frameMatched(card: Card<"verify_frame">) {
  const p = card.payload;
  if (!p.result) return false;
  return p.result.judgments.every((j) => {
    const pred = p.frames.find((f) => f.id === j.frameId)?.predictions[j.targetId];
    return pred === "unsure" || (pred === "ok") === j.natural;
  });
}

/** Whether a verification card came out exactly as predicted (then wrapping up is the natural next step). */
export function verifiedAsPredicted(card: Card) {
  if (card.kind === "verify_translation") return translationMatched(card as Card<"verify_translation">);
  if (card.kind === "verify_frame") return frameMatched(card as Card<"verify_frame">);
  return false;
}

/** Done enough that the next step should be offered prominently. */
export function cardReady(card: Card, inquiry: Inquiry): boolean {
  switch (card.kind) {
    case "examples":
      return (card as Card<"examples">).payload.sets.length > 0;
    case "observation": {
      const p = (card as Card<"observation">).payload;
      const persp = getLangPack(inquiry.l2).perspectives.find((x) => x.id === p.perspective);
      if (persp && !persp.usesExamples) return p.notes.trim().length > 0;
      return markedTargets(p).size >= inquiry.targets.length;
    }
    case "syntax":
      return taggedTargets((card as Card<"syntax">).payload).size >= inquiry.targets.length;
    case "hypothesis":
      return (card as Card<"hypothesis">).payload.lines.some((l) => l.text.trim());
    case "verify_translation":
      return !!(card as Card<"verify_translation">).payload.result;
    case "verify_frame":
      return !!(card as Card<"verify_frame">).payload.result;
    case "summary":
      return !!(card as Card<"summary">).payload.savedNoteId;
  }
}

/**
 * Whether deleting this card would throw work away. A card that was only just added holds nothing,
 * so it is removed without asking; anything else is confirmed first, because there is no undo.
 */
export function cardHasContent(card: Card): boolean {
  switch (card.kind) {
    case "examples":
      return (card as Card<"examples">).payload.sets.length > 0;
    case "observation": {
      const p = (card as Card<"observation">).payload;
      return p.marks.length > 0 || !!p.notes.trim() || !!p.aiExtraction;
    }
    case "syntax": {
      const p = (card as Card<"syntax">).payload;
      return Object.values(p.analyses).some((els) => els.length > 0) || !!p.notes.trim() || !!p.aiAnalysis;
    }
    case "hypothesis": {
      const p = (card as Card<"hypothesis">).payload;
      return p.lines.some((l) => l.text.trim()) || !!p.notes.trim();
    }
    case "verify_translation": {
      const p = (card as Card<"verify_translation">).payload;
      return !!p.result || !!p.l1Text.trim() || p.history.length > 0;
    }
    case "verify_frame": {
      const p = (card as Card<"verify_frame">).payload;
      return !!p.result || p.frames.length > 0;
    }
    case "summary": {
      const p = (card as Card<"summary">).payload;
      return !!p.savedNoteId || p.lines.some((l) => l.text.trim()) || p.writing.some((w) => w.trim());
    }
  }
}

/** The instruction for the card's current stage. */
export function cardHint(card: Card, inquiry: Inquiry): Localized {
  const { a, b } = pairOf(inquiry);
  switch (card.kind) {
    case "examples":
      return {
        ja: `${a} と ${b} の例文が並びました。\n訳もついていますが、使い分けの解説はあえてしません。\nどんな文で使われているか、ざっと眺めてください。`,
        en: `Examples of ${a} and ${b} are ready.\nTranslations are included, but how the words differ is deliberately not explained.\nSkim how each word is used.`,
      };
    case "observation": {
      const p = (card as Card<"observation">).payload;
      const persp = getLangPack(inquiry.l2).perspectives.find((x) => x.id === p.perspective);
      if (persp && !persp.usesExamples) {
        return { ja: "例文は使いません。\n母語ではこの場面をどう言い分けているかを、下のメモに書き出します。", en: "No examples here.\nWrite down how your own language divides these situations." };
      }
      const have = markedTargets(p);
      if (have.size === 0) {
        return p.perspective === "gloss"
          ? { ja: `訳文の中で、${a} と ${b} がそれぞれどう訳されているかを集めます。\n気になった訳語をなぞって選び、例文の上に出る「追加」を押します。`, en: `Collect how ${a} and ${b} are each translated.\nSelect a translation that catches your eye and press "Add" above the examples.` }
          : { ja: `例文の中から「${persp?.ja ?? p.perspective}」に当たる語句を集めます。\n語句をなぞって選び、例文の上に出る「追加」を押します。`, en: `Collect words that show "${persp?.en ?? p.perspective}".\nSelect them in the examples and press "Add" above.` };
      }
      if (have.size < inquiry.targets.length) {
        return { ja: `集めた語句は下の比較表に入りました。\n${missing(inquiry, have)} の例文からも集めると、2語を見比べられます。`, en: `What you collect goes into the table below.\nCollect from ${missing(inquiry, have)} too, so you can compare.` };
      }
      return { ja: "2〜3個ずつ集まったら、比較表を見比べます。\n気づいたことをメモして、違いが見えてきたら仮説へ進みます。", en: "With two or three each, compare the table.\nNote what you notice; once a difference shows, move on to a hypothesis." };
    }
    case "syntax": {
      const have = taggedTargets((card as Card<"syntax">).payload);
      if (have.size === 0) {
        return { ja: `${a} と ${b} の後ろに何が来るか（目的語・前置詞句・that節…）を比べます。\n例文の中の語句をなぞって選び、出てくるボタンから役割を選ぶと付きます。`, en: `Compare what follows ${a} and ${b} (an object, a prepositional phrase, a that-clause…).\nSelect words in a sentence, then pick a role from the buttons that appear.` };
      }
      if (have.size < inquiry.targets.length) {
        return { ja: `付けた役割の並びが、下の集計に入りました。\n${missing(inquiry, have)} の例文にも役割を付けると、型の違いが見えてきます。`, en: `The role pattern went into the summary below.\nTag ${missing(inquiry, have)} too, and the difference in patterns shows.` };
      }
      return { ja: "集計を見比べて、どちらにだけ出る型があるかを探します。\n気づいたことをメモして、違いが見えてきたら仮説へ進みます。", en: "Compare the summary: which patterns appear for only one word?\nNote it; once a difference shows, move on to a hypothesis." };
    }
    case "hypothesis":
      return (card as Card<"hypothesis">).payload.lines.some((l) => l.text.trim())
        ? { ja: "書けたら、翻訳テストで確かめます。\n間違っていて構いません。", en: "Once it is written, test it with a translation.\nIt is fine to be wrong." }
        : { ja: `${a} と ${b} の違いを、それぞれ1行で書きます。\n自信がなければ「？」を付けます。\n間違っていて構いません。`, en: `Write one line each on how ${a} and ${b} differ.\nMark "?" if unsure.\nIt is fine to be wrong.` };
    case "verify_translation": {
      const p = (card as Card<"verify_translation">).payload;
      if (p.result) return { ja: "予想と実際を比べてみましょう。\n合わなかったところが、仮説を直す手がかりです。", en: "Compare your predictions with the result.\nMismatches are clues for revising the hypothesis." };
      if (!/[①-⑩]/.test(p.l1Text)) return { ja: `仮説を試す文を母語で書き、${a}・${b} のどちらかになりそうな語の直前に ①② を入れます。`, en: `Write a sentence in your language that tests the hypothesis, and put ①② before the words that should become ${a} or ${b}.` };
      return { ja: `①②に入るのが ${a} か ${b} かを予想して選びます。\n「翻訳させる」を押すと、AIの訳と答え合わせできます。`, en: `Predict whether ${a} or ${b} goes in each ①②.\nPress "Translate" to check against the AI's translation.` };
    }
    case "verify_frame": {
      const p = (card as Card<"verify_frame">).payload;
      if (p.result) return { ja: "予想が外れたマスが、仮説を直す手がかりです。", en: "The cells you got wrong are clues for revising the hypothesis." };
      if (p.frames.length === 0) return { ja: `「〜するつもりで」のような枠に、${a}・${b} が入るかを予想します。\nおすすめの枠を押すか、自分で書いて追加します。`, en: `Predict whether ${a} and ${b} fit frames like "on purpose".\nPress a suggested frame or write your own.` };
      return { ja: "すべてのマスに ○ × ? で予想を入れ、「AIに確かめる」で答え合わせします。", en: "Fill every cell with ○ × ?, then press \"Ask the AI\" to check." };
    }
    case "summary":
      return (card as Card<"summary">).payload.savedNoteId
        ? { ja: "このスキーマを使って、自分が実際に使いそうな場面の文を書いてみましょう。", en: "Use the schema to write sentences from situations you would actually use." }
        : { ja: "結果を踏まえて、仮説の言葉を直します。\n「気づきノートに保存」を押すと、このまとめが残ります。", en: "Revise the wording with what you found.\nPress \"Save to notes\" to keep it." };
  }
}

/** The steps offered after the last card: the first is the recommended one. */
export function nextSteps(last: Card, hasHypothesis: boolean): { kind: CardKind; label: Localized; why: Localized }[] {
  const observe = { kind: "observation" as const, label: { ja: "🔍 着眼点を決めて比べる", en: "🔍 Pick a perspective and compare" }, why: { ja: "例文から、違いの手がかりを集めます。", en: "Collect clues to the difference from the examples." } };
  const observeMore = { ...observe, label: { ja: "🔍 別の着眼点でも比べる", en: "🔍 Compare from another perspective" } };
  const syntax = { kind: "syntax" as const, label: { ja: "🧩 構文を分析する", en: "🧩 Analyze syntax" }, why: { ja: "後ろに何が来るか、文の形の違いを比べます。", en: "Compare the shape of the sentences: what follows each word." } };
  const hypothesis = {
    kind: "hypothesis" as const,
    label: hasHypothesis ? { ja: "💡 仮説を次の版に進める", en: "💡 Advance the hypothesis" } : { ja: "💡 仮説を書く", en: "💡 Write a hypothesis" },
    why: { ja: "集めた手がかりから、自分の考えを1行で言葉にします。", en: "Put what you noticed into one line." },
  };
  const revise = { ...hypothesis, label: { ja: "💡 結果を踏まえて仮説を直す", en: "💡 Revise the hypothesis" }, why: { ja: "外れた予想をもとに、仮説の言葉を直します。", en: "Use the wrong predictions to revise the wording." } };
  const translation = { kind: "verify_translation" as const, label: { ja: "🌐 翻訳テストで確かめる", en: "🌐 Test by translation" }, why: { ja: "母語の文でどちらの語が出るかを予想して、答え合わせします。", en: "Predict which word a translation uses, then check." } };
  const translationAgain = { ...translation, label: { ja: "🌐 別の文でもう一度試す", en: "🌐 Try another sentence" } };
  const frame = { kind: "verify_frame" as const, label: { ja: "🧪 フレームテストで確かめる", en: "🧪 Test with frames" }, why: { ja: "「〜するつもりで」などの枠に入るかを予想して確かめます。", en: "Predict whether each word fits frames like 'on purpose'." } };
  const summary = { kind: "summary" as const, label: { ja: "🏁 まとめて保存する", en: "🏁 Sum up and save" }, why: { ja: "予想どおりでした。わかったことを気づきノートに残します。", en: "It went as predicted. Keep what you found in your notes." } };
  const examples = { kind: "examples" as const, label: { ja: "📝 ジャンルを変えて例文を出す", en: "📝 Examples in another genre" }, why: { ja: "別の場面の例文で、仮説が通じるかを見ます。", en: "See whether the hypothesis holds in other scenes." } };

  switch (last.kind) {
    case "examples":
      return [observe, syntax, hypothesis, examples];
    case "observation":
      return [hypothesis, syntax, observeMore];
    case "syntax":
      return [hypothesis, observeMore, syntax];
    case "hypothesis":
      return [translation, frame, observeMore, syntax];
    case "verify_translation":
    case "verify_frame":
      return verifiedAsPredicted(last) ? [summary, translationAgain, frame, examples] : [revise, translationAgain, examples, summary];
    case "summary":
      return [{ ...examples, why: { ja: "同じ語を別の場面で見て、スキーマを確かめます。", en: "See the same words in another scene to check the schema." } }, observeMore, syntax];
  }
}

/** The syntax role that a selection most likely plays, judged from the guide spans the examples already carry. */
export function suggestRole(s: Sentence, text: string, roleIds: string[]): string | null {
  const hit = (span?: string | null) => !!span && (span.toLowerCase().includes(text.toLowerCase()) || text.toLowerCase().includes(span.toLowerCase()));
  const pick = (...ids: string[]) => ids.find((id) => roleIds.includes(id)) ?? null;
  if (hit(s.target_form)) return pick("V");
  if (hit(s.preposition_phrase)) return pick("PP", "MOD");
  if (hit(s.complement)) return pick("C", "MOD");
  if (hit(s.object)) return pick("O");
  if (hit(s.adverb)) return pick("ADV", "MOD");
  return null;
}
