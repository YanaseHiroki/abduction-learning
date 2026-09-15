# Abduction Lab — アブダクション語学学習（非公式ファンメイド）

今井むつみ『アブダクション英語学習法』の学び方を、ブラウザだけで実践するための練習帳です。
著者・出版社とは無関係の非公式プロジェクトで、本文・例文・登場人物は一切収録していません。使っているのは「手順の構造」と基本動詞13語のリストだけです。

## できること

1. **例文を出力する（STEP 1）** — 似た意味の語（listen & hear など）を選び、ジャンル・レベル・副詞の有無を指定してAIに例文だけを出させる。AIには「頼むまで意味の解説をしない」という指示が常に付く。
2. **比較・検討して仮説を立てる（STEP 2）** — 例文の語句をドラッグでマークして比較表（対象ごと／共通・固有／タグ別）を作る。S/V/O/C を自分でタグ付けする構文分析。仮説は v1, v2 … と版を重ね、「？」で不確かさを残せる。
3. **仮説を検証する（STEP 3）** — 母語で試験文を書き、①②③の位置にどの語が出るかを予想してからAIに訳させる翻訳テスト。「〜するつもりだ」のような枠を当てるフレームテスト。
4. **まとめ・出力** — スキーマを気づきノートに保存し、自分の場面で文を書いて相棒コメントをもらう。

その他: 読み上げ（ブラウザ内蔵音声、無料）、生成文の文法チェックと「？」旗、生成モデル・日時の記録、JSONバックアップ。

## 使い方

学習データはすべてブラウザ内（IndexedDB）に保存されます。サーバーは持ちません。

AIの接続先は設定画面のタブで選びます。開いているタブが使われます。

| タブ | 内容 |
|---|---|
| 無料枠 | 運営者が用意した安価なモデルを、1日の回数制限つきで無料で使う（下記の Worker を配置した場合のみ） |
| Anthropic / OpenAI / Gemini | 自分のAPIキーを入れる。キーはブラウザの localStorage にだけ保存され、各社のAPIへ直接送られる |

## 無料枠（共有キー）の仕組みと制限

静的サイトには秘密を置けないため、共有キーは Cloudflare Worker（無料枠）に置き、サイトはその Worker 経由で呼び出します。リポジトリのシークレットをビルドに埋め込む方式は、キーが公開JSに含まれて誰でも取り出せてしまうので採用していません。

無料枠は AI の呼び出し回数ではなく、探究の数で数えます。
始めた探究には AI 呼び出しの枠をまとめて確保するので、探究の途中で上限に達することはありません。

Worker が掛けている制限（`worker/wrangler.toml` で変更可）:

- 端末ごと（ブラウザの匿名ID）: 初めて使う日は探究 3 つ、2日目からは1日 1 つ — 初日は探究を何度か経験してもらう
- IPごと: 1日 5 つ — 匿名IDを消して初日の枠を取り直されるのを鈍らせる
- 全体: 1日 10 つ — 運営者の上限額を固定する安全弁（10 × 60 = 1日 600 回まで）
- 探究1つにつき AI 呼び出し 60 回まで（ふつうは 15〜30 回）。始めた探究は 3 日間、日をまたいでも続けられる
- モデル固定・出力トークン上限・入力文字数上限
- アプリのシステムプロンプト署名を持つ要求だけ受け付ける（汎用プロキシとして使えない）
- 配信元オリジンの制限

新しく始められる探究の数は、日本時間の0時にリセットされます。
上限に達すると、探究を始める画面と最初の例文の生成時にその旨が表示されます。
自分のキーに切り替えれば続けられます。

### 運営者の設定手順

1. Cloudflare アカウント（無料）を作り、API トークン（Workers 編集権限）とアカウントIDを控える。
2. GitHub リポジトリの Settings → Secrets and variables → Actions に以下を登録する。
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `PROVIDER_API_KEY`（共有するAPIキー）
   - Variables: `PROXY_ENABLED` = `true`, `PROVIDER`（`anthropic` / `openai` / `gemini`）, `MODEL`（既定は `gpt-5.6-luna`。選定の根拠は docs/model-bench-2026-09.md）
3. Actions の「Deploy shared-key proxy」を実行すると Worker が配置され、`https://abduction-learning-proxy.<account>.workers.dev` のURLが出る。
4. そのURLを Variables の `PROXY_URL` に登録し、「Deploy to GitHub Pages」を再実行する。

`worker/wrangler.toml` の `ALLOWED_ORIGINS` は自分の Pages のURLに合わせてください。

## 開発

```bash
pnpm install
pnpm dev
```

`main` に push すると GitHub Actions が GitHub Pages に配信します（リポジトリの Settings → Pages で Source を "GitHub Actions" にしてください）。

### モデルの比較（無料枠のモデル選定）

`#/bench` はナビゲーションに出ない開発用ページです。
設定画面に入れた各社のキーを使い、listen & hear の例文セット（10文 × 2語を並列生成）＋文法チェック＋翻訳テストを候補モデルごとに同条件で実行し、応答時間・トークン数・1回あたりの費用と、審判モデルによる採点（文法・自然さ・訳の質・「頼むまで解説しない」の遵守）を表にします。
結果は「Copy Markdown」で貼り付けられます。
2026年9月の実測は docs/model-bench-2026-09.md にあります。

## 技術

Vite + React + TypeScript、Tailwind CSS v4、shadcn/ui（Base UI）、Dexie（IndexedDB）、Anthropic TypeScript SDK / OpenAI・Gemini REST（JSON Schema 構造化出力）、Cloudflare Workers + Durable Objects（共有キーの回数制限）。

## ライセンス

MIT
