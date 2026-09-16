import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { fetchQuota, noNewInquiries, type Quota } from "@/lib/llm/client";
import { useSettings } from "@/lib/settings";

/** On the free tier, says before starting when no more inquiries can be started today (renders nothing otherwise). */
export function FreeTierFullNote({ active = true }: { active?: boolean }) {
  const t = useT();
  const { provider } = useSettings();
  const [quota, setQuota] = useState<Quota | null>(null);
  useEffect(() => {
    if (active && provider === "shared") fetchQuota().then(setQuota);
  }, [active, provider]);
  const full = provider === "shared" && !!quota && noNewInquiries(quota);
  if (!full) return null;
  return (
    <p className="text-sm whitespace-pre-line text-destructive">
      {t({ ja: "今日無料で始められる探究の数を使い切りました。\n明日また始められます。\n今日始めた探究は続けられます。\n急ぐ場合は設定で自分のAPIキーに切り替えてください。", en: "You have started today's free inquiries.\nYou can start another tomorrow; today's inquiries can be continued.\nOr switch to your own key in Settings." })}
    </p>
  );
}
