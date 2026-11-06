# テスト：何をどこで確かめるか（2026-11-07）

作者の指示（11/6 夜）：テストが多すぎる。要らないテストは省き、必要な所だけ。**変えたときに、変えた所に近いテストを回す。**

## いつ何を回すか

| コマンド | 中身 | かかる時間 | いつ回す |
|---|---|---|---|
| `npm test` | Vitest（`tests/core/`・`tests/unit/`）。判定・データの検査・保存・Worker | 約10秒 | いつも（コミットの前） |
| `npm run test:slow` | 下書きを全部いっしょに読む検査（`drafts-all`）、下書きの制作（`produce`）、データの更新の試運転（`data-update-run`） | 数十秒 | 下書き・`scripts/produce`・`scripts/update-agent.ts` を変えたとき |
| `npm run check:quotes` | `ai_checked` の引用が保存した本文（`sources/snapshots/`）にあるか | 数秒 | 根拠（`evidence`）を変えたとき |
| `npm run test:a11y` | Playwright＋axe（`tests/e2e/`） | 約5分 | 画面を変えたとき。1つだけは `npx playwright test -g "名前"` |
| `npm run shots` | フロー（`tests/flows/main`・`drafts`）のスクリーンショット。変えたファイルに関係するフローだけ | 1〜3分 | 画面を変えて作者に見せるとき |
| `npm run build` | 型・ビルド・配信物に下書きの ID が入っていないか（`check-dist`） | 約10秒 | 公開の前・データを公開へ移したとき |
| `npm run check` | 上の全部（a11y を含む） | 約10分 | 区切りのとき |

## a11y（`tests/e2e/a11y.spec.ts`）

- **全画面**（`PAGES`）：ふつうの日本語 × 幅 320・1280 × 文字の大きさ0。axe の違反 0、横スクロール 0、h1 が1つ、幅 320 で文字の間隔を広げても横スクロール 0。
- **代表の5画面**（`FULL`：入口 `/`・できごとの全体 `/all`・質問 `/move/basis`・手続きのページ `/c/nagoya-tennyu-juukyochi`・病院 `/clinic`）：3つの表示レベル × 文字の大きさ3つ × 幅 320・640・1280。
- シート（設定・相談窓口）と保存の同意は3つの表示レベル。
- 新しい画面を作ったら `PAGES` に1行足す。全部の組み合わせが要るほど形が違う画面だけ `FULL` に足す。

## そのほかの e2e（`tests/e2e/*.spec.ts`）

デモの経路（A1・B1・付き添い・QR・病院・届いた書類・位置と共有）と、下書きの画面（`tests/e2e/drafts/`）。画面の動きを変えたら、その経路のファイルだけ回す。

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
