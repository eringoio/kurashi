# Kurashi

名古屋市に住む人（とくに来日した留学生）が、生活の出来事から「知らなかった手続き」に気づくための Web アプリです。Built with Claude: Japan 2026 の提出物です。

- 公開の URL：https://kurashi.eringo.io
- ライセンス：MIT（`LICENSE`）。第三者の著作物と出典は `THIRD_PARTY_NOTICES.md`

## できること

できごとを選び、いくつかの質問に答えると、その人に要る手続きと順番が出ます。

- 入口：引っ越し・ごみ・届いた書類・病院・在留期間の更新・仕事・銀行・住まい・探す
- 手続きごとに、期限・持ち物・行く所・正式な名前・出典を示します。
- 窓口に行く日を決めると、その日の持ち物と順番をまとめます（付き添いの画面）。
- 窓口で使う言葉（「ことば」）を残せます。
- 表示レベルは3つです：ふつうの日本語・やさしい日本語（ふりがな付き）・English（英語とふりがな付きの日本語）。

## 大事にしていること

- **アカウントはありません。** 答え・持ち物・決めた日は、同意したときだけ、この端末の中（IndexedDB）に残ります。
- **URL に答えや個人の情報を入れません。**
- **確かめていないことは言い切りません。** データの1件ごとに、出典・確かめた日・確認状態があります。公式の原文で確かめていないものは「要確認」と出します。
- **アクセシビリティ**：axe の検査で違反 0。幅 320px でも横にスクロールしません。読み上げにも対応しています。
- このアプリは法律・医療の助言をしません。最終的には公式のページと窓口で確かめてください。

## Claude の使い方

1. **アプリの中**：届いた書類の写真から、どの書類に近いかの候補だけを Claude（既定は `claude-haiku-5-5`）が返します（`worker/readDocument.ts`）。写真は保存しません。名前・番号・金額は返させません。API キーが無いときは見本の結果を返します。
2. **データの確認**：公式のページを取得し、変わったところを Claude が照合して、確認待ちの更新案を作ります（`scripts/fetch-sources.ts`・`scripts/update-agent.ts`・`scripts/apply-update.ts`）。AI の提案は確認状態を下げるだけで、作者が確かめて承認するまで本番に入りません。この処理とそのキーは、開発用の非公開リポジトリだけで動かします（このリポジトリには、ワークフローも Secret も置きません）。
3. **開発**：仕様・実装・テスト・アクセシビリティの検査を Claude Code で作りました。手続きの根拠は、Claude が公式のページから引用を取り、別の照合で確かめました（データの `evidence`）。

## 手元で動かす

```bash
npm ci
npm run dev          # http://localhost:5173
npm test             # 単体テスト（Vitest）
npm run build        # 型の検査とビルド（dist/）
npm run test:a11y    # 画面の検査（Playwright＋axe。Windows の Edge を使う設定）
```

ごみの収集日の機能は、名古屋市の表の利用の許諾を待っているため、公開版では止めています（表はこのリポジトリにありません）。

## 公開（Cloudflare Workers）

`wrangler.toml` の設定で、静的なファイル（`dist/`）と `/api/*`（`worker/index.ts`）を1つの Worker で配ります。ログ・監視は切っています。

```bash
npm run worker:dev   # 手元で確かめる（http://localhost:8787）。アカウントは要らない
npx wrangler login
npm run deploy
```

### 写真の読み取り（Anthropic API）の守り

有料の呼び出しは、`wrangler.toml` の `READ_MODE` で決まります。

| `READ_MODE` | 動き |
|---|---|
| `off`（値が無いときも） | 見本の結果だけを返します。API は呼びません |
| `test`（いまの設定） | テスト用のトークンを持つ人だけが API を呼べます。ほかの人は 401 で、画面に写真の欄も出ません |
| `public` | だれでも使えます。IP ごとの制限と、1日の数を数える KV（`USAGE`）が無いと 503 です |

- キーとトークンは Worker のシークレットにだけ入れます（`npx wrangler secret put ANTHROPIC_API_KEY`・`npx wrangler secret put READ_TEST_TOKEN`）。ファイルにも GitHub にも書きません。
- テストでは、`/review` の「写真の読み取りのテスト」にトークンを入れると、そのタブだけ「届いた書類」に写真の欄が出ます。
- IP ごとの制限（1分に5回）と1日の上限（100回）は目安です。費用を確実に止めるのは、Anthropic Console の Workspace の支出の上限です。
- すぐ止めるときは、次のどれか1つをします。
  - Cloudflare のダッシュボードで `READ_MODE` を `off` にする
  - `npx wrangler secret delete ANTHROPIC_API_KEY`
  - Console でキーを無効にする

## データ

ガイドのデータは `data/` にあります（カードは `data/cards/` に1枚1ファイル）。形は `docs/DATA_CONTRACT.md`、言語の足し方は `docs/ADD_LANGUAGE.md`、テストの回し方は `docs/TESTS.md` です。

## このリポジトリに入れていないもの

- 調査で取得した公式資料の原文（再配布しないため）
- ごみの収集日の表の写し（名古屋市の許諾待ち）
- 作りかけの入口（財布・結婚・離婚・運転免許）の下書き
- 内部の仕様書・作業メモ・デモ動画の素材
