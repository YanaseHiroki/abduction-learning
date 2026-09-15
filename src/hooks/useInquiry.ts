import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Card, HypothesisPayload } from "@/lib/types";

export function useInquiry(id: string | undefined) {
  return useLiveQuery(() => (id ? db.inquiries.get(id) : undefined), [id]);
}

export function useCards(inquiryId: string | undefined) {
  return useLiveQuery(
    () => (inquiryId ? db.cards.where("inquiryId").equals(inquiryId).sortBy("createdAt") : Promise.resolve([] as Card[])),
    [inquiryId],
  );
}

export function latestHypothesis(cards: Card[] | undefined): Card<"hypothesis"> | null {
  if (!cards) return null;
  const hs = cards.filter((c): c is Card<"hypothesis"> => c.kind === "hypothesis");
  if (!hs.length) return null;
  return hs.reduce((a, b) => ((b.payload as HypothesisPayload).version > a.payload.version ? b : a));
}

export function useSelectionIn(ref: React.RefObject<HTMLElement | null>) {
  // Returns the current text selection if it lies inside the referenced element.
  // Implemented as a plain function to keep re-renders under control; callers poll on mouseup/touchend.
  return () => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || !ref.current) return null;
    const text = sel.toString().trim();
    if (!text) return null;
    const node = sel.anchorNode;
    if (!node || !ref.current.contains(node)) return null;
    const el = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement))?.closest<HTMLElement>("[data-skey]");
    if (!el) return null;
    return { text, sentenceKey: el.dataset.skey!, targetId: el.dataset.target!, side: (el.dataset.side ?? "l2") as "l1" | "l2" };
  };
}
