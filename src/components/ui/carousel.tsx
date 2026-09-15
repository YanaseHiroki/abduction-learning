import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { StepDots } from "@/components/ui/step-dots";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Item widths per size. The app-wide rule: never more than three choices on screen at once.
 * "card": 1 (with the next one peeking) on phones, 2 from sm, 3 from lg.
 * "tile": 2 (with a peek) on phones, 3 from sm — for small tiles such as genres.
 */
const sizes = {
  card: { track: "gap-6", item: "basis-[85%] sm:basis-[calc((100%-1.5rem)/2)] lg:basis-[calc((100%-3rem)/3)]" },
  tile: { track: "gap-3", item: "basis-[42%] sm:basis-[calc((100%-1.5rem)/3)]" },
};

/**
 * A row of choices that scrolls sideways (scroll-snap) when there are more than fit,
 * with ◀ ▶ buttons and position dots underneath. When everything fits, it is just a row.
 */
export function Carousel({ children, size = "card", className }: { children: ReactNode; size?: keyof typeof sizes; className?: string }) {
  const t = useT();
  const track = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const [pos, setPos] = useState({ index: 0, positions: 1 });

  const measure = useCallback(() => {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    const visible = Math.max(1, Math.floor((el.clientWidth + 1) / step));
    const positions = Math.max(1, items.length - visible + 1);
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    const index = atEnd ? positions - 1 : Math.min(positions - 1, Math.round(el.scrollLeft / step));
    setPos((p) => (p.index === index && p.positions === positions ? p : { index, positions }));
  }, [items.length]);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Where the last ◀ ▶ press is heading, so quick repeated presses add up instead of restarting mid-scroll.
  const target = useRef<{ index: number; timer: number } | null>(null);
  function go(dir: -1 | 1) {
    const el = track.current;
    const first = el?.firstElementChild as HTMLElement | null;
    if (!el || !first) return;
    const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
    const from = target.current?.index ?? Math.round(el.scrollLeft / step);
    const index = Math.max(0, Math.min(pos.positions - 1, from + dir));
    if (target.current) clearTimeout(target.current.timer);
    target.current = { index, timer: window.setTimeout(() => (target.current = null), 500) };
    el.scrollTo({ left: index === pos.positions - 1 ? el.scrollWidth : index * step, behavior: "smooth" });
  }

  const scrollable = pos.positions > 1;
  return (
    <div className={cn("min-w-0", className)}>
      <div
        ref={track}
        onScroll={measure}
        // pt-3/pr-4 leave room for the tilted "recommended" badge, which the scroll box would otherwise clip.
        className={cn("-mx-1 flex snap-x snap-mandatory scroll-px-1 overflow-x-auto px-1 pt-3 pr-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", sizes[size].track)}
      >
        {items.map((child, i) => (
          <div key={i} className={cn("flex shrink-0 snap-start *:flex-1", sizes[size].item)}>{child}</div>
        ))}
      </div>
      {scrollable && (
        <div className="flex items-center justify-center gap-4 pt-3">
          <Button variant="outline" size="icon-sm" aria-label={t({ ja: "前へ", en: "Previous" })} disabled={pos.index === 0} onClick={() => go(-1)}>{"◀\uFE0E"}</Button>
          <StepDots total={pos.positions} current={pos.index} />
          <Button variant="outline" size="icon-sm" aria-label={t({ ja: "次へ", en: "Next" })} disabled={pos.index === pos.positions - 1} onClick={() => go(1)}>{"▶\uFE0E"}</Button>
        </div>
      )}
    </div>
  );
}
