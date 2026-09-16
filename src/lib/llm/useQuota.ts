import { useEffect, useState } from "react";
import { fetchQuota, sharedFreeTierFull, type Quota } from "./client";

/** How often to look again while the shared free tier is full: a donation extends it within seconds of the payment. */
export const FULL_POLL_MS = 15_000;

/**
 * The proxy's quota, kept current. Anything offering a donation shows it only while the shared free
 * tier is full, and the donation happens in another tab: so look again when the learner comes back,
 * and keep looking while it is full, so the offer disappears as soon as the donation has extended it.
 * `undefined` while loading, `null` when there is no proxy or it cannot be reached.
 */
export function useQuota(active = true): Quota | null | undefined {
  const [quota, setQuota] = useState<Quota | null | undefined>(undefined);
  const full = !!quota && sharedFreeTierFull(quota);
  useEffect(() => {
    if (!active) return;
    let live = true;
    const load = () => fetchQuota().then((q) => live && setQuota(q));
    const onVisible = () => document.visibilityState === "visible" && load();
    load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    const timer = full ? window.setInterval(load, FULL_POLL_MS) : undefined;
    return () => {
      live = false;
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [active, full]);
  return quota;
}

/**
 * The quota, whether the shared free tier is full, and whether it was full earlier on this screen but
 * no longer is — which, short of midnight, means a donation has just extended it.
 */
export function useSharedFreeTier(active = true): { quota: Quota | null | undefined; full: boolean; extended: boolean } {
  const quota = useQuota(active);
  const full = !!quota && sharedFreeTierFull(quota);
  // Adjusting state while rendering, React's pattern for remembering something about earlier renders.
  const [wasFull, setWasFull] = useState(false);
  if (full && !wasFull) setWasFull(true);
  return { quota, full, extended: wasFull && !!quota && !full };
}
