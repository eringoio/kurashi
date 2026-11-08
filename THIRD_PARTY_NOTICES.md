# 第三者の著作物と出典

このリポジトリの作者が権利を持つもの（コード・文・絵）は MIT ライセンスです（`LICENSE`）。次のものは MIT の対象外です。それぞれの条件に従います。

## データの出典

| もの | 出典 | 条件 |
|---|---|---|
| ごみの分別の品目（`data/gomi/opendata.json`） | 名古屋市「家庭ごみ・資源の分別早見表」（BODIK のオープンデータ） | CC BY 4.0。加工して使っています（区分・備考は名古屋市の現在の表に合わせました） |
| ごみの収集日（`data/gomi/schedule.json`） | 名古屋市「ごみ収集日」の町名表（https://www.city.nagoya.jp/kurashi/gomi/1012183/1037098.html） | 名古屋市の許可を得て、アプリで使える形に直して掲載しています（2026-11-08） |
| 祝日（`data/holidays.json`） | 内閣府「国民の祝日」CSV | 内閣府のウェブサイトの利用規約 |
| 区役所などの座標（`data/places.json`） | 国土地理院の住所検索 | 国土地理院コンテンツ利用規約 |
| 手続きの根拠の引用（`data/**` の `evidence.quote`）と出典の一覧（`data/sources.json`） | 名古屋市・出入国在留管理庁・厚生労働省・日本年金機構・愛知県などの公式ページ | 各ページからの短い引用です。出典の URL を `data/sources.json` に示します。引用の著作権は各ページの著作者にあります |

アプリの案内は、公式の情報をもとにした目安です。手続きの条件・期限・料金は変わることがあります。最終的には公式のページと窓口で確かめてください。

## アプリに含むライブラリと字体

| 名前 | ライセンス |
|---|---|
| Zen Maru Gothic（`@fontsource/zen-maru-gothic`） | SIL Open Font License 1.1 |
| budoux | Apache License 2.0 |
| react・react-dom | MIT |
| zod | MIT |
| qrcode | MIT |
| idb | ISC |
| @anthropic-ai/sdk（Worker で使う） | Apache License 2.0 |

## 開発だけで使うもの

| 名前 | ライセンス |
|---|---|
| kuromoji（ふりがなの生成。`npm run furigana`） | Apache License 2.0。辞書は IPADIC を元にしています（IPADIC のライセンス。kuromoji の NOTICE を参照） |

ほかの開発用のパッケージのライセンスは、`package-lock.json` と各パッケージの中を見てください。
