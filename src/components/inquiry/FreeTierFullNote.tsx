import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { fetchQuota, noNewInquiries, type Quota } from "@/lib/llm/client";
import { useSettings } from "@/lib/settings";
import { hasSupportLinks } from "@/lib/support";

/** On the free tier, says before starting when no more inquiries can be started today (renders nothing otherwise). */
export function FreeTierFullNote({ active = true }: { active?: boolean }) {
  const t = useT();
  const { provider } = useSettings();
  const [quota, setQuota] = useState<Quota | null>(null);
  useEffect(() => {
    if (active && provider === "shared") fetchQuota().then(setQuota);
  }, [active, provider]);
  if (provider !== "shared" || !quota || !noNewInquiries(quota)) return null;
  // Which limit ran out changes what can honestly be said. A device or IP limit is this learner's
  // own daily share and no amount of funding would have raised it, so money is never mentioned
  // there; the global count and the day's budget are the owner's money, which donations move.
  const ownerOut = quota.global.used >= quota.global.limit || quota.budget?.admitting === false;
  return (
    <div className="grid gap-2 text-sm text-destructive">
      <p className="whitespace-pre-line">
        {ownerOut
          ? t({ ja: "今日ぶんの無料枠が、利用者全体で尽きました。\n明日また始められます。\n今日始めた探究は続けられます。\n急ぐ場合は設定で自分のAPIキーに切り替えてください。", en: "Today's free inquiries have been used up by everyone together.\nYou can start another tomorrow; today's inquiries can be continued.\nOr switch to your own key in Settings." })
          : t({ ja: "今日無料で始められる探究の数を使い切りました。\n明日また始められます。\n今日始めた探究は続けられます。\n急ぐ場合は設定で自分のAPIキーに切り替えてください。", en: "You have started today's free inquiries.\nYou can start another tomorrow; today's inquiries can be continued.\nOr switch to your own key in Settings." })}
      </p>
      {ownerOut && hasSupportLinks() && (
        <Link className="underline text-muted-foreground" to="/support">
          {t({ ja: "全体の上限は運営者が出せる額で決まっています ▶", en: "What sets the shared ceiling, and how to help raise it ▶" })}
        </Link>
      )}
    </div>
  );
}
