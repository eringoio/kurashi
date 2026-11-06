# テスト：何をいつ回すか（2026-11-07）

作者の指示（11/6 夜）：テストが多すぎる。要らないテストは省き、必要な所だけ。**変えたときに、変えた所に近いテストを回す。**

## 変更の大きさごとに回すもの

| レベル | どんな変更 | 回すもの | 目安 |
|---|---|---|---|
| 1 小さな変更 | 判定・データ・文・保存・Worker の1〜2ファイル | `npm test`（全部で約10秒。ファイルを絞っても速くならないので絞らない） | 10秒 |
| 2 機能の変更 | 画面の動き・複数の部品・経路 | `npm test` ＋ 変えた画面の e2e だけ：`npx playwright test tests/e2e/<ファイル>.spec.ts`（新しい画面は `a11y.spec.ts` の `PAGES` に足してから `npx playwright test tests/e2e/a11y.spec.ts`） | 1〜3分 |
| 3 全体 | 共通の部品（`src/ui`・`src/styles`・`src/core/data.ts`・`strings.json`）、公開の前、区切り | `npm run check`（型・ふりがな・単体・遅い3つ・引用・a11y） | 約10分 |
| 4 外部 | 本番ビルド・ネット・Claude API・Cloudflare | 下の「外部のもの」。目的があるときだけ | |

- 通ったテストは、関係するファイルを変えないかぎり、もう一度回さない。
- 既存のテストで守れていることに、新しいテストを足さない。足すときは、何を守るかを1行で書く（下の「消した・まとめたテスト」の形）。
- 失敗したら、失敗したファイルだけ直して、そのファイルだけ回し直す（`npx vitest run tests/core/<名前>`、`npx playwright test tests/e2e/<名前>`）。
- 下書き（`drafts/`）・`scripts/produce`・`scripts/update-agent.ts`・`scripts/fetch-sources.ts` を変えたときだけ `npm run test:slow`（約10秒）。根拠（`evidence`）を変えたときだけ `npm run check:quotes`。
- コミットの前は、少なくとも `npm test`。公開の前は `npm run check` と `npm run build`。

## コマンドの一覧

| コマンド | 中身 | かかる時間 |
|---|---|---|
| `npm test` | Vitest（`tests/core/`・`tests/unit/`。40ファイル・437件）。判定・データの検査・保存・Worker・入口 | 約10秒 |
| `npm run test:slow` | 下書きを全部いっしょに読む検査（`drafts-all`）、下書きの制作（`produce`。モデルは mock）、データの更新の試運転（`data-update-run`。フィクスチャ） | 約10秒 |
| `npm run check:quotes` | `ai_checked` の引用が保存した本文（`sources/snapshots/`）にあるか | 数秒 |
| `npm run test:a11y` | Playwright＋axe（`tests/e2e/`。main と drafts の2つのプロジェクト。129件。`verify-prod` の3件は飛ばす） | 約4分（11/7 実測 3分56秒） |
| `npx playwright test --project=main` | 公開のデータの e2e だけ（drafts を飛ばす） | 約3分（推定） |
| `npm run shots` | フロー（`tests/flows/main`・`drafts`）のスクリーンショット。変えたファイルに関係するフローだけ（`npm run shots:affected` で対象を見る） | 1〜3分 |
| `npm run build` | 型・ビルド・配信物に下書きの ID が入っていないか（`check-dist`） | 約10秒 |
| `npm run check` | 上の全部（shots を除く） | 約10分 |

どのテストもネットに出ない。Claude API は mock、公式ページはフィクスチャ（`tests/fixtures/sources/`）。API キーは要らない。

## 外部のもの（レベル4）

