import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { exportAll, importAll } from "@/lib/backup";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { fetchQuota, PROXY_URL, type Quota } from "@/lib/llm/client";
import { providerMeta, type Provider } from "@/lib/llm/providers";
import { setProviderSettings, setSettings, useSettings } from "@/lib/settings";

const providers: Provider[] = ["anthropic", "openai", "gemini"];

function QuotaView() {
  const t = useT();
  const [q, setQ] = useState<Quota | null | undefined>(undefined);
  useEffect(() => {
    fetchQuota().then(setQ);
  }, []);
  if (!PROXY_URL) {
    return <p className="text-sm text-muted-foreground">{t({ ja: "このデプロイでは無料枠が設定されていません。自分のAPIキーを使ってください。", en: "This deployment has no free tier. Use your own key." })}</p>;
  }
  if (q === undefined) return <p className="text-sm text-muted-foreground">…</p>;
  if (q === null) return <p className="text-sm text-destructive">{t({ ja: "無料枠サーバーに接続できませんでした。", en: "Could not reach the free-tier server." })}</p>;
  const row = (label: string, v: { used: number; limit: number }) => (
    <div className="flex justify-between text-sm">
      <span>{label}</span>
      <span className="tabular-nums">{v.limit - v.used} / {v.limit}</span>
    </div>
  );
  return (
    <div className="space-y-1 rounded-lg border p-3">
      <div className="mb-1 text-xs text-muted-foreground">{t({ ja: "今日の残り回数（AI呼び出し）", en: "Remaining AI calls today" })} · {q.model}</div>
      {row(t({ ja: "この端末", en: "This device" }), q.device)}
      {row(t({ ja: "全体", en: "Everyone" }), q.global)}
      <p className="pt-1 text-xs text-muted-foreground">{t({ ja: "例文セット1回 = 1〜2回（文法チェックあり）、翻訳テスト1回 = 1回。1日の目安は探究1つ分です。", en: "One example set = 1–2 calls (with QA), one translation test = 1 call. Roughly one inquiry per day." })}</p>
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const s = useSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">{t({ ja: "設定", en: "Settings" })}</h1>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "AIの接続先", en: "AI connection" })}</h2>
        <p className="text-sm text-muted-foreground">{t({ ja: "開いているタブの設定が使われます。自分のキーはこのブラウザの localStorage にだけ保存され、各社のAPIへ直接送られます。共用のPCでは使い終わったら消してください。", en: "The open tab is the one in use. Your own keys are stored only in this browser's localStorage and sent directly to each provider. Clear them on shared computers." })}</p>
        <Tabs value={s.provider} onValueChange={(v) => setSettings({ provider: v as Provider | "shared" })}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="shared">{t({ ja: "無料枠", en: "Free tier" })}</TabsTrigger>
            {providers.map((p) => <TabsTrigger key={p} value={p}>{providerMeta[p].label}</TabsTrigger>)}
          </TabsList>
          <TabsContent value="shared" className="space-y-2 pt-2">
            <p className="text-sm">{t({ ja: "運営者が用意した安価なモデルを、回数制限つきで無料で使えます。キーの用意は不要です。", en: "Use an inexpensive model provided by the site owner, free with a daily limit. No key needed." })}</p>
            <QuotaView />
          </TabsContent>
          {providers.map((p) => (
            <TabsContent key={p} value={p} className="space-y-3 pt-2">
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label>API key</Label>
                  <a href={providerMeta[p].keysUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline">
                    {t({ ja: "APIキーを発行するページ", en: "Get an API key" })} <ExternalLink className="size-3" />
                  </a>
                </div>
                <Input type="password" autoComplete="off" value={s.providers[p].apiKey} onChange={(e) => setProviderSettings(p, { apiKey: e.target.value.trim() })} />
              </div>
              <div className="grid gap-1.5">
                <Label>{t({ ja: "モデル", en: "Model" })}</Label>
                <div className="flex gap-2">
                  <Select items={providerMeta[p].models.map((m) => ({ value: m, label: m }))} value={providerMeta[p].models.includes(s.providers[p].model) ? s.providers[p].model : "__custom"} onValueChange={(v) => v && v !== "__custom" && setProviderSettings(p, { model: v })}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {providerMeta[p].models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input className="flex-1" value={s.providers[p].model} onChange={(e) => setProviderSettings(p, { model: e.target.value.trim() })} placeholder={providerMeta[p].defaultModel} />
                </div>
                <p className="text-xs text-muted-foreground">{t({ ja: "右の欄に直接モデル名を書けば、一覧にないモデルも使えます。", en: "Type any model name on the right to use one not in the list." })}</p>
              </div>
            </TabsContent>
          ))}
        </Tabs>
        <label className="flex items-center justify-between text-sm">
          <span>{t({ ja: "生成した例文を安価なモデルで文法チェックし、怪しい文に「？」を付ける", en: "Check generated sentences with a cheap model and flag suspicious ones" })}</span>
          <Switch checked={s.qaEnabled} onCheckedChange={(v) => setSettings({ qaEnabled: v })} />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "表示", en: "Display" })}</h2>
        <div className="grid gap-1.5">
          <Label>{t({ ja: "UIの言語", en: "UI language" })}</Label>
          <Select items={[{ value: "ja", label: "日本語" }, { value: "en", label: "English" }]} value={s.uiLang} onValueChange={(v) => v && setSettings({ uiLang: v as "ja" | "en" })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ja">日本語</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
          </Select>
        </div>
        <label className="flex items-center justify-between text-sm">
          <span>{t({ ja: "例文の訳を最初から表示する", en: "Show translations by default" })}</span>
          <Switch checked={s.showTranslations} onCheckedChange={(v) => setSettings({ showTranslations: v })} />
        </label>
        <div className="grid gap-1.5">
          <Label>{t({ ja: "読み上げ速度", en: "Speech rate" })} ({s.ttsRate})</Label>
          <input type="range" min={0.5} max={1.5} step={0.05} value={s.ttsRate} onChange={(e) => setSettings({ ttsRate: Number(e.target.value) })} />
          <p className="text-xs text-muted-foreground">{t({ ja: "読み上げはブラウザ内蔵の音声を使います（無料・トークン消費なし）。声の質と対応言語はOSによります。", en: "Speech uses the browser's built-in voices (free, no tokens). Quality and languages depend on the OS." })}</p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "データ", en: "Data" })}</h2>
        <p className="text-sm text-muted-foreground">{t({ ja: "すべての探究はこのブラウザの中（IndexedDB）にだけ保存されます。別の端末に持っていくときや、念のためのバックアップにはJSONの書き出しを使ってください。", en: "All inquiries live only in this browser (IndexedDB). Export JSON to move to another device or as a backup." })}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportAll}>{t({ ja: "JSONに書き出す", en: "Export JSON" })}</Button>
          <Button variant="outline" onClick={() => document.getElementById("import-file")?.click()}>{t({ ja: "JSONを読み込む", en: "Import JSON" })}</Button>
          <input id="import-file" type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const n = await importAll(f); alert(t({ ja: `${n} 件の探究を読み込みました`, en: `Imported ${n} inquiries` })); } e.target.value = ""; }} />
        </div>
        <Button variant="destructive" onClick={async () => { if (confirm(t({ ja: "すべての探究・ノートを削除しますか？", en: "Delete all inquiries and notes?" }))) { await db.delete(); location.reload(); } }}>
          {t({ ja: "すべて削除", en: "Delete everything" })}
        </Button>
      </section>
    </div>
  );
}
