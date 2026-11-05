# データ契約 v1（2026-11-04、統括）

`docs/TODAY_EXECUTION_2026-11-04.md` の T3・T6 のための、アプリ用データの共通形式。SPEC 9章・10章を広げる。
**作者が承認した（2026-11-04）。SPEC v0.4.7 に反映済み。**
契約を変えるときは版を上げ、`research/handoff/LEAD-*.md` で全担当に知らせる。

## 1. いまのコードで固定されている部分（v0）

| 場所 | 固定のしかた | v1 での扱い |
|---|---|---|
| `src/pages/Home.tsx` の `MENU` | 入口の4つを直書き | `data/events.json` の `menu` から並べる（UI） |
| `src/pages/Move.tsx` | 引っ越し専用の画面。`Q-origin`・`built_origins` を直接読む | 引っ越しはそのまま動かす。新しい出来事は共通の `/e/{event_id}` で、イベントの `questions` を順に聞く |
| `src/core/engine.ts` | `Q-origin` で持ち物を絞る。範囲のルール `R-scope-nagoya-resident` を直書き | イベントの `scope_rule` と `object_filter_fact` に移す（既定値は今と同じ） |
| `schema.ts` の `place` | `ward_office`・`bank`・`prev_city` の列挙 | 文字列（`[a-z_]+`）。表示名は `strings.json` の `place.<id>`。無ければ「行く所」 |
| 進捗（`plan`・`profile`） | カードIDと質問IDだけで保存。出来事を区別しない | 出来事（occurrence）ごとに分ける（4章） |
| `useGuide` の `review_mode` | 本番でも `verified`（見本）を選べる | 本番ビルドでは常に `public`（T6） |
| `data/cards/*.json` を全部読む | 下書きも混ざりうる | `data/` は公開用だけ。下書きは `drafts/`（5章） |

## 2. 分けるもの

| もの | 置き場所 | 中身 |
|---|---|---|
| 生活イベント（入口） | `data/events.json` | 名前・絵・入口で聞く質問・前提の事実・含む手続き（カードID）・範囲のルール・状態（built／coming_soon） |
| 手続き（カード） | `data/cards/<id>.json` | 今までどおり。**複数のイベントから同じカードを参照する。本文を複製しない** |
| 質問・ルール・持ち物・関係・出典 | 今までどおり1ファイルずつ | 追加は3章 |
| 利用者の進捗 | IndexedDB | 人の答え（`profile`）と、出来事ごとの答え・進捗（`occurrences`）を分ける |

### 2.1 イベント（`data/events.json`）

```json
{ "events": [{
  "id": "E-lost-wallet",
  "group": "lost",
  "title": { "ja": "…", "ja_easy": "…", "en": "…" },
  "illustration": "wallet",
  "status": "built",
  "menu": 2,
  "facts": [{ "fact": "event", "value": "lost_wallet" }],
  "questions": ["Q-lost-items", "Q-lost-or-stolen"],
  "card_ids": ["lost-stop-cards", "police-ishitsu", "zairyu-reissue-lost", "…"],
  "scope_rule": "R-scope-any",
  "evidence": { "source_ids": ["kurashi-spec"], "checked_at": "2026-11-04", "status": "needs_check" }
}]}
```

- `facts`：このイベントを選んだら決まる事実（例：`origin = abroad`）。本人の答えより弱い。
- `questions`：入口で順に聞く質問（`stage: upfront`）。聞くかどうかは今までどおり `ask_when` と未定のルールで決まる。
- `card_ids`：このイベントで判定にかけるカード。ほかのイベントと重なってよい。
- `scope_rule`：範囲のルール（無ければ `R-scope-nagoya-resident`）。
- 引っ越し（`E-move`）は既存の `/move` を使う。`built_origins` は `events.json` の引っ越しの各出発地の `status` に移す（移すまでは flow.json を残す）。

## 3. 型の追加（すべて任意の項目。今のデータはそのまま読める）

| 追加 | 型 | 使う例 |
|---|---|---|
| 複数選択の質問 | `Question.multi: true`。答えは文字列の配列 | 財布の中にあった物 |
| 条件 `has` | `{ "fact": "lost_items", "has": "zairyu_card" }`：配列が含むか | カードごとの停止・再交付 |
| 質問の範囲 | `Question.scope: "person" \| "event"`（既定 `event`） | 年齢・国籍は人、出発地・住み始めたかは出来事 |
| すぐ行う行動 | `Card.urgent: { contacts: [{ type: "phone"\|"link", label, value, evidence }] }` | カードの利用停止。質問より先に出す |
| 手続きの方法 | `Card.methods: [{ type: "counter"\|"online"\|"mail"\|"phone", text, when?: RuleExpr, evidence }]` | 窓口・電子申請・郵送 |
| 日を決めない案内 | `Card.kind: "procedure"（既定）\| "guide"` | 住まい探し・仕事探し・相談。「いつ行くか」を聞かない |
| 代わりの書類 | `Card.alternatives: [{ text, evidence }]` | 身分証をなくしたとき。カード単位（「この手続きで○○が無いとき」）。持ち物の状態ごとの案内は、写す層で `alternatives` から作る |
| 関係 `parallel` | `{ type: "parallel", card_ids: [...] }` | 警察と銀行は同時に進めてよい |
| 関係 `related` | `{ type: "related", from, to }` | 結婚 → 国保の変更。順番を作らない |
| 持ち物の状態 | `objects` の値に `state?: "held"\|"lost"\|"stopped"\|"reissue_waiting"\|"unknown"` | なくした在留カード。**名前はこちらが正**。UI の `src/ui/patterns/types.ts`（`have`・`reissue_wait`・方法の `window`・連絡先の `web`）へは、統括が写す層で読み替える（v1.1。UI-01 への答え） |