| すること | 方法 | 注意 |
|---|---|---|
| 本番ビルドの確かめ | `npm run build` → `npm run preview`（4173）→ `VERIFY_PREVIEW=1 npx playwright test tests/e2e/verify-prod.spec.ts` | 手元だけ。ネットは使わない |
| Worker を手元で動かす | `npm run worker:dev`（8787。キーが無いので写真の読み取りは見本） | 本物の読み取りは公開の Worker だけ |
| 公式ページの取得とデータの更新 | `npm run data:fetch` → `npm run data:agent`（`docs/DATA_UPDATE.md`） | ネットと `ANTHROPIC_API_KEY` を使う。作者が決めたときだけ。GitHub Actions の `data-update.yml` は手動（workflow_dispatch）のまま |
| 無人の下書き制作 | `node scripts/produce/run.mjs`（`docs/PRODUCE.md`） | Claude CLI の利用枠を使う。作者が決めたときだけ |
| 公開 | `npm run deploy`（作者のアカウント。README の手順） | 作者だけ。Claude は実行しない |

## CI（`.github/workflows/`）

- `ci.yml`：型・ふりがな・Vitest（遅い3つを含む）・引用・ビルド。作者の指示（11/5）で手動実行（`workflow_dispatch`）だけ。Playwright は入れていない（Windows の Edge を使う設定のため）。
- `data-update.yml`：データの更新。手動だけ。`ANTHROPIC_API_KEY` のシークレットが要る。

## a11y（`tests/e2e/a11y.spec.ts`）

- **全画面**（`PAGES`）：ふつうの日本語 × 幅 320・1280 × 文字の大きさ0。axe の違反 0、横スクロール 0、h1 が1つ、幅 320 で文字の間隔を広げても横スクロール 0。
- **代表の5画面**（`FULL`：入口 `/`・できごとの全体 `/all`・質問 `/move/basis`・手続きのページ `/c/nagoya-tennyu-juukyochi`・病院 `/clinic`）：3つの表示レベル × 文字の大きさ3つ × 幅 320・640・1280。
- シート（設定・相談窓口）と保存の同意は3つの表示レベル。
- 新しい画面を作ったら `PAGES` に1行足す。全部の組み合わせが要るほど形が違う画面だけ `FULL` に足す。

## そのほかの e2e（`tests/e2e/*.spec.ts`）

デモの経路（A1・B1・付き添い・QR・病院・届いた書類・位置と共有・カレンダー・報告）と、下書きの画面（`tests/e2e/drafts/`）。画面の動きを変えたら、その経路のファイルだけ回す。`verify-prod.spec.ts` は `VERIFY_PREVIEW=1` のときだけ動く。

## フロー（`tests/flows/`）

- `main/`・`drafts/`：作者に見せるスクリーンショットと、確認用の Artifact（マインドマップ）の元。
- `archive/`：もう撮らない確認専用のフロー（11/6 の `todo1106-*` の一部）。`testMatch` と `npm run shots` の外。

## 消した・まとめたテスト（11/7）

| 前 | 後 | 守っていたこと |
|---|---|---|
| `tests/core/lost-integration.test.ts` | `lost.test.ts` に1本 | 財布の紛失の統合の確認で足した条件（なくした場所・警察の受理・見つかったとき） |
| `tests/core/gomi-tool.test.ts` | `gomi.test.ts` に1本 | ごみの判定の部品と道具のデータ（品目・地域・自己搬入・お知らせの期限） |
| a11y 37画面 × 3レベル × 3幅 × 3サイズ | 全画面は ja × 2幅 × 1サイズ、代表5画面だけ全部 | 違反 0・横スクロール 0 の守る所は同じ。組み合わせの数を約14分の1に |
| フロー `todo1106-entry`・`-look`・`-texts`・`-words`・`-report` | `tests/flows/archive/` | 11/6 の作者の確認用（確認は済み。同じ画面は 11/7 のフローで撮っている） |

11/7 の監査で見たこと：単体テストに重複はない（1機能1ファイル。`license` と `license-event` は判定とできごとの保存で対象が違う）。ネットに出るテストはない。
