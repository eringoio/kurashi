/* 出す方法・期限の日（SPEC v0.5.45。FE-14・C-3・V-5）：方法を先に聞き、郵送なら「行く」と聞かない。
   数え始める日を入れると期限の日を出し、期限より後の日は止めずに知らせる */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const keep = async (page: Page) => {
  const consent = page.getByRole('region', { name: /残しますか/ });
  await consent.getByRole('button', { name: '残す', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await expect(consent).toHaveCount(0);
  await page.waitForTimeout(300);
};
async function answerAll(page: Page, plan: [RegExp, RegExp][], until: RegExp) {
  for (let i = 0; i < 20; i++) {
    const h = page.locator('#screen-title');
    await expect(h).toBeVisible();
    const t = await h.innerText();
    if (until.test(t)) return;
    const hit = plan.find(([q]) => q.test(t));
    if (!hit) throw new Error('想定していない質問：' + t);
    await page.getByRole('button', { name: hit[1] }).first().click();
    await expect(h).not.toHaveText(t);
    if (i === 0) await keep(page);
  }
}
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const jstToday = () => new Date(Date.now() + 9 * 3600_000);

test('市外への転出届：方法を先に聞く。郵送なら「いつ郵送しますか」。方法を変えられる', async ({ page }) => {
  await page.goto('/e/E-move-out');
  await answerAll(page, [[/国籍/, /^日本以外の国籍/], [/在留資格/, /留学/], [/年齢/, /20.*59/], [/どこへ/, /ほかの市/], [/マイナンバーカード/, /^持っていない|^いいえ|^ない/], [/健康保険/, /どれにも/], [/年金について/, /どちらでもない/]], /どの方法で出しますか/);
  await expect(page.getByRole('button', { name: /窓口に行く/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /郵送で出す/ })).toBeVisible();
  // マイナンバーカードの答えがまだ：オンラインは条件の文つきで選べる（FF-1）
  await expect(page.getByRole('button', { name: /オンラインで出す.*マイナンバーカード/ })).toBeVisible();
  await expect(page.getByText(/期限は、どの方法でも同じ/)).toBeVisible();
  await page.getByRole('button', { name: /郵送で出す/ }).click();
  await expect(page.locator('#screen-title')).toHaveText(/いつ郵送しますか/);
  await page.getByRole('button', { name: /方法を変える/ }).click();
  await expect(page.locator('#screen-title')).toHaveText(/どの方法で出しますか/);
  await page.getByRole('button', { name: /窓口に行く/ }).click();
  await expect(page.locator('#screen-title')).toHaveText(/区役所に行きますか/);
});

test('転入届：住み始めた日を入れると期限の日。期限より後の日は知らせて、選び直せる・そのままにもできる', async ({ page }) => {
  await page.goto('/e/E-move');
  await answerAll(page, [
    [/国籍/, /^日本以外の国籍/], [/在留資格/, /留学/], [/年齢/, /20.*59/], [/どこから/, /ほかの市/], [/転出届/, /紙の転出証明書/],
    [/健康保険/, /どれにも/], [/年金について/, /どちらでもない/], [/国民年金に入って/, /^入っていない/], [/口座/, /^ない/], [/住み始め/, /^はい/],
  ], /いつ、区役所に行きますか/);
  // 13日前に住み始めた → 期限の日は明日
  const t = jstToday();
  const from = ymd(new Date(t.getTime() - 13 * 86_400_000));
  const due = ymd(new Date(t.getTime() + 1 * 86_400_000));
  await page.getByLabel(/数え始める日/).fill(from);
  const [, m, d] = due.split('-').map(Number);
  await expect(page.getByText(new RegExp(`期限の日：${m}月${d}日`))).toBeVisible();
  // 期限より後の日（カレンダーで選べる最後の日）
  await page.locator('.cal__table button:not([disabled])').last().click();
  const warn = page.getByRole('alert').filter({ hasText: /期限の日.*より後です/ });
  await expect(warn).toBeVisible();
  await expect(warn.getByText(/遅れても届け出は必要/)).toBeVisible();
  await expect(warn).toBeFocused();
  // 同じ日をもう一度押しても、知らせを飛ばして決めない（FF-4）
  await page.locator('.cal__table button:not([disabled])').last().click();
  await expect(warn).toBeVisible();
  await warn.getByRole('button', { name: /ほかの日を選ぶ/ }).click();
  await expect(warn).toHaveCount(0);
  await expect(page.locator('#screen-title')).toBeFocused(); // FF-5
  await expect(page.locator('#screen-title')).toHaveText(/いつ、区役所に行きますか/);
  await page.locator('.cal__table button:not([disabled])').last().click();
  await page.getByRole('alert').getByRole('button', { name: /この日にする/ }).click();
  await page.getByRole('link', { name: /^全体/ }).first().click();
  await expect(page.locator('[data-card="nagoya-tennyu-todoke"]').first().getByText('期限より後の予定')).toBeVisible();
  await expect(page.locator('[data-card="nagoya-tennyu-todoke"]').first().getByText(new RegExp(`期限 ${m}月${d}日`))).toBeVisible();
});

test('まだ答えていない質問・窓口で確かめる項目の数と、まだわからない項目への移動（V-5）', async ({ page }) => {
  await page.goto('/e/E-job');
  await page.getByRole('button', { name: /仕事を辞める/ }).click();
  await keep(page);
  await answerAll(page, [[/国籍/, /^日本以外の国籍/], [/在留資格/, /^就労|技術|仕事/], [/年齢/, /20.*59/], [/健康保険は/, /会社|職場/], [/次の勤め先/, /いいえ|入らない/], [/年金/, /厚生/]], /雇用保険に入っていましたか/);
  await page.getByRole('link', { name: /^全体/ }).first().click();
  await expect(page.locator('.road__summary')).toContainText(/まだ答えていない質問がある項目：1/);
  await page.getByRole('button', { name: /まだわからない項目へ/ }).click();
  await expect(page.locator('.road__stage--ask a').first()).toBeFocused();
});

test('アクセシビリティ：方法を選ぶ画面と、数え始める日・期限の知らせ（axe の違反 0・幅 320 で横スクロール 0）', async ({ page }) => {
  const AxeBuilder = (await import('@axe-core/playwright')).default;
  const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
  const check = async () => {
    for (const width of [320, 640]) {
      await page.setViewportSize({ width, height: 800 });
      const r = await new AxeBuilder({ page }).withTags(TAGS).include('main').analyze();
      expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(','))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  };
  await page.goto('/e/E-move-out');
  await answerAll(page, [[/国籍/, /^日本以外の国籍/], [/在留資格/, /留学/], [/年齢/, /20.*59/], [/どこへ/, /ほかの市/], [/マイナンバーカード/, /^持っていない|^いいえ|^ない/], [/健康保険/, /どれにも/], [/年金について/, /どちらでもない/]], /どの方法で出しますか/);
  await check();
  await page.goto('/e/E-move');
  await answerAll(page, [
    [/国籍/, /^日本以外の国籍/], [/在留資格/, /留学/], [/年齢/, /20.*59/], [/どこから/, /ほかの市/], [/転出届/, /紙の転出証明書/],
    [/健康保険/, /どれにも/], [/年金について/, /どちらでもない/], [/国民年金に入って/, /^入っていない/], [/口座/, /^ない/], [/住み始め/, /^はい/],
  ], /いつ、区役所に行きますか/);
  const t = jstToday();
  await page.getByLabel(/数え始める日/).fill(ymd(new Date(t.getTime() - 13 * 86_400_000)));
  await page.locator('.cal__table button:not([disabled])').last().click();
  await expect(page.getByRole('alert').filter({ hasText: /より後です/ })).toBeVisible();
  await check();
});
