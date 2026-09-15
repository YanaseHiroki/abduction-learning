import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Renders an error code from describeError() as a readable line. */
export function ErrorText({ code, className = "mt-2 text-sm text-destructive" }: { code: string | null; className?: string }) {
  const t = useT();
  if (!code) return null;
  let body: React.ReactNode = code;
  if (code === "missing-api-key") {
    body = (
      <>
        {t({ ja: "AIの接続先が未設定です。", en: "No AI connection configured." })}
        <br />
        <Link className="underline" to="/settings">{t({ ja: "設定で無料枠か自分のAPIキーを選んでください。", en: "Choose the free tier or your own key in Settings." })}</Link>
      </>
    );
  } else if (code === "quota") {
    body = t({ ja: "今日無料で始められる探究の数を使い切りました。\n明日また新しい探究を始められます。\n急ぐ場合は設定で自分のAPIキーに切り替えてください。", en: "You have started today's free inquiries.\nYou can start a new one tomorrow, or switch to your own key in Settings." });
  } else if (code === "quota-inquiry") {
    body = t({ ja: "この探究で無料で使える回数を使い切りました。\n続けるには設定で自分のAPIキーに切り替えてください。", en: "This inquiry has used up its free AI calls.\nSwitch to your own key in Settings to continue." });
  } else if (code.startsWith("parse-failed")) {
    body = t({ ja: "AIの応答を読み取れませんでした。\nもう一度試してください。", en: "Could not read the AI response.\nPlease try again." }) + ` (${code})`;
  }
  return <p className={cn("whitespace-pre-line", className)}>{body}</p>;
}
