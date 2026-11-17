# Kurashi

名古屋市に住む人（とくに来日した留学生）が、生活の出来事から「知らなかった手続き」に気づくための Web アプリです。Built with Claude: Japan 2026 の提出物です。

**Kurashi は個人が開発・運営する非公式のアプリです。名古屋市が提供・監修・公認するアプリではありません。** 内容の正確さ・新しさは保証できません。手続きの前に、公式のページと窓口で確かめてください。

- 公開の URL：https://kurashi.eringo.io/ （https://kurashi.eringo-io.workers.dev/ でも開けます）
- ライセンス：MIT（`LICENSE`）。第三者の著作物と出典は `THIRD_PARTY_NOTICES.md`

## できること

できごとを選び、いくつかの質問に答えると、その人に要る手続きと順番が出ます。

- 入口：引っ越し・ごみ・届いた書類・病院・在留期間の更新・仕事・銀行・住まい・財布をなくした・結婚について（結婚・離婚）・ファミリーシップ制度・運転免許・探す。名古屋市から出ていくときは、引っ越しの入口から案内します
- どの手続きも、公式の原文で確かめていないところは「要確認」と出します
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

ごみの収集日の表（`data/gomi/schedule.json`）と分別の区分・備考は、名古屋市公式ウェブサイトの2つのページ（ごみ収集日検索・ごみ・資源分別検索）から、名古屋市環境局の書面による同意を得て、名古屋市の著作権・再利用の規定（https://www.city.nagoya.jp/about/1017985.html 、https://www.city.nagoya.jp/about/1017973.html ）に従って使っています（値は変えず、表示の形だけ変えています。著作権者：名古屋市。Kurashi は名古屋市が提供・監修・公認するアプリではありません。Kurashi の説明・英語の訳は名古屋市の公式のものではありません）。年末年始の収集日（`data/gomi/year-end.json`）は、市の年末年始のお知らせの日付だけを使っています。くわしくは `THIRD_PARTY_NOTICES.md`。名古屋市が案内しているごみ分別アプリは「さんあ～る」です（https://www.city.nagoya.jp/kurashi/gomi/1012183/1012187/1012188.html ）。

## 公開（Cloudflare Workers）

`wrangler.toml` の設定で、静的なファイル（`dist/`）と `/api/*`（`worker/index.ts`）を1つの Worker で配ります。ログ・監視は切っています。

```bash
npm run worker:dev   # 手元で確かめる（http://localhost:8787）。アカウントは要らない
npx wrangler login
npm run predeploy:check   # 公開の前の検査だけを動かす
KURASHI_DEPLOY_APPROVED=<release.json の release_id> npm run deploy
```

`npm run deploy` は、公開の前の検査（`scripts/predeploy.mjs`）・単体テスト・ビルドを通ったときだけ公開します。検査が見るのは、`wrangler.toml` の名前・`release.json`（版の印）・git の origin・未コミットの変更がないこと・作者の承認（`KURASHI_DEPLOY_APPROVED`）です。公開した版は `release.json` の `release_id` で、画面の「このアプリについて」にも出ます。

### 写真の読み取り（Anthropic API）の守り

有料の呼び出しは、`wrangler.toml` の `READ_MODE` で決まります。

| `READ_MODE` | 動き |
|---|---|
| `off`（値が無いときも） | 見本の結果だけを返します。API は呼びません |
| `test`（いまの設定） | テスト用のトークンを持つ人だけが API を呼べます。ほかの人は 401 で、画面に写真の欄も出ません |
| `public` | だれでも使えます。IP ごとの制限と、1日の数を数える KV（`USAGE`）が無いと 503 です |

- キーとトークンは Worker のシークレットにだけ入れます（`npx wrangler secret put ANTHROPIC_API_KEY`・`npx wrangler secret put READ_TEST_TOKEN`）。ファイルにも GitHub にも書きません。
- 公開のビルドには作者用の画面（`/review`）が入っていません。本番で写真の読み取りを試す入口は、まだ決めていません（`READ_MODE = "test"` のあいだ、ほかの人は使えません）。
- IP ごとの制限（1分に5回）と1日の上限（100回）は目安です。費用を確実に止めるのは、Anthropic Console の Workspace の支出の上限です。
- すぐ止めるときは、次のどれか1つをします。
  - Cloudflare のダッシュボードで `READ_MODE` を `off` にする
  - `npx wrangler secret delete ANTHROPIC_API_KEY`
  - Console でキーを無効にする

### まちがいを知らせる（報告）

- 報告は KV（`REPORTS`）に保存し、1年で自動で消えます。名前・連絡先・IP は保存しません。
- KV が無いとき、本番は 503 を返します（受け付けたように見せません）。
- 回数の制限は IP ごとに1分3件です（Cloudflare の Rate Limiting。目安で、IP は残しません）。
- 報告の一覧（`GET /api/reports`）は `kurashi.eringo.io` だけで開き、Cloudflare Access のログインと Worker のシークレット `REPORTS_TOKEN` の両方が要ります。作者は Access を通るコマンド（`cloudflared access curl`）か、Access のサービストークンで読みます。workers.dev では開きません。

## データ

ガイドのデータは `data/` にあります（カードは `data/cards/` に1枚1ファイル）。形は `docs/DATA_CONTRACT.md`、言語の足し方は `docs/ADD_LANGUAGE.md`、テストの回し方は `docs/TESTS.md` です。

## このリポジトリに入れていないもの

- 調査で取得した公式資料の原文（再配布しないため）
- 作りかけの入口（財布・結婚・離婚・運転免許）の下書き
- 内部の仕様書・作業メモ・デモ動画の素材
