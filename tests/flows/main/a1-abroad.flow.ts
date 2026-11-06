/* A1：日本の外から来た人の経路（本番データ）。入口 → 道のり → 持ち物 → 質問 → 全体 → いまの1つ → 区役所の日 → 保存して再読み込み */
import { expect, flow } from '../lib';

flow({
  id: 'a1-abroad',
  title: 'A1：日本の外から来た',
  touches: ['tests/e2e/a1.spec.ts', 'src/pages/**', 'src/core/entry.ts', 'data/**'],
  evidence: ['nagoya-tennyu-juukyochi', 'nagoya-kokuho-kanyu', 'kokumin-nenkin-kanyu', 'bank-account-open', 'docs/VERIFY_DEMO.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();

  await page.goto('/');
  await snap({ name: '入口', expected: '入口のメニューに「引っ越し・住む場所のこと」がある', why: '入口の出し分け（SPEC 6A.1）。保存が無いときはメニュー' },
    async () => { await expect(page.getByRole('link', { name: '引っ越し・住む場所のこと' })).toBeVisible(); });

  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await snap({ name: '住む場所は変わったか', expected: '「最近、住む場所は変わりましたか？」', why: '引っ越しの入口の最初の質問' },
    async () => { await expect(h1).toHaveText('最近、住む場所は変わりましたか？'); });

  await tap('はい');
  await snap({ name: 'どこから', input: 'はい', expected: '「どこから引っ越しましたか？」', why: '経路（A1・B1・X2）を分ける質問' },
    async () => { await expect(h1).toHaveText('どこから引っ越しましたか？'); });

  await tap('日本の外から');
  await snap({ name: '持ち物', input: '日本の外から', expected: '「持っている物を、全部さわってください」', why: '持ち物の答えが、あとの質問を減らす（SPEC 6A）' },
    async () => { await expect(h1).toHaveText('持っている物を、全部さわってください'); });

  for (const name of [/^在留カード/, /^パスポート/, /^部屋の鍵/, /^学生証/]) await page.getByRole('button', { name }).click();
  await snap({ name: '4つ選んだ', input: '在留カード・パスポート・部屋の鍵・学生証', expected: '4つが選ばれた印', why: 'aria-pressed で選択状態を持つ' },
    async () => { await expect(page.getByRole('button', { name: /^在留カード/ })).toHaveAttribute('aria-pressed', 'true'); });

  await tap('つぎへ');
  await snap({ name: '在留カードの裏', input: 'つぎへ', expected: '「在留カードの裏に、今の住所が書いてありますか？」。保存の同意の案内が出る（画面をふさがない）', why: '最初の答えで同意が出る（SPEC 9.9）' },
    async () => { await expect(h1).toHaveText('在留カードの裏に、今の住所が書いてありますか？'); await expect(page.getByRole('region', { name: /残しますか/ })).toBeVisible(); });

  await tap('書いてある');
  await snap({ name: '立場', input: '書いてある', expected: '「今のおもな立場」を聞く', why: '入口の質問（upfront）の順。立場で国民年金・国保の判定が変わる' },
    async () => { await expect(h1).toHaveText(/今のおもな立場/); });

  await tap(/^学生$/);
  await snap({ name: '年齢', input: '学生', expected: '「年齢は？」', why: '入口の質問の順。年齢で年金（20歳）の判定が変わる' },
    async () => { await expect(h1).toHaveText('年齢は？'); });

  await tap('20歳から59歳まで');
  await snap({ name: '全体', input: '20歳から59歳まで', expected: '「これからのこと」。最初の確かめのあと、全体が1回だけ開く', why: '6A.4：全体は最初の確かめのあとに1回' },
    async () => { await expect(h1).toHaveText('これからのこと'); });

  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.getByRole('link', { name: 'いま', exact: true }).click();
  await snap({ name: 'いまの1つ（健康保険）', input: '保存に同意（残す）→ いま', expected: '「健康保険はどれに入っていますか？」', why: '国保は在留カード＋学生で入る必要がある可能性。確かめの質問を順に聞く' },
    async () => { await expect(h1).toHaveText('健康保険はどれに入っていますか？'); });

  const answerThenNext = async (name: string | RegExp) => { await tap(name); await expect(page.locator('.k-change__line')).toHaveText(/になりました$/); };
  await tap('まだどれにも入っていない');
  await snap({ name: '答えで変わったこと', input: 'まだどれにも入っていない', expected: '次の1つの上に「〇〇になりました」の1行と「答えを変える」。結果の画面と「つぎへ」は出ない', why: '答えたあとは1行だけ（SPEC 6A.5 v0.5.14）' },
    async () => { await expect(page.locator('.k-change__line')).toHaveText(/になりました$/); await expect(page.getByRole('button', { name: '答えを変える' })).toBeVisible(); });
  await answerThenNext(/^どちらでもない（厚生年金/);
  await answerThenNext(/^ない$/);
  await snap({ name: '住み始めたか', input: '年金・口座の答え', expected: '「新しい住所に、もう住み始めましたか？」', why: '年金→口座→住み始めた、の順（質問の並び）' },
    async () => { await expect(h1).toHaveText('新しい住所に、もう住み始めましたか？'); });
  await answerThenNext(/^はい$/);

  await snap({ name: '区役所の日（まとめて）', input: 'はい', expected: '「いつ、区役所に行きますか？」。区役所の3つの手続きを同じ日にまとめて聞く', why: '同じ所の項目は行く日を一度に聞く（SPEC 6A.5）' },
    async () => { await expect(h1).toHaveText('いつ、区役所に行きますか？'); await expect(page.locator('.together .k-check')).toHaveCount(3); await expect(page.locator('.together')).toContainText('住所の届け'); });

  await tap(/^今日/);
  await snap({ name: '今日に決めた', input: '今日', expected: '「〇〇に決めました」', why: '選んだあとは次の1つの上に1行だけ' },
    async () => { await expect(page.locator('.k-change__line')).toHaveText(/に決めました$/); });
  await snap({ name: '今日は行く日', input: '今日', expected: '区役所の3つを今日に決めたので、「今日は行く日です」', why: '今日の予定を「日を決める」の後ろに隠さない（K-35）。銀行の日は全体から決められる' },
    async () => { await expect(h1).toHaveText('今日は行く日です'); });

  // 保存に同意したので、再読み込みしても同じ
  await page.reload();
  await snap({ name: '再読み込みのあと', input: '再読み込み', expected: '再読み込みの前と同じ「今日は行く日です」。区役所の日は聞き直さない', why: '同意（残す）のあとは IndexedDB に残る。続きが同じ（SPEC 9.9・6A.1）' },
    async () => { await expect(h1).toHaveText('今日は行く日です'); });
  // 開き直し（トップ）でも、保存した進捗から続きの画面へ
  await page.goto('/');
  await snap({ name: 'トップから開き直す', input: 'トップを開く', expected: '入口のメニューに戻らず、保存した進捗から続きの画面へ。区役所の日を今日にしたので「今日は、行く日に決めた日です」', why: '6A.1 の出し分け：今日が決めた日なら「今日は行く日」（保存があれば続きから）' },
    async () => { await expect(page).toHaveURL(/\/today$/); await expect(h1).toHaveText('今日の予定'); });
});
