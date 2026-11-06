/* 11/6 の直し（A-10・A-6・A-12・A-5）：入口の順番、位置を一度だけ聞く、設定の「位置」、共有のアイコン。
   上の帯は幅 320・390・1280 で撮る（相談・設定もアイコンだけにするかを作者が決めるため） */
import { expect, flow } from '../lib';

flow({
  id: 'todo1106-entry',
  title: '11/6 の直し：入口の順番・位置・設定・共有',
  touches: ['src/pages/Home.tsx', 'src/ui/Location.tsx', 'src/ui/Settings.tsx', 'src/ui/ShareSheet.tsx', 'src/App.tsx', 'src/storage/prefs.tsx', 'data/ui/strings.json'],
  evidence: ['docs/TODO_2026-11-06.md', 'tests/e2e/location-share.spec.ts'],
}, async (page, snap) => {
  const tap = (name: string | RegExp) => page.getByRole('button', { name }).first().click();
  for (const w of [320, 390, 1280]) {
    await page.setViewportSize({ width: w, height: 760 });
    await page.goto('/');
    await snap({ name: '入口 幅' + w, input: '/ を開く（幅 ' + w + 'px）', expected: '上の帯：共有（アイコンだけ）・相談・設定。入口の順：引っ越し → ごみ → 届いた書類 → 病院 → … → 探す。「いまいる場所から」のリンクは無い', why: 'A-10・A-5（相談・設定をアイコンだけにするかは作者が決める）' },
      async () => { await expect(page.getByRole('button', { name: '共有', exact: true })).toBeVisible(); await expect(page.getByRole('link', { name: 'いまいる場所から' })).toHaveCount(0); });
  }
  await page.setViewportSize({ width: 390, height: 760 });
  await tap('共有');
  await snap({ name: '共有のシート', input: '共有のアイコン', expected: '入口の URL・「URL をコピー」・QR', why: 'A-5：答え・日付は URL に入れない' },
    async () => { await expect(page.getByRole('dialog')).toContainText('https://kurashi.eringo.io/'); });
  await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();

  // 同意のあと、入口で位置を聞く
  await page.getByRole('link', { name: '引っ越し・住む場所のこと' }).click();
  await tap('はい');
  await tap('日本の外から');
  for (const name of [/^在留カード/, /^パスポート/, /^部屋の鍵/, /^学生証/]) await page.getByRole('button', { name }).click();
  await tap('つぎへ');
  await tap('書いてある');
  await tap(/^学生$/);
  await tap('20歳から59歳まで');
  await page.getByRole('region', { name: /残しますか/ }).getByRole('button', { name: '残す', exact: true }).click();
  await page.locator('a.brand').click();
  await snap({ name: '位置を聞く', input: '残す → 入口にもどる', expected: '「近くの場所を出すために、位置を使いますか？」と［使う］［使わない］。位置は送らず残さない', why: 'A-6：起動時に一度だけ。断ったら自動では聞かない' },
    async () => { await expect(page.getByRole('heading', { name: /位置を使いますか/ })).toBeVisible(); });
  await page.getByRole('button', { name: '使わない', exact: true }).click();
  await tap(/^設定/);
  await snap({ name: '設定の位置', input: '使わない → 設定', expected: '設定に「位置」（ピンのアイコンと見出し）と［使う］［使わない］。使わないが選ばれている', why: 'A-12：設定で変えられる' },
    async () => { await expect(page.getByRole('group', { name: '位置' }).getByRole('button', { name: '使わない' })).toHaveAttribute('aria-pressed', 'true'); });
});
