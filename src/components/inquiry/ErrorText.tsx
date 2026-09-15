import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";

/** Renders an error code from describeError() as a readable line. */
export function ErrorText({ code, className = "mt-2 text-sm text-destructive" }: { code: string | null; className?: string }) {
  const t = useT();
  if (!code) return null;
  let body: React.ReactNode = code;
  if (code === "missing-api-key") {
    body = (
      <>
        {t({ ja: "AIの接続先が未設定です。", en: "No AI connection configured." })}{" "}
        <Link className="underline" to="/settings">{t({ ja: "設定で無料枠か自分のAPIキーを選んでください。", en: "Choose the free tier or your own key in Settings." })}</Link>
      </>
    );
  } else if (code === "quota") {
    body = t({ ja: "本日の無料枠を使い切りました。明日また使えます。急ぐ場合は設定で自分のAPIキーに切り替えてください。", en: "Today's free tier is used up. It resets tomorrow, or switch to your own key in Settings." });
  } else if (code.startsWith("parse-failed")) {
    body = t({ ja: "AIの応答を読み取れませんでした。もう一度試してください。", en: "Could not read the AI response. Please try again." }) + ` (${code})`;
  }
  return <p className={className}>{body}</p>;
}
