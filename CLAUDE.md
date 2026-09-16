# CLAUDE.md

このリポジトリで作業する Claude セッション向けの申し合わせです。

## 並行セッションの作法

このリポジトリは、複数の Claude セッションが同時に触ります。各セッションは `.claude/worktrees/` 配下の
リンクワークツリーで作業し、`/Users/casual/git/abduction-learning` の共有チェックアウトが `main` に
います。2026-09-16 に同じ修正が二重に PR になった（#13 と #14）ことと、共有チェックアウトが2度壊れた
ことを受けて、次の3点を決めました。

1. **着手前と PR を出す直前に、main と open PR を見る。**
   `git fetch && git log --oneline -10 origin/main` と `gh pr list`。
   直そうとしているものが、もう誰かの手で入っていないか確かめる。
2. **他セッションのコミットを自分の PR に取り込むときは、先に一声かける。**
   cherry-pick 自体は構わないが、黙ってやると相手の PR が「マージ済みの内容を再度出す」形になる。
   連絡は `ListAgents` で相手を探して `SendMessage`。
3. **`main` ref を動かすコマンドを使わない。**
   ワークツリーから最新の main を見るときは `git switch --detach origin/main`。
   `git checkout -B main origin/main` は local の `main` を force で動かし、共有チェックアウトの HEAD
   だけが進んで index と実ファイルが取り残される。全ファイルがステージ済みに見え、直前のマージを
   打ち消すコミットに見えるという壊れ方をする。`git worktree list` に `[main]` が2行出ていたらこれ。

## 共有チェックアウトの扱い

`/Users/casual/git/abduction-learning` は全セッションが見ている場所です。ここに未コミットの変更や
ステージ済みの差分を残さないでください。ブランチも `main` に置いたままにします。作業ブランチに
乗せると、次に来たセッションが main を見ているつもりで別物を見ることになるので、用が済んだら
`git switch main` で戻してください。

見覚えのない差分を見つけても、すぐには消さないこと。上の3番目の壊れ方だと、差分は「直前のマージを
打ち消す変更」の形で現れるので、そのままコミットすると本当に打ち消してしまいます。消す前に:

- `git log --oneline -5 origin/main` と見比べて、マージ済みの変更を打ち消す内容になっていないか確かめる
- 他のセッションに心当たりを聞く（`ListAgents` で探して `SendMessage`）
- 捨てても失うものが無いことを確かめる。`git diff --cached --name-only <そのときの main のコミット>`
  が空（index がそのツリーと完全に一致）で、`git status --porcelain` に `??` の行が無いこと。
  そこまで確認できたら `git reset --hard HEAD` で戻す

## 確認コマンド

PR を出す前にローカルで通しておくと、CI（`.github/workflows/ci.yml`）と同じところで落ちずに済みます。

| コマンド | 対象 |
|---|---|
| `pnpm lint` | oxlint。`--max-warnings=0` なので warning 1件で落ちる |
| `pnpm build` | 型検査（`tsc -b`）と本番ビルド |
| `pnpm test:unit` | `src/**/*.test.ts`（ロジック） |
| `pnpm test:ui` | `tests/ui/*.test.ts`（実ブラウザ。Playwright） |
| `pnpm test:worker` | `worker/test/*.test.ts`（workerd） |
| `pnpm test` | 上の3つのテストをまとめて |

テストは AI を一度も呼びません。UI テストは dev サーバー以外への通信をブロックし、外に出た URL が
あれば失敗します。詳しくは [docs/testing.md](docs/testing.md)。

**画面の文言を変えたら** `pnpm shots:check` が落ちます（ヘルプのスクリーンショットとの食い違いを
CI で止めています）。直し方は2通りで、出力もどちらかを案内します。

- 文言を変えて画像が古くなったなら、撮り直す: `pnpm shots --lang=<ja|en> --only=<id>`
- 画像は正しく、記録だけ古いなら、記録を取り直す: `pnpm shots:record`

詳しくは [docs/help-screenshots.md](docs/help-screenshots.md)。

## マージと本番

**`main` への push が、そのまま本番反映です。** `.github/workflows/pages.yml` が GitHub Pages へ
デプロイします（concurrency group `pages` が `cancel-in-progress` なので、連続してマージすると前の
デプロイは cancelled になりますが、後続が両方を含みます）。`worker/**` を触った場合は
`.github/workflows/worker.yml` も走ります（`PROXY_ENABLED` が `true` のときだけ）。

マージ＝公開なので、他のセッションが作業中の内容を巻き込んでいないかを確かめてからマージします。

## コードのトーン

- コード中のコメントは英語。**何をしているか**ではなく、**なぜそうなっているか**を書く。
- 画面の文言は `t({ ja, en })` で日本語と英語の両方を書く。学習者の母語（`inquiry.l1`）に沿うべき
  ものを、画面の言語（`uiLang`）で切り替えないよう注意する（過去に翻訳テストの例文で間違えました）。
- ドキュメントと README は日本語。
