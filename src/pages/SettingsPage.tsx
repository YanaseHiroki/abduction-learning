import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonRow } from "@/components/ui/button-row";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsPanels, TabsTrigger } from "@/components/ui/tabs";
import { exportAll, importAll } from "@/lib/backup";
import { db } from "@/lib/db";
import { useT } from "@/lib/i18n";
import { fetchQuota, PROXY_URL, type Quota } from "@/lib/llm/client";
import { providerMeta, type Provider } from "@/lib/llm/providers";
import { setProviderSettings, setSettings, useSettings, type Theme } from "@/lib/settings";

const providers: Provider[] = ["anthropic", "openai", "gemini"];
// The default pressed style (--muted) hardly shows on the section gray, so fill the chosen theme instead.
const themeItem = "aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground";

function QuotaView() {
  const t = useT();
  const [q, setQ] = useState<Quota | null | undefined>(undefined);
  useEffect(() => {
    fetchQuota().then(setQ);
  }, []);
  if (!PROXY_URL) {
    return <p className="text-sm whitespace-pre-line text-muted-foreground">{t({ ja: "このデプロイでは無料枠が設定されていません。\n自分のAPIキーを使ってください。", en: "This deployment has no free tier.\nUse your own key." })}</p>;
  }
  if (q === undefined) return <p className="text-sm text-muted-foreground">…</p>;
  if (q === null) return <p className="text-sm text-destructive">{t({ ja: "無料枠サーバーに接続できませんでした。", en: "Could not reach the free-tier server." })}</p>;
  const row = (label: string, v: { used: number; limit: number }) => (
    <div className="flex justify-between text-sm">
      <span>{label}</span>
      <span className="tabular-nums">{v.limit - v.used} / {v.limit}</span>
    </div>
  );
  const r = q.rules;
  return (
    <div className="space-y-1 rounded-lg border p-3">
      <div className="mb-1 text-xs text-muted-foreground">{t({ ja: "今日無料で始められる探究の数", en: "Free inquiries you can start today" })} · {q.model}</div>
      {row(t({ ja: "この端末", en: "This device" }), q.device)}
      {row(t({ ja: "全体", en: "Everyone" }), q.global)}
      <p className="pt-2 text-xs whitespace-pre-line text-muted-foreground">
        {t({
          ja: `初めて使う日は${r.deviceFirstDay}つ、2日目からは1日${r.device}つ始められます。\n始めた探究では、AIを${r.perInquiry}回まで呼び出せます（ふつうは15〜30回で足ります）。\n始めた探究は${r.ttlDays}日間、日をまたいでも続けられます。`,
          en: `You can start ${r.deviceFirstDay} on your first day, then ${r.device} per day.\nEach inquiry may call the AI up to ${r.perInquiry} times (15–30 is typical).\nA started inquiry stays open for ${r.ttlDays} days, across midnight.`,
        })}
      </p>
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const s = useSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">{t({ ja: "⚙️ 設定", en: "⚙️ Settings" })}</h1>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "🤖 AIの接続先", en: "🤖 AI connection" })}</h2>
        <p className="text-sm whitespace-pre-line text-muted-foreground">{t({ ja: "開いているタブの設定が使われます。\n自分のキーはこのブラウザの localStorage にだけ保存され、各社のAPIへ直接送られます。\n共用のPCでは使い終わったら消してください。", en: "The open tab is the one in use.\nYour own keys are stored only in this browser's localStorage and sent directly to each provider.\nClear them on shared computers." })}</p>
        <Tabs value={s.provider} onValueChange={(v) => setSettings({ provider: v as Provider | "shared" })}>
          <TabsList variant="fitted">
            <TabsTrigger value="shared">{t({ ja: "無料枠", en: "Free tier" })}</TabsTrigger>
            {providers.map((p) => <TabsTrigger key={p} value={p}>{providerMeta[p].label}</TabsTrigger>)}
          </TabsList>
          <TabsPanels>
            <TabsContent value="shared" className="space-y-2">
              <p className="text-sm whitespace-pre-line">{t({ ja: "運営者が用意した安価なモデルを、回数制限つきで無料で使えます。\nキーの用意は不要です。", en: "Use an inexpensive model provided by the site owner, free with a daily limit.\nNo key needed." })}</p>
              <QuotaView />
            </TabsContent>
            {providers.map((p) => (
              <TabsContent key={p} value={p} className="space-y-3">
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
          </TabsPanels>
        </Tabs>
        <label className="flex items-center justify-between gap-4 pt-2">
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{t({ ja: "✅ 文法ダブルチェック", en: "✅ Grammar double-check" })}</span>
            <span className="text-xs text-muted-foreground">{t({ ja: "生成した例文を安価なモデルで文法チェックし、怪しい文に「？」を付けます。", en: "Checks generated sentences with a cheap model and flags suspicious ones with “?”." })}</span>
          </span>
          <Switch checked={s.qaEnabled} onCheckedChange={(v) => setSettings({ qaEnabled: v })} />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "🎨 表示", en: "🎨 Display" })}</h2>
        <div className="grid gap-1.5">
          <Label>{t({ ja: "UIの言語", en: "UI language" })}</Label>
          <Select items={[{ value: "ja", label: "日本語" }, { value: "en", label: "English" }]} value={s.uiLang} onValueChange={(v) => v && setSettings({ uiLang: v as "ja" | "en" })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="ja">日本語</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>{t({ ja: "テーマ", en: "Theme" })}</Label>
          <ToggleGroup value={[s.theme]} onValueChange={(v) => v[0] && setSettings({ theme: v[0] as Theme })} variant="outline" className="w-fit">
            <ToggleGroupItem value="light" className={themeItem}>{t({ ja: "☀️ ライト", en: "☀️ Light" })}</ToggleGroupItem>
            <ToggleGroupItem value="dark" className={themeItem}>{t({ ja: "🌙 ダーク", en: "🌙 Dark" })}</ToggleGroupItem>
            <ToggleGroupItem value="system" className={themeItem}>{t({ ja: "💻 OSに合わせる", en: "💻 Match OS" })}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <label className="flex items-center justify-between text-sm">
          <span>{t({ ja: "例文の訳を最初から表示する", en: "Show translations by default" })}</span>
          <Switch checked={s.showTranslations} onCheckedChange={(v) => setSettings({ showTranslations: v })} />
        </label>
        <div className="grid gap-1.5">
          <Label>{t({ ja: "読み上げ速度", en: "Speech rate" })} ({s.ttsRate})</Label>
          <input type="range" min={0.5} max={1.5} step={0.05} value={s.ttsRate} onChange={(e) => setSettings({ ttsRate: Number(e.target.value) })} />
          <p className="text-xs whitespace-pre-line text-muted-foreground">{t({ ja: "読み上げはブラウザ内蔵の音声を使います（無料・トークン消費なし）。\n声の質と対応言語はOSによります。", en: "Speech uses the browser's built-in voices (free, no tokens).\nQuality and languages depend on the OS." })}</p>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "💾 データ", en: "💾 Data" })}</h2>
        <p className="text-sm whitespace-pre-line text-muted-foreground">{t({ ja: "すべての探究はこのブラウザの中（IndexedDB）にだけ保存されます。\n別の端末に持っていくときや、念のためのバックアップにはJSONの書き出しを使ってください。", en: "All inquiries live only in this browser (IndexedDB).\nExport JSON to move to another device or as a backup." })}</p>
        <ButtonRow className="pt-3">
          <Button variant="outline" onClick={exportAll}>{t({ ja: "JSONに書き出す", en: "Export JSON" })}</Button>
          <Button variant="outline" onClick={() => document.getElementById("import-file")?.click()}>{t({ ja: "JSONを読み込む", en: "Import JSON" })}</Button>
          <input id="import-file" type="file" accept="application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const n = await importAll(f); alert(t({ ja: `${n} 件の探究を読み込みました`, en: `Imported ${n} inquiries` })); } e.target.value = ""; }} />
        </ButtonRow>
        <ButtonRow className="pt-3">
          <Button variant="destructive" onClick={async () => { if (confirm(t({ ja: "すべての探究・ノートを削除しますか？", en: "Delete all inquiries and notes?" }))) { await db.delete(); location.reload(); } }}>
          {t({ ja: "すべて削除", en: "Delete everything" })}
          </Button>
        </ButtonRow>
      </section>
    </div>
  );
}
