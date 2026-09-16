import { Link } from "react-router-dom";
import { useT, type Localized } from "@/lib/i18n";
import { SupportOffer } from "@/components/SupportOffer";
import { cn } from "@/lib/utils";

/**
 * What a provider's HTTP status means for the learner. describeError() formats these as
 * "<provider> <status>: <message>"; without a mapping the raw message alone tells them nothing.
 */
function providerMessage(status: number): Localized | null {
  if (status === 401 || status === 403) {
    return { ja: "APIキーが受け付けられませんでした。\n設定でキーを確かめてください（余分な空白や、別の会社のキーになっていないか）。", en: "The API key was rejected.\nCheck it in Settings (stray spaces, or a key for a different provider)." };
  }
  if (status === 404) {
    return { ja: "そのモデルが見つかりませんでした。\n設定でモデル名を確かめてください。", en: "That model was not found.\nCheck the model name in Settings." };
  }
  if (status === 429) {
    return { ja: "APIの利用制限に達しました。\n少し待ってから、もう一度試してください。", en: "The provider's rate limit was hit.\nWait a moment and try again." };
  }
  if (status === 400 || status === 422) {
    return { ja: "この設定ではAIが応じませんでした。\nモデルを変えるか、例文の数を減らして試してください。", en: "The AI refused this request.\nTry another model, or fewer sentences." };
  }
  if (status >= 500) {
    return { ja: "AI側で問題が起きています。\n少し待ってから、もう一度試してください。", en: "The provider is having trouble.\nWait a moment and try again." };
  }
  if (status === 0) {
    return { ja: "AIに接続できませんでした。\nネットワークを確かめて、もう一度試してください。", en: "Could not reach the provider.\nCheck your connection and try again." };
  }
  return null;
}

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
  } else if (code === "quota-global") {
    // Only here is the day's ceiling the owner's budget rather than this learner's own share,
    // so only here does asking for help make sense.
    body = (
      <>
        {t({ ja: "今日ぶんの無料枠が、利用者全体で尽きました。\n明日また新しい探究を始められます。\n急ぐ場合は設定で自分のAPIキーに切り替えてください。", en: "Today's free inquiries have been used up by everyone together.\nYou can start a new one tomorrow, or switch to your own key in Settings." })}
        {/* Checks the proxy again rather than trusting this error, so it is gone once a donation extends the free tier. */}
        <SupportOffer className="block underline text-muted-foreground" />
      </>
    );
  } else if (code === "quota-inquiry") {
    body = t({ ja: "この探究で無料で使える回数を使い切りました。\n続けるには設定で自分のAPIキーに切り替えてください。", en: "This inquiry has used up its free AI calls.\nSwitch to your own key in Settings to continue." });
  } else if (code === "quota-budget") {
    // The day's money ran out, so even an inquiry under way stops; like quota-global, it is the owner's budget.
    body = (
      <>
        {t({ ja: "今日ぶんの無料枠が、利用者全体で尽きました。\n明日また続けられます。\n急ぐ場合は設定で自分のAPIキーに切り替えてください。", en: "Today's free tier has been used up by everyone together.\nYou can continue tomorrow, or switch to your own key in Settings." })}
        {/* Checks the proxy again rather than trusting this error, so it is gone once a donation extends the free tier. */}
        <SupportOffer className="block underline text-muted-foreground" />
      </>
    );
  } else if (code.startsWith("parse-failed")) {
    body = t({ ja: "AIの応答を読み取れませんでした。\nもう一度試してください。", en: "Could not read the AI response.\nPlease try again." }) + ` (${code})`;
  } else {
    // "anthropic 401: …" from a provider (directly or relayed by the proxy), "proxy 503", or a bare fetch failure.
    const m = /^(?:anthropic|openai|gemini|proxy) (\d+)\b/.exec(code);
    const network = /failed to fetch|networkerror|load failed|network request failed/i.test(code);
    const friendly = providerMessage(m ? Number(m[1]) : network ? 0 : -1);
    if (friendly) {
      body = (
        <>
          {t(friendly)}
          <br />
          <span className="text-xs opacity-70">{code}</span>
        </>
      );
    }
  }
  return <p className={cn("whitespace-pre-line", className)}>{body}</p>;
}
