# Illustrations

The hand-drawn pieces of the kurashi prototype (Claude Design canvas, round 6, artboard D). Each piece is drawn in a 48-unit box (状態の印 `badge` and `clock`: 20 units) with a 2.4 `ink-art` (#2A2A2E) stroke, round caps and joins, and one `art-*` fill.

- `*-dim.svg`: the dim form (white fill, dashed #9A9286 stroke). Use it for a procedure that is not decided, must be asked at the counter, is for later, or is not for you. For "not for you", lay `cross.svg` over the dim piece.
- `badge.svg` (done) and `clock.svg` (waiting or later) sit on the top-right corner of a piece, about 0.4 of its size.
- Never put words inside a picture. Labels are HTML beside or under the picture. Every picture that carries meaning gets a text label; decorative ones get `alt=""`.
- The files use plain hex colours, so they also work in `<img>`. In code, the same paths can use `vector-effect: non-scaling-stroke` when scaled.

| File | Group | 名前 | Name | 使う場所 |
|---|---|---|---|---|
| `you.svg` | People | わたし | Me | 全体の絵の真ん中、最初の問い |
| `card.svg` · `card-dim.svg` | Things | 在留カード | Residence card | 持ち物 |
| `cardback.svg` · `cardback-dim.svg` | Things | 在留カードの裏（住所の欄） | Back of the residence card | 住所の欄を見る確かめ |
| `mycard.svg` · `mycard-dim.svg` | Things | マイナンバーカード | My Number Card | 持ち物（国内） |
| `passport.svg` · `passport-dim.svg` | Things | パスポート | Passport | 持ち物 |
| `student.svg` · `student-dim.svg` | Things | 学生証 | Student ID | 持ち物、QRから |
| `key.svg` · `key-dim.svg` | Things | 部屋の鍵 | Room key | 持ち物（電気・水道） |
| `hcard.svg` · `hcard-dim.svg` | Things | 健康保険のカード | Health insurance card | 国民健康保険、持ち物 |
| `doc.svg` · `doc-dim.svg` | Things | 書類（年金） | Document | 国民年金 |
| `letter.svg` · `letter-dim.svg` | Things | 手紙・書類 | Letter | 書類を撮る、転出証明書 |
| `cashcard.svg` · `cashcard-dim.svg` | Things | キャッシュカード | Cash card | 銀行、持ち物 |
| `calendar.svg` · `calendar-dim.svg` | Things | カレンダー | Calendar | 20歳の年金のお知らせ |
| `work.svg` · `work-dim.svg` | Things | 仕事のかばん | Work bag | 働くための許可 |
| `bulb.svg` · `bulb-dim.svg` | Things | 電球（電気・水道） | Light bulb | 電気・水道 |
| `bin.svg` · `bin-dim.svg` | Things | ごみ箱 | Garbage bin | ごみの出し方 |
| `box.svg` · `box-dim.svg` | Things | 引っ越しの箱 | Moving box | ほかの市から、転出届 |
| `plane.svg` · `plane-dim.svg` | Things | 飛行機 | Plane | 日本の外から |
| `qr.svg` · `qr-dim.svg` | Things | QRコード | QR code | QRから開く |
| `search.svg` · `search-dim.svg` | Things | 虫めがね | Magnifier | ほかの手続きを探す |
| `house.svg` · `house-dim.svg` | Places | 家 | House | 住所の届け、転入届 |
| `homemove.svg` · `homemove-dim.svg` | Places | 家から家へ | Moving home | 住む場所は変わった？（はい） |
| `homecheck.svg` · `homecheck-dim.svg` | Places | 変わらない家 | Same home | 住む場所は変わった？（いいえ） |
| `hall.svg` · `hall-dim.svg` | Places | 区役所 | Ward office | 位置から、範囲外 |
| `bank.svg` · `bank-dim.svg` | Places | 銀行 | Bank | 銀行の口座 |
| `pin.svg` · `pin-dim.svg` | Places | 場所の印 | Map pin | いまいる場所から |
| `ask.svg` | States | まだわからない（？） | Not known yet | 状態の形 |
| `badge.svg` | States | 済みの印 | Done badge | 状態の形（絵の右上に重ねる） |
| `clock.svg` | States | 待つ・あとで | Waiting / later | 状態の形（絵の右上に重ねる） |
| `cross.svg` | States | 関係なし（×） | Not for you | 状態の形（絵に重ねる） |
| `check-ai.svg` | Marks | AIチェック | AI check | 期限・費用・義務の欄の印（v0.5.2） |
| `check-human.svg` | Marks | 確認済み | Checked by the author | 期限・費用・義務の欄の印（v0.5.2） |
| `gomi-kanen.svg` | Garbage | 可燃ごみ | Burnable waste | ごみの画面の区分 |
| `gomi-funen.svg` | Garbage | 不燃ごみ | Non-burnable waste | ごみの画面の区分 |
| `gomi-plastic.svg` | Garbage | プラスチック資源 | Plastic resources | ごみの画面の区分 |
| `gomi-kamipack.svg` | Garbage | 紙パック・紙製容器包装 | Paper cartons and paper packaging | ごみの画面の区分 |
| `gomi-petbottle.svg` | Garbage | ペットボトル | PET bottle | ごみの画面の区分 |
| `gomi-bin.svg` | Garbage | びん | Glass bottle | ごみの画面の区分 |
| `gomi-kan.svg` | Garbage | 缶 | Can | ごみの画面の区分 |
| `gomi-kami.svg` | Garbage | 古紙 | Used paper | ごみの画面の区分 |
| `gomi-bulky.svg` | Garbage | 粗大ごみ | Bulky waste | ごみの画面の区分 |
| `gomi-hakka.svg` | Garbage | 発火性危険物 | Fire-risk items (spray cans, batteries) | ごみの画面の区分 |
| `gomi-kaden.svg` | Garbage | 家電4品目 | Four home appliances | ごみの画面の区分 |
| `gomi-not.svg` | Garbage | 市が集めない物 | Items the city does not collect | ごみの画面の区分 |
| `bag-kanen.svg` | Garbage bag | 可燃ごみの指定袋（赤い印刷） | Burnable-waste bag (red print) | ごみの種類の表の袋 |
| `bag-funen.svg` | Garbage bag | 不燃ごみの指定袋（緑の印刷） | Non-burnable bag (green print) | ごみの種類の表の袋 |
| `bag-shigen.svg` | Garbage bag | 資源用の指定袋（青い印刷） | Resource bag (blue print) | ごみの種類の表の袋 |
| `bag-clear.svg` | Garbage bag | 無色透明の袋 | Clear bag | ごみの種類の表の袋 |
| `bag-basket.svg` | Garbage bag | 青いかご（袋を使わない） | Blue basket (no bag) | ごみの種類の表の袋 |
| `bag-none.svg` | Garbage bag | 収集日の袋を使わない | No collection bag | ごみの種類の表の袋 |
| `status-japan.svg` · `status-japan-dim.svg` | Status | 日本国籍（戸籍の紙） | Japanese nationality (family register) | 在留資格の質問（B-4） |
| `status-foreign.svg` · `status-foreign-dim.svg` | Status | 日本以外の国籍（在留カード＋地球） | Non-Japanese nationality | 在留資格の質問（B-4） |
| `status-student.svg` · `status-student-dim.svg` | Status | 在留資格：留学 | Status: Student | 在留資格の質問（B-4） |
| `status-family.svg` · `status-family-dim.svg` | Status | 在留資格：家族滞在 | Status: Dependent | 在留資格の質問（B-4） |
| `status-work.svg` · `status-work-dim.svg` | Status | 在留資格：就労 | Status: Work | 在留資格の質問（B-4） |
| `status-spouse.svg` · `status-spouse-dim.svg` | Status | 在留資格：配偶者等 | Status: Spouse etc. | 在留資格の質問（B-4） |
| `status-permanent.svg` · `status-permanent-dim.svg` | Status | 在留資格：永住者・特別永住者 | Status: Permanent resident | 在留資格の質問（B-4） |
| `status-longterm.svg` · `status-longterm-dim.svg` | Status | 在留資格：定住者 | Status: Long-term resident | 在留資格の質問（B-4） |
| `status-other.svg` · `status-other-dim.svg` | Status | 在留資格：そのほか | Status: Other | 在留資格の質問（B-4） |
| `plan-1r.svg` | Plans | 間取り図：1R | Floor plan: 1R | 住まい探しの間取り図（B-8a） |
| `plan-1k.svg` | Plans | 間取り図：1K | Floor plan: 1K | 住まい探しの間取り図（B-8a） |
| `plan-1dk.svg` | Plans | 間取り図：1DK | Floor plan: 1DK | 住まい探しの間取り図（B-8a） |
| `plan-1ldk.svg` | Plans | 間取り図：1LDK | Floor plan: 1LDK | 住まい探しの間取り図（B-8a） |
| `plan-2dk.svg` | Plans | 間取り図：2DK | Floor plan: 2DK | 住まい探しの間取り図（B-8a） |
