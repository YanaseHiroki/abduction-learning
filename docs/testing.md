# テスト

`pnpm test` で全部（アプリ 233 件 + Worker 83 件）走ります。AI は一度も呼びません。

| コマンド | 対象 | 中身 |
|---|---|---|
| `pnpm test:unit` | `src/**/*.test.ts` | ロジック。jsdom + fake-indexeddb で、`fetch` とプロバイダ呼び出しはモック |
| `pnpm test:ui` | `tests/ui/*.test.ts` | 画面。Vite の dev サーバーと実ブラウザ（Playwright）で本物のアプリを動かす |
| `pnpm test:worker` | `worker/test/*.test.ts` | 無料枠の Worker。workerd 上で動かすので Durable Object と SQL も本物 |

## 何を守っているか

- **ロジック** — 語句のマーク（`text.ts`）、設定の読み書きと v1 キーの移行（`settings.ts`）、IndexedDB とバックアップの往復（`db.ts` / `backup.ts`）、カードの「次の一手」と完了判定（`guide.ts`）、例文生成の並列実行・部分失敗・QA の旗（`actions.ts`）、各社 API のリクエスト組み立てとエラー（`llm/providers.ts`）、無料枠と自前キーの振り分け（`llm/client.ts`）、プロンプトの制約文（`llm/prompts.ts`）。
- **画面** — ホーム・探究・ノート・ヘルプ・設定が seed 済みデータで正しく出ること、日本語／英語、ダーク、390px 幅で横スクロールが出ないこと。初回のウェルカムからチュートリアル開始まで、コースからの探究開始、設定の保存、バックアップの書き出しと読み込み。
- **Worker** — 探究単位の回数制限（端末・IP・全体・探究ごと・日またぎ・TTL 切れ）、失敗時の返金、署名のないプロンプトの拒否、オリジン制限、ご意見フォームの制限とハニーポット。

## 決まりごと

- **AI を呼ばない。** UI テストは dev サーバー以外への通信をブロックし、出ていった URL があればテストを失敗させます。Worker テストは `fetch` を差し替えます。
- **Worker のカウンタは1つしかない**ので、テストごとに別の Durable Object 名・別の端末ID・別の IP を使います。
- 画面テストは `src/dev/demo.ts` の demo 探究（ヘルプのスクリーンショットと同じデータ）を `#/dev/seed` から入れて動かします。
