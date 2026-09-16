import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { useSharedFreeTier } from "@/lib/llm/useQuota";
import { hasSupportLinks } from "@/lib/support";

/**
 * The way to the support page, offered only while the shared free tier is full. It checks the proxy
 * itself rather than trusting the error that led here, and keeps checking, so the link is gone the
 * moment a donation (anyone's) has extended the free tier — and says so, since that is the news the
 * learner was waiting for.
 */
export function SupportOffer({ className = "underline text-muted-foreground" }: { className?: string }) {
  const t = useT();
  const { full, extended } = useSharedFreeTier(hasSupportLinks());
  if (!hasSupportLinks()) return null;
  if (!full) {
    return extended ? (
      <span className="block text-primary">{t({ ja: "🌱 支援が届き、無料枠が広がりました。もう一度試せます。", en: "🌱 A donation came in and the free tier has been extended. You can try again." })}</span>
    ) : null;
  }
  return (
    <Link className={className} to="/support">
      {t({ ja: "💛 投げ銭で、今日の無料枠を広げられます ▶", en: "💛 A donation extends today's free tier ▶" })}
    </Link>
  );
}
