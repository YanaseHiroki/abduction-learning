import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { hasCredential } from "@/lib/llm/client";
import { useSettings } from "@/lib/settings";

/**
 * Said before an inquiry is started, not after: without a connection the first example set fails,
 * and on the free tier a failed start would still have looked like one of today's inquiries.
 * Renders nothing once a connection is configured.
 */
export function NoCredentialNote() {
  const t = useT();
  useSettings(); // re-check when the learner comes back from Settings
  if (hasCredential()) return null;
  return (
    <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm whitespace-pre-line text-destructive">
      {t({ ja: "AIの接続先がまだ設定されていません。このままでは例文を出せません。", en: "No AI connection is set up yet, so no examples can be generated." })}
      {"\n"}
      <Link className="underline" to="/settings">{t({ ja: "設定で無料枠か自分のAPIキーを選ぶ ▶", en: "Choose the free tier or your own key in Settings ▶" })}</Link>
    </p>
  );
}
