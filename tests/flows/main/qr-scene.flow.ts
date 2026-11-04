/* QR から開く（SPEC 9.8）：区役所の QR の画面と、始める場面（/s/move → /move） */
import { expect, flow } from '../lib';

flow({
  id: 'qr-scene',
  title: 'QR：場面（区役所・引っ越し）',
  touches: ['tests/e2e/qr.spec.ts', 'src/pages/Scene.tsx', 'src/core/scene.ts', 'data/scenes.json'],
  evidence: ['docs/QR_SCENES.md'],
}, async (page, snap) => {
  const h1 = page.locator('h1');

  await page.goto('/s/ward-office');
  await snap({ name: '区役所の QR', input: '/s/ward-office を開く', expected: '「区役所で行う手続き」と「ここで行う手続き」の一覧', why: '場面の QR は /s/{id} だけ（SPEC 9.8）。区役所の QR は、その場所で行う手続きを見せる' },
    async () => { await expect(h1).toHaveText('区役所で行う手続き'); await expect(page.getByRole('heading', { level: 2, name: 'ここで行う手続き' })).toBeVisible(); });

  await page.goto('/s/move');
  await snap({ name: '引っ越しの QR', input: '/s/move を開く', expected: 'URL が /move になり、「最近、住む場所は変わりましたか？」から始まる', why: '始める場面は、アプリの決まったページへそのまま移る' },
    async () => { await expect(page).toHaveURL(/\/move$/); await expect(h1).toHaveText('最近、住む場所は変わりましたか？'); });
});
