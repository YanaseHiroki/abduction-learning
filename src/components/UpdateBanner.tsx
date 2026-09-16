import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

// The browser only re-checks sw.js on navigation, and a HashRouter app never navigates:
// an installed app left open for days would otherwise never hear about a new version.
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Offers a newly deployed version instead of switching to it on its own, so a half-typed
 * hypothesis is never lost to a reload the learner did not ask for. Until they accept,
 * the cached version keeps working (offline too).
 */
export function UpdateBanner() {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ onRegisteredSW: (_url, r) => setRegistration(r) });

  useEffect(() => {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) registration.update().catch(() => {}); // offline or a flaky network: try next time
    };
    const onVisible = () => document.visibilityState === "visible" && check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [registration]);

  if (!needRefresh || dismissed) return null;
  return (
    <div role="status" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
      <div className="flex w-full max-w-md flex-wrap items-center gap-2 rounded-lg bg-header px-3 py-2 text-sm text-header-foreground shadow-lg">
        <span className="mr-auto">{t({ ja: "新しい版があります。", en: "A new version is available." })}</span>
        <Button variant="ghost" size="sm" className="text-header-foreground hover:bg-white/15 hover:text-header-foreground" onClick={() => setDismissed(true)}>
          {t({ ja: "あとで", en: "Later" })}
        </Button>
        <Button size="sm" onClick={() => updateServiceWorker()}>
          {t({ ja: "更新する", en: "Update" })}
        </Button>
      </div>
    </div>
  );
}
