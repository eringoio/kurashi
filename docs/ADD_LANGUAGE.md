# 言語を足す方法

表示レベルは `data/ui/languages.json` だけで決まります。コードに言語名は書きません。外国語は「その言語の1行＋ふりがな付きのやさしい日本語」の2段で出ます（SPEC 9.2・15.1）。

## 1. 言語の一覧に1行足す

`data/ui/languages.json` の `levels` に足します。例：ベトナム語。

```json
{ "id": "vi", "kind": "foreign", "lang": "vi", "dir": "ltr", "label": "Tiếng Việt", "speechLang": "vi-VN" }
```

| キー | 意味 |
|---|---|
| `id` | 文のキー（`strings.json` やカードの文で、この名前のキーに訳を書く） |
| `kind` | 外国語は `foreign` |
| `lang` | HTML の `lang`。日付の書き方（`Intl`）にも使う |
| `dir` | 右から左に書く言語（アラビア語など）は `rtl` |
| `label` | 設定の画面に出す名前。**その言語で書く**（「ベトナム語」ではなく「Tiếng Việt」） |
| `speechLang` | 読み上げの声の言語 |

これだけで、設定の「ことば」の欄に出ます。初めて開いた人のブラウザの言語が `lang` と同じなら、その言語で始まります。

## 2. 文を訳す

訳は、文ごとに同じ場所に書きます（1つの文のすべての言語が1か所にある）。

- 画面の文：`data/ui/strings.json` の各キーに `"vi": "..."` を足す。
- ガイドの文：`data/cards/*.json`・`rules.json`・`questions.json`・`objects.json`・`relations.json` の、`ja` と `en` がある所に `"vi"` を足す。
- 上の帯のボタン（`nav.settings`）は「その言語の『設定』・設定」の形にする（例：`Cài đặt · 設定`）。日本語の人が見ても、どのボタンかわかるようにするため。

訳がない文は、やさしい日本語で出ます（画面は壊れません）。足りない訳は、次で一覧にします。

```bash
node scripts/missing-translations.cjs vi
```

## 3. 確かめる

1. `tests/e2e/a11y.spec.ts` の `LEVELS` に `{ id: 'vi', lang: 'vi' }` を足す。
2. `npm run test:a11y` を通す（axe の違反 0、幅 320px で横スクロール 0）。長い言語では、ボタンの折り返しを見る。
3. 訳した人と、その言語を話す人に、画面を見てもらう。訳の確認が済むまでは、文に `"status": "draft"` を付ける。

## 4. ガイドの文が変わったとき

日本語（`ja`）を直したら、その文の訳も古くなります。直した Pull Request の中で、同じ文の訳を直すか、訳に `"status": "draft"` を付けます（データの更新の仕組みは `docs/DATA_UPDATE.md`）。

## 5. 言語が多くなったら

10個くらいまでは、設定の1つの欄に格子で並べます。20個を超えたら、言語の一覧だけを別の画面にします（`docs/TODO.md` の B9）。
