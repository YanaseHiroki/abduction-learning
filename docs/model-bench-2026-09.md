# 無料枠モデルの比較（2026-09-15）

`#/bench` で実行。条件はすべて同じ: listen & hear、ニュース、中学生レベル、10文 × 2語（対象ごとに並列生成）、同じモデルで文法チェック（QA）、翻訳テスト1回（「嫌な意見も①聞くべきだし、噂は自然と②聞こえてくる。」候補語限定）。
費用は各社の公開価格（2026-09）× 実測トークン。審判は claude-opus-5。

| model | gen | QA | translate | tokens in/out | 1 set (USD) | 1 translation (USD) | count | target missing | leakage | expl. hints | QA flags | translation | grammar errs | natural | transl. | no-expl | notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gpt-5.6-luna | 11.9s | 3.6s | 2.9s | 1821/2076 | $0.0026 | $0.0003 | 10+10 | 0 | 0 | 0 | 1 | 1:listen✓ 2:hear✓ | 0 | 4 | 4 | 5 | hear 5「Please hear the witness's statement」は命令形で hear を使うのが不自然で、通常は listen to/hear out が自然。listen 3「listen to the new rules」も規則を目的語に取るのはやや不自然。訳文は概ね正確だが、listen の節が丁寧体、hear の節が常体と文体が揃っていない点が気になる。翻訳テストの①②の訳し分けは適切で、余計な説明や注記の混入はない。 |
| gemini-3.1-flash-lite | 3.1s | 1.1s | 3.0s | 1299/2384 | $0.0027 | $0.0012 | 10+10 | 0 | 0 | 0 | 1 | 1:listen✓ 2:hear✓ | 1 | 4 | 4 | 5 | hear 8「I never heard such a ridiculous excuse before」は現在完了（have never heard）が正しく、訳「聞いたことがない」と時制が不一致。全体として語彙・場面はニュース調で中学生にも適切だが、listen の例文が「聞いてください」型に偏りやや単調。訳文に余計な注記や解説の混入はなく、訳のみで統一されている点は良好（listen 4 の「意見を」は軽い補足程度）。 |
| gpt-5-mini | 39.2s | 7.0s | 19.1s | 1794/5412 | $0.0094 | $0.0019 | 10+10 | 0 | 1 | 0 | 0 | 1:listen✓ 2:hear✓ | 0 | 3 | 4 | 5 | 「Hear the witness now.」や「We were heard by many listeners.」は中学レベルのニュース文としては不自然で、文法的には問題ないが用例として適切さに欠ける。訳では listen 8 の will が訳し漏れ（「聞きます」→「聞くつもりです」）、listen 1 の「よく」は原文にない補足。全体に解説や注記の混入はなく、訳し分け（listen=耳を傾ける/hear=聞こえる）は概ね適切。 |
| gemini-3.5-flash-lite | 3.3s | 1.2s | 6.8s | 1308/3315 | $0.0045 | $0.0042 | 10+10 | 0 | 0 | 0 | 0 | 1:listen✓ 2:hear✓ | 0 | 4 | 4 | 5 | 文法的な誤りは見当たらず、中学レベルの語彙・構文として概ね自然。ただしhearの例文(雷・クジラ・鳥など)はニュース報道調というより描写文寄りで、レジスターの一貫性がやや弱い。訳はlisten7の「指示をよく聞かなければ」やlisten3の「声に耳を傾けようとしなかった」など原文にない要素の補足が見られるが、解説・注記の混入はなく指示は守られている。 |
| claude-haiku-4-5 | 9.2s | 1.6s | 2.1s | 3067/1779 | $0.0110 | $0.0010 | 10+10 | 0 | 0 | 0 | 0 | 1:listen✓ 2:hear✓ | 0 | 4 | 3 | 5 | 例文自体の文法は概ね正確で、ニュース調・中学レベルにも適合している。ただし訳語がやや不自然な箇所がある（「ニュース更新」→「ニュースの最新情報」、「爆発を明確に聞いた」→「はっきりと聞いた」、town meeting を「町役場の集会」、community を「社会」→「地域住民」）。また town meeting と「市長」の対応が不統一。翻訳テストの出力 'rumors naturally come to hear' は非文で、②「聞こえてくる」の処理に失敗している（reach one's ears / one hears 等が適切）。説明や注記の混入はなく、訳文のみで統一されている点は良い。 |

gemini-2.5-flash-lite、gpt-5-nano、gemini-2.5-flash は完了行がなく、この表に含まれていません。

## 探究1つあたりの概算（例文セット3回 + 翻訳テスト5回）

| model | USD / 探究 | 備考 |
|---|---|---|
| gpt-5.6-luna | 0.009 | 最安。生成 12 秒。文法エラー 0、「解説しない」遵守 5 |
| gemini-3.1-flash-lite | 0.014 | 生成 3 秒で最速。翻訳テストが思考トークンで 4 倍高い。時制ミス 1 |
| gemini-3.5-flash-lite | 0.035 | 翻訳テストが高い（$0.0042） |
| gpt-5-mini | 0.038 | 生成 39 秒、翻訳 19 秒。遅すぎる |
| claude-haiku-4-5 | 0.038 | 翻訳テストで非文（'rumors naturally come to hear'）。訳の質 3 |

## 結論

- 無料枠（Worker）: **gpt-5.6-luna**（PROVIDER=openai）。最低限の品質（文法エラー 0、①②の訳し分け正解、解説の混入なし）を満たす中で最安。
- 応答の速さを優先するなら gemini-3.1-flash-lite。費用差は探究1つで 0.5 セント程度。
- BYOK の既定: OpenAI は gpt-5.6-luna、Gemini は gemini-3.1-flash-lite、Anthropic は claude-opus-5（QA は claude-haiku-4-5）のまま。