順番を変えるのは、今までどおり**確認済み**の `legal_prerequisite`・`practical_prerequisite` だけ。`parallel`・`related` は注記だけ。

## 4. 出来事ごとの進捗（保存。担当：統括）

- IndexedDB に `occurrences` ストアを足す（SCHEMA_VERSION 2。今の upgrade は無いストアを作るだけなので、既存の保存は消えない）。
- 1件：`{ id, event_id, started_on, closed_on?, answers: {Q-id: 値}, plan: {card_id: PlanRecord} }`。
- `scope: person` の質問の答えは今までどおり `profile`。`event` の答えは出来事の `answers`。
- **移行**：v1 の保存にある引っ越しの答え・`plan` は、`E-move` の出来事 `occ-legacy` として読む（書き換えない。A1・B1 の保存・再開を壊さない）。
- 同じイベントをもう一度始めたら、新しい出来事にする。前の出来事の「済んだ」は使わない。同時に複数の出来事が進んでよい。
- 同意の前は何も書かない（9.9）。見るだけでは読まない・書かない。

## 5. 下書きと公開（T6）

- `data/` と `public/` は**公開用だけ**。AI の下書き・調査の結果は `drafts/`（制作）と `research/`（調査）。Vite は読まない。
- 検査（`tests/core/publish.test.ts`）：`data/` に `status: "draft"` が無い／`drafts/` のIDが `data/` に無い／ビルド結果に `drafts/` の文字列が無い。
- `verified` にできるのは作者だけ。`verified` の根拠には `checked_at`・`verified_by`・`quote` が要る（出典が `kurashi-spec` だけのものは `quote` 不要）。
- 本番ビルド（`import.meta.env.PROD`）では `review_mode` を無視し、`/review` の見本の切り替えを出さない。

## 6. データの検査（`checkRefs` に足す）

重複ID（カード・ルール・質問・持ち物・関係・イベント）／存在しない参照（イベントのカード・質問・範囲のルール）／前提の関係の循環／`flow.json` とカードの一致／公開カードの3表示レベルの欠け（`title`・`summary`）／確認済みの根拠の必須項目。

## 7. 新しい生活イベントの足し方

1. 調査票（`research/surveys/`）から、カード・ルール・質問・関係を作る（`drafts/` に）。
2. `events.json` にイベントを1つ足し、`card_ids` と `questions` を書く。
3. `npm test` の検査を通す。作者が承認した差分だけを `data/` に移す。
4. React の画面・判定の関数は足さない（合格条件：結婚の検証データ `tests/fixtures/marriage/` が専用コードなしで動く）。

## 8. SPEC との差（承認済み。SPEC v0.4.7）

1. 9章：`events.json`（生活イベント）を足す。6A.1 の入口のメニューをデータから作る。
2. 9.3・9.4：質問の `multi`・`scope`、条件 `has`。
3. 9.5：カードの `urgent`・`methods`・`kind: guide`・`alternatives`。
4. 9.6：関係 `parallel`・`related`（注記だけ）。
5. 9.9：保存に `occurrences`（出来事ごと）。
6. 18章：本番では確認済み見本モードを使えない。

## 9. v1.2（2026-11-05。SPEC v0.4.9 の AI照合済み）

SPEC v0.4.9 の決定の範囲だけを足す。今のデータはそのまま読める。

| 項目 | 形 | 意味 |
|---|---|---|
| 確認状態 | `Evidence.status` に `ai_checked` | 公式のページと AI で照合した（作者の確認前）。`verified` にできるのは作者だけ（今までどおり） |
| 照合の記録 | `Evidence.ai_check?: { fetched_at, sha256, verdict: "agree"\|"disagree", ref }` | 引用を見つけた本文の取得日とハッシュ、独立の照合の結果、その記録の場所 |
| 本文 | `sources/snapshots/<source_id>/<fetched_at>.txt` | 取得した本文。`sha256` はこのファイルのハッシュ |

- **扱いの表**は `src/core/trust.ts` の `AI_CHECK_COUNTS` 1か所だけ。`ai_checked` を `verified` と同じに扱うのは、行く所（`where`）・方法（`methods`）・連絡先・リンク・持ち物の名前・手続きの名前と説明。**義務・期限（`deadline`）・費用・対象者（`rules` の全部）・前提の関係（`legal_prerequisite`・`practical_prerequisite`・`day_order`）・ほかの関係は U のまま**。
- **検査**：読み込み（`checkRefs`）で、`ai_checked` に `quote` と `ai_check` が無ければ止める。`npm run check:quotes`（`scripts/check-quotes.ts`）で、引用が本文にそのままあるか（空白の違いだけをそろえる）、ハッシュが合うか、`verdict` が `agree` かを確かめる。項目 6（データの更新）の CI でも同じものを使う。
- **画面**：`ai_checked` の項目には「AI で照合（作者の確認前）」の印（点線の枠と文字。色だけにしない）。`/review` に「作者が確認する一覧」（U のまま残った項目・照合が食い違った項目）と、上の表を出す。
