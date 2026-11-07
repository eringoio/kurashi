# Kurashi

名古屋市に住む人（とくに来日した留学生）が、生活の出来事から「知らなかった手続き」に気づけるようにする Web アプリ。Built with Claude: Japan 2026 の提出物。

- 仕様：`docs/SPEC.md`
- 引き継ぎ：`docs/HANDOFF.md`
- 作者が確かめること：`docs/AUTHOR_CHECK.md`
- 文書の一覧（正本・補助・履歴）：`docs/README.md`。テストの回し方：`docs/TESTS.md`

## 手元で動かす

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # 単体テスト（Vitest）
npm run test:a11y    # 画面の検査（Playwright＋axe。Windows の Edge を使う）
npm run build        # 型の検査とビルド（dist/）
```

ごみの収集日は、`.env.development` に `VITE_GOMI_SCHEDULE=on` と書き、`data/private/gomi-schedule.json`（名古屋市の表の写し。Git に入れない）があるときだけ出ます。どちらも無ければ off で動きます。

答え・持ち物・約束した日は、この端末の中（IndexedDB）にだけ残ります。アカウントはありません。

## 公開（Cloudflare Workers）

`wrangler.toml` の設定で、静的なファイル（`dist/`）と `/api/*`（`worker/index.ts`）を1つの Worker で配ります。保存の仕組み（D1・KV・R2）は使いません。ログ・監視は切っています（SPEC 13.3）。

### 手元で確かめる（アカウントは要らない）

```bash
npm run worker:dev   # ビルドしてから wrangler dev（http://localhost:8787）
```

API キーが無いので、`/api/read-document`（届いた書類を撮る）は見本の結果を返します。写真の欄は `VITE_LETTER_READ=on` を付けてビルドしたときだけ出ます（PowerShell：`$env:VITE_LETTER_READ='on'; npm run worker:dev`）。試し方は `docs/DOCUMENT_CAPTURE_PLAN.md`。

### 作者の手順（作者のアカウントで行う）

1. Cloudflare にログインする。

   ```bash
   npx wrangler login
   ```

2. 写真を読むための API キーを、Worker のシークレットに入れる（値はファイルに書かない）。

   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

3. 公開する。

   ```bash
   npm run deploy
   ```

   最初は `https://kurashi.<アカウント>.workers.dev` で開きます。写真の読み取りを出すときは、`VITE_LETTER_READ=on` を付けて公開します（PowerShell：`$env:VITE_LETTER_READ='on'; npm run deploy`）。付けないと、書類は一覧から選ぶだけです。

4. `kurashi.eringo.io` で開くようにする：`eringo.io` を Cloudflare で管理しているなら、`wrangler.toml` の `routes` の行の `#` を外して、もう一度 `npm run deploy`。ほかの所で管理しているなら、Cloudflare のダッシュボードで Worker に独自のドメインを足し、言われた DNS の記録を作る。

5. 公開の URL を開き、`docs/VOICEOVER_CHECK.md` の手順で iPhone で確かめる。

### データの更新（GitHub Actions）

`.github/workflows/ci.yml`（PR ごとの検査）と `data-update.yml`（週1回、公式のページを取得して変わった所を PR にする）があります。動かすには、GitHub のリポジトリと、Secrets の `ANTHROPIC_API_KEY` が要ります。くわしくは `docs/DATA_UPDATE.md`。
