import { Children, useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StepDots } from "@/components/ui/step-dots";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Layout per size, as CSS variables on the root. The app-wide rule: never more than three choices on screen at once.
 * --n: items fully in view — "card": 1 on phones, 2 from sm, 3 from lg; "tile" (small tiles such as genres): 2, then 3 from sm.
 * --peek: how much of the neighbouring item shows at each edge when there are more than fit, so it is clear the row goes on.
 * track: pt-6 on cards leaves room for the tilted "recommended" badge, which the scroll box would otherwise clip.
 */
const sizes = {
  card: { root: "[--n:1] sm:[--n:2] lg:[--n:3] [--gap:1rem] lg:[--gap:1.5rem] [--peek:1.25rem]", track: "pt-6" },
  tile: { root: "[--n:2] sm:[--n:3] [--gap:0.75rem] [--peek:1.25rem]", track: "pt-3" },
};

// The track bleeds 4px past the root on both sides (-mx-1 px-1, room for focus rings) and keeps 16px at its end (pr-4, room for the badge).
// Scrolling: --n items plus a --peek sliver of each neighbour fill the scroll box exactly. Not scrolling: the items just share the row.
const basis = {
  scrolling: "calc((100cqw + 8px - 2 * var(--peek) - (var(--n) + 1) * var(--gap)) / var(--n))",
  still: "calc((100cqw - 12px - (var(--n) - 1) * var(--gap)) / var(--n))",
};

/**
 * A row of choices that scrolls sideways (scroll-snap) when there are more than fit, with the neighbours
 * peeking in at the edges, ◀ ▶ buttons and position dots underneath. When everything fits, it is just a row.
 */
export function Carousel({ children, size = "card", className }: { children: ReactNode; size?: keyof typeof sizes; className?: string }) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const [pos, setPos] = useState({ index: 0, positions: 1 });

  /** Distance between neighbouring items, and how far left of an item the scroll stops so the previous one peeks in. */
  function metrics(el: HTMLElement) {
    const first = el.firstElementChild as HTMLElement;
    const style = getComputedStyle(el);
    const gap = parseFloat(style.columnGap || "0");
    const peek = parseFloat(getComputedStyle(root.current!).getPropertyValue("--peek")) * parseFloat(getComputedStyle(document.documentElement).fontSize);
    return { step: first.offsetWidth + gap, lead: peek + gap - parseFloat(style.paddingLeft || "0") };
  }

  const measure = useCallback(() => {
    const el = track.current;
    if (!el?.firstElementChild || !root.current) return;
    const visible = parseInt(getComputedStyle(root.current).getPropertyValue("--n")) || 1;
    const positions = Math.max(1, items.length - visible + 1);
    const { step, lead } = metrics(el);
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    const index = atEnd ? positions - 1 : Math.min(positions - 1, Math.round((el.scrollLeft + lead) / step));
    setPos((p) => (p.index === index && p.positions === positions ? p : { index, positions }));
  }, [items.length]);

  useLayoutEffect(() => {
    if (!root.current) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root.current);
    return () => ro.disconnect();
  }, [measure]);

  // Where the last ◀ ▶ press is heading, so quick repeated presses add up instead of restarting mid-scroll.
  const target = useRef<{ index: number; timer: number } | null>(null);
  function go(dir: -1 | 1) {
    const el = track.current;
    if (!el?.firstElementChild) return;
    const { step, lead } = metrics(el);
    const from = target.current?.index ?? pos.index;
    const index = Math.max(0, Math.min(pos.positions - 1, from + dir));
    if (target.current) clearTimeout(target.current.timer);
    target.current = { index, timer: window.setTimeout(() => (target.current = null), 500) };
    const left = index === 0 ? 0 : index === pos.positions - 1 ? el.scrollWidth : index * step - lead;
    el.scrollTo({ left, behavior: "smooth" });
  }

  const scrollable = pos.positions > 1;
  const itemStyle: CSSProperties = { flexBasis: scrollable ? basis.scrolling : basis.still };
  return (
    <div ref={root} className={cn("@container min-w-0", sizes[size].root, className)}>
      <div
        ref={track}
        onScroll={measure}
        // Snapping stops each item one peek + gap from the left edge, so the previous item shows too (the first item still sits flush).
        style={{ scrollPaddingLeft: "calc(var(--peek) + var(--gap))" }}
        className={cn("-mx-1 flex snap-x snap-mandatory gap-(--gap) overflow-x-auto px-1 pr-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", sizes[size].track)}
      >
        {items.map((child, i) => (
          <div key={i} style={itemStyle} className="flex shrink-0 snap-start *:flex-1">{child}</div>
        ))}
      </div>
      {scrollable && (
        <div className="flex items-center justify-center gap-4 pt-3">
          <Button variant="outline" size="icon-sm" aria-label={t({ ja: "前へ", en: "Previous" })} disabled={pos.index === 0} onClick={() => go(-1)}>{"◀︎"}</Button>
          <StepDots total={pos.positions} current={pos.index} />
          <Button variant="outline" size="icon-sm" aria-label={t({ ja: "次へ", en: "Next" })} disabled={pos.index === pos.positions - 1} onClick={() => go(1)}>{"▶︎"}</Button>
        </div>
      )}
    </div>
  );
}
