import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { exportAll, importAll } from "@/lib/backup";
import { useT } from "@/lib/i18n";
import { setSettings, useSettings } from "@/lib/settings";

const models = ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"];

export function SettingsPage() {
  const t = useT();
  const s = useSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">{t({ ja: "設定", en: "Settings" })}</h1>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">{t({ ja: "AI（自分のAPIキーを使う）", en: "AI (bring your own key)" })}</h2>
        <p className="text-sm text-muted-foreground">
          {t({
            ja: "このアプリはサーバーを持たず、キーはこのブラウザの localStorage にだけ保存され、Anthropic のAPIへ直接送られます。共用のPCでは使い終わったら消してください。",
            en: "There is no server. The key is stored only in this browser's localStorage and sent directly to Anthropic's API. Clear it on shared computers.",
          })}
        </p>
        <div className="grid gap-1.5">
          <Label>Anthropic API key</Label>
          <Input type="password" autoComplete="off" value={s.apiKey} onChange={(e) => setSettings({ apiKey: e.target.value.trim() })} placeholder="sk-ant-…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label>{t({ ja: "生成モデル", en: "Model" })}</Label>
            <Select value={s.model} onValueChange={(v) => v && setSettings({ model: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t({ ja: "文法チェック用モデル", en: "QA model" })}</Label>
            <Select value={s.qaModel} onValueChange={(v) => v && setSettings({ qaModel: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <label className="flex items-center justify-between text-sm">
          <span>{t({ ja: "生成した例文を安価なモデルで文法チェックし、怪しい文に「？」を付ける", en: "Check generated sentences with the cheap model and flag suspicious ones" })}</span>
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
