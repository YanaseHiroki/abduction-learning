import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { Disclosure } from "@/components/ui/disclosure";
import { useT } from "@/lib/i18n";
import { PROXY_URL, type Quota } from "@/lib/llm/client";
import { useSharedFreeTier } from "@/lib/llm/useQuota";
import { COST_PER_INQUIRY_USD, dailyBudget, SUPPORT_GITHUB, SUPPORT_KOFI } from "@/lib/support";

/** What the day's ceiling costs the owner — the point of the page in one line. */
function Budget({ q }: { q: Quota | null | undefined }) {
  const t = useT();
  if (!q) return null;
  const { usd, capped } = dailyBudget(q);
  const donated = q.rules.donatedUsd ?? 0;
  return (
    <div className="rounded-lg border p-3 text-sm">
      {capped && (
        <div className="flex justify-between">
          <span>{t({ ja: "1日のAIの費用の上限", en: "Daily AI spending cap" })}</span>
          <span className="tabular-nums">${usd}</span>
        </div>
      )}
      {donated > 0 && (
        <div className="flex justify-between">
          <span>{t({ ja: "　うち支援で広がった分（残り）", en: "  of which donations add (unspent)" })}</span>
          <span className="tabular-nums">${donated.toFixed(2)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span>{t({ ja: "全体で1日に始められる探究", en: "Inquiries everyone can start per day" })}</span>
        <span className="tabular-nums">{q.global.limit}</span>
      </div>
      <div className="flex justify-between">
        <span>{t({ ja: "今日の残り", en: "Left today" })}</span>
        <span className="tabular-nums">{Math.max(q.global.limit - q.global.used, 0)}</span>
      </div>
      <p className="pt-2 text-xs whitespace-pre-line text-muted-foreground">
        {capped
          ? t({
              ja: `無料枠のAIの費用は、全体で1日 $${usd} を超えないよう止めています。
探究1つは平均 $${COST_PER_INQUIRY_USD} ほどです。
この上限は運営者が出せる額そのもので、原資が増えた分だけ引き上げられます。`,
              en: `The free tier stops before AI costs pass $${usd} a day, for everyone together.
One inquiry costs about $${COST_PER_INQUIRY_USD} on average.
The ceiling is exactly what the owner can pay, and it rises with the funding behind it.`,
            })
          : t({
              ja: `探究1つにかかるAIの費用は平均 $${COST_PER_INQUIRY_USD}、全体で1日およそ $${usd} です。
この上限は運営者が出せる額そのもので、原資が増えた分だけ引き上げられます。`,
              en: `One inquiry costs about $${COST_PER_INQUIRY_USD} in AI calls, so a full day costs roughly $${usd}.\nThe ceiling is exactly what the owner can pay, and it rises with the funding behind it.`,
            })}
      </p>
    </div>
  );
}

/**
 * Asks for help with the free tier's running costs. Donations happen entirely on GitHub Sponsors
 * or Ko-fi: this page only links out, so no payment details ever reach the app. The services tell
 * the proxy about each payment, which adds it to the shared budget on its own (docs/funding.md).
 * Nothing here is sold — a donation raises the shared ceiling for everyone and buys the donor
 * no extra inquiries of their own, which the copy has to keep saying plainly.
 *
 * The buttons to give appear only while the shared free tier is full: that is the one moment a
 * donation changes anything anyone can see, and they vanish as soon as one has extended it.
 */
export function SupportPage() {
  const t = useT();
  const [feedback, setFeedback] = useState(false);
  const { quota: q, full, extended } = useSharedFreeTier(!!PROXY_URL);
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">{t({ ja: "💛 無料枠を支える", en: "💛 Support the free tier" })}</h1>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "🧮 無料枠のしくみ", en: "🧮 What the free tier costs" })}</h2>
        <p className="text-sm whitespace-pre-line">
          {t({
            ja: "無料枠のAIは、運営者が自分で払っているAPIキーで動いています。\n1日に始められる探究の数は、運営者が出せる額から逆算した安全弁です。",
            en: "The free tier runs on an API key the site owner pays for.\nThe number of inquiries that can be started each day is worked back from what the owner can afford.",
          })}
        </p>
        {PROXY_URL && <Budget q={q} />}
      </section>

      {(SUPPORT_GITHUB || SUPPORT_KOFI) && extended && (
        <section className="rounded-xl border border-primary bg-card p-4 text-sm whitespace-pre-line">
          {t({ ja: "🌱 支援が届き、今日の無料枠が広がりました。\n探究に戻って続けられます。ありがとうございました。", en: "🌱 A donation came in and today's free tier has been extended.\nYou can go back to your inquiry. Thank you." })}
        </section>
      )}

      {(SUPPORT_GITHUB || SUPPORT_KOFI) && full && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{t({ ja: "💳 お金で支える", en: "💳 Chip in" })}</h2>
          <p className="text-sm whitespace-pre-line">
            {t({
              ja: "今日の無料枠は、利用者全体で使い切りました。\n少額の単発で十分です。支払いが済むと、手数料を除いた額が自動で無料枠に加わり、数十秒ほどでまた始められるようになります。\n今日使われなかった分は、次に無料枠が尽きた日に回ります。",
              en: "Today's free tier has been used up by everyone together.\nA one-off, however small, is plenty. Once the payment goes through, what is left after fees is added to the free tier automatically, and inquiries can start again within a minute or so.\nWhatever today does not use is kept for the next day the free tier runs out.",
            })}
          </p>
          <ButtonRow>
            {SUPPORT_GITHUB && (
              <Button render={<a href={SUPPORT_GITHUB} target="_blank" rel="noreferrer" />} nativeButton={false}>
                {t({ ja: "GitHub Sponsors で支援する", en: "Give on GitHub Sponsors" })} <ExternalLink className="size-4" />
              </Button>
            )}
            {SUPPORT_KOFI && (
              <Button variant="outline" render={<a href={SUPPORT_KOFI} target="_blank" rel="noreferrer" />} nativeButton={false}>
                {t({ ja: "Ko-fi で支援する（登録不要）", en: "Give on Ko-fi (no account needed)" })} <ExternalLink className="size-4" />
              </Button>
            )}
          </ButtonRow>
          {/* Saying this before they give, not after: a donation that quietly bought nothing would feel like a trick. */}
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {t({
              ja: "支援しても、あなた自身が1日に始められる探究の数は増えません。増えるのは全体の上限です。\n見返りやお礼の品はありません。決済はすべて各サービス側で行われ、このアプリはカード情報も支援者の記録も受け取りません。",
              en: "Giving does not raise your own daily allowance — it raises the ceiling everyone shares.\nThere are no rewards or perks. Payment happens entirely on those services; this app never sees card details or any record of who gave.",
            })}
          </p>
        </section>
      )}

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "🔑 お金を使わずに支える", en: "🔑 Helping without money" })}</h2>
        <p className="text-sm whitespace-pre-line">
          {t({
            ja: "設定で自分のAPIキーに切り替えて使うのも、立派な支援です。その分の費用は無料枠の原資から出ないので、全体の枠がそのまま他の人に残ります。",
            en: "Switching to your own API key in Settings helps just as much: your usage stops drawing on the shared pool, leaving that much of it for everyone else.",
          })}
        </p>
        <Link className="text-sm underline" to="/settings">{t({ ja: "設定でAPIキーを入れる ▶", en: "Set up your own key in Settings ▶" })}</Link>
        <Disclosure label={t({ ja: "🔒 APIキーの提供をお受けしていない理由", en: "🔒 Why we don't take donated API keys" })}>
          <p className="text-sm whitespace-pre-line text-muted-foreground">
            {t({
              ja: "デポジット済みのAPIキーを預かるお申し出をいただくことがありますが、お受けしていません。\n預かった鍵が万一漏れた場合、費用を負うのは提供者であって運営者ではなく、その責任を引き受けられないためです。\n支援したい場合は、上の寄付か、自分のキーでの利用をお願いします。",
              en: "We are sometimes offered a funded API key to use. We don't accept them.\nIf a key we hold ever leaked, the bill would land on whoever gave it, not on us — and that is not a risk we can ask anyone to take.\nPlease give money instead, or simply use your own key.",
            })}
          </p>
        </Disclosure>
      </section>

      {PROXY_URL && (
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="font-semibold">{t({ ja: "✉️ 相談する", en: "✉️ Talk to us" })}</h2>
          <p className="text-sm whitespace-pre-line">
            {t({
              ja: "継続的な支援やまとまった支援を考えている場合、使い道や上限の決め方について聞きたい場合は、メールでご相談ください。",
              en: "Thinking about giving regularly or in a larger amount, or want to ask how the money is used and how the ceiling is set? Write to us.",
            })}
          </p>
          <Button variant="outline" onClick={() => setFeedback(true)}>{t({ ja: "💛 支援について相談する", en: "💛 Ask about supporting" })}</Button>
          <FeedbackDialog open={feedback} onOpenChange={setFeedback} initialKind="support" />
        </section>
      )}
    </div>
  );
}
