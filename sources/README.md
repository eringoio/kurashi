# sources/

公式の出典の取得した本文（docs/DATA_UPDATE.md 3章）。

- `snapshots/<source_id>/<YYYY-MM-DD>.txt`：その日に取得した本文（整えた文字だけ）。`ai_checked` の根拠の `ai_check.fetched_at`・`ai_check.sha256` と対応する。
- 確かめ：`npm run check:quotes`（`scripts/check-quotes.ts`）。引用（`quote`）が本文にそのままあるか、ハッシュが合うか。
- 本文を公開のリポジトリに入れるかは、作者が決める（DATA_UPDATE.md 8章の2）。
