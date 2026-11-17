/* 行く所でまとめる（SPEC 6A.4・10.3 v0.5.44）：引っ越しの全体の道で、区役所の手続きが「次はこれ」に1つの訪問としてまとまり、
   銀行は「そのあと」。完了は手続きごとに記録でき、一部だけ済んでも残りは消えない。再読み込みしても残る（同意のあと） */
import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const keep = async (page: Page) => {
  const consent = page.getByRole('region', { name: /残しますか/ });
  await consent.getByRole('button', { name: '残す', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await expect(consent).toHaveCount(0);
  await page.waitForTimeout(300);
};
/** 見出しに合う質問に、名前に合うボタンで答える（決まった順でなくてよい） */
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
const OTHER_CITY: [RegExp, RegExp][] = [
  [/国籍/, /^日本以外の国籍/], [/在留資格/, /留学/], [/年齢/, /20.*59/], [/どこから/, /ほかの市/], [/転出届/, /紙の転出証明書/],
  [/健康保険/, /どれにも/], [/年金について/, /どちらでもない/], [/国民年金に入って/, /^入っていない/], [/口座/, /^ない/], [/住み始め/, /^はい/],
];

test('引っ越し（市外から）：区役所の3つが「次はこれ」にまとまり、銀行は「そのあと」。完了は1つずつ', async ({ page }) => {
  await page.goto('/e/E-move');
  await answerAll(page, OTHER_CITY, /いつ、区役所に行きますか/);
  // 行く日は区役所の手続きまとめて1回（同じ所の手続きにチェックが付いている）
  await expect(page.getByRole('button', { name: /国民健康保険/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /国民年金/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: /^全体/ }).first().click();
  const next = page.locator('.road__stage--now');
  await expect(next.locator('.road__visit-name')).toHaveText(/区役所で/);
  await expect(next.locator('.road__name')).toHaveText(['転入届', '国民健康保険', '国民年金']);
  // 窓口は手続きごとに別（同じ建物）
  await expect(next.getByText(/保険年金課/).first()).toBeVisible();
  await expect(next.getByText(/1回で済むかは要確認/)).toBeVisible();
  // まとめても、要確認・必要の札は変わらない
  await expect(next.locator('[data-card="nagoya-kokuho-kanyu"]').getByText('要確認', { exact: true })).toBeVisible();
  // 確認前の法令の義務は「必要（要確認）」（HB-5）
  await expect(next.locator('[data-card="nagoya-kokuho-kanyu"]').getByText('必要（要確認）', { exact: true })).toBeVisible();
  const after = page.locator('.road__stage--today');
  await expect(after.locator('.road__visit-name')).toHaveText(/銀行で/);
  await expect(after.locator('.road__name')).toHaveText(['銀行の口座']);
  await page.screenshot({ path: 'test-results/visit-groups-move.png', fullPage: true });

  // 転入届だけ完了：ほかの2つは残る。再読み込みしても残る
  // 完了にすると「もうできた」の段へ移る（そこでも外せる）
  await page.getByRole('checkbox', { name: /完了：転入届/ }).click();
  await expect(page.locator('.road__stage--done').getByRole('checkbox', { name: /完了：転入届/ })).toBeChecked();
  await expect(page.locator('[data-card="nagoya-kokuho-kanyu"]').first()).toBeVisible();
  await page.reload();
  await expect(page.locator('.road__stage--done').getByText('転入届')).toBeVisible();
  await expect(page.locator('.road__stage--now .road__visit-name')).toHaveText(/区役所で/);
  await expect(page.locator('.road__stage--now .road__name')).toHaveText(['国民健康保険', '国民年金']);
});

test('引っ越し（市外から）：もう国民年金に入っている人には、加入を出さない（理由を残す）', async ({ page }) => {
  await page.goto('/e/E-move');
  const plan = OTHER_CITY.map(([q, a]) => (String(q) === String(/国民年金に入って/) ? [q, /^入っている/] : [q, a]) as [RegExp, RegExp]);
  await answerAll(page, plan, /いつ、区役所に行きますか/);
  await page.getByRole('link', { name: /^全体/ }).first().click();
  await expect(page.locator('.road__stage--now .road__name')).toHaveText(['転入届', '国民健康保険']);
  await page.getByText(/関係なかったもの（理由つき）/).click();
  await expect(page.getByText(/住所の変更は手続き不要/)).toBeVisible();
});

test('キーボード：道の「完了」チェックは Tab で届き、Space で記録できる', async ({ page }) => {
  await page.goto('/e/E-move');
  await answerAll(page, OTHER_CITY, /いつ、区役所に行きますか/);
  await page.getByRole('link', { name: /^全体/ }).first().click();
  const box = page.getByRole('checkbox', { name: /完了：国民健康保険/ });
  await box.focus();
  await expect(box).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('.road__stage--done').getByRole('checkbox', { name: /完了：国民健康保険/ })).toBeChecked();
  // 外すと、もとの区役所のまとまりへもどる
  await page.locator('.road__stage--done').getByRole('checkbox', { name: /完了：国民健康保険/ }).click();
  await expect(page.locator('.road__stage--now .road__name')).toHaveText(['転入届', '国民健康保険', '国民年金']);
});

test.describe('デスクトップ', () => {
  test.use({ viewport: { width: 1280, height: 900 } });
  test('右の「このあと」も、区役所の国保・年金が銀行より先', async ({ page }) => {
    await page.goto('/e/E-move');
    await answerAll(page, OTHER_CITY, /いつ、区役所に行きますか/);
    const names = await page.locator('aside.side .row__name').allInnerTexts();
    const i = (s: string) => names.findIndex((n) => n.includes(s));
    expect(i('国民健康保険')).toBeGreaterThanOrEqual(0);
    expect(i('国民健康保険')).toBeLessThan(i('銀行の口座'));
    expect(i('国民年金')).toBeLessThan(i('銀行の口座'));
  });
});

test('アクセシビリティ：まとめた道（3つの表示レベル・幅 320/640・文字の間隔）で axe の違反 0・横スクロール 0', async ({ page }) => {
  const AxeBuilder = (await import('@axe-core/playwright')).default;
  await page.goto('/e/E-move');
  await answerAll(page, OTHER_CITY, /いつ、区役所に行きますか/);
  await page.getByRole('link', { name: /^全体/ }).first().click();
  const levels = [{ i: 0, name: /区役所で/ }, { i: 1, name: /区役所(くやくしょ)?で/ }, { i: 2, name: /At Ward office/ }];
  for (const lv of levels) {
    await page.getByRole('button', { name: /^(設定\s?・Language|Settings · 設定)$/ }).click();
    await page.getByRole('dialog').locator('fieldset').nth(0).locator('button.seg').nth(lv.i).click();
    await page.keyboard.press('Escape');
    // どのレベルでも同じ中身（区役所の3つ → 銀行）
    await expect(page.locator('.road__stage--now .road__visit-name')).toHaveText(lv.name);
    await expect(page.locator('.road__stage--now .road__card')).toHaveCount(3);
    await expect(page.locator('.road__stage--today .road__card')).toHaveCount(1);
    for (const width of [320, 640]) {
      await page.setViewportSize({ width, height: 800 });
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).include('.road').analyze();
      expect(r.violations.map((v) => v.id + ' ' + v.nodes.map((n) => n.target.join(' ')).join(','))).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  }
  await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test('区役所の日を決めても、区役所の3つが「次はこれ」のまま（任意の銀行が上がらない。FE-1）。完了のあとフォーカスが BODY に落ちない（FE-5）', async ({ page }) => {
  await page.goto('/e/E-move');
  await answerAll(page, OTHER_CITY, /いつ、区役所に行きますか/);
  await page.locator('.cal__table button:not([disabled])').first().click();
  await expect(page.locator('#screen-title')).not.toHaveText(/いつ、区役所に行きますか/);
  await page.getByRole('link', { name: /^全体/ }).first().click();
  await expect(page.locator('.road__stage--now .road__visit-name')).toHaveText(/区役所で/);
  await expect(page.locator('.road__stage--now .road__name')).toHaveText(['転入届', '国民健康保険', '国民年金']);
  await expect(page.locator('.road__stage--now .road__tag--day').first()).toBeVisible();
  const box = page.getByRole('checkbox', { name: /完了：国民年金/ });
  await box.focus();
  await page.keyboard.press('Space');
  const moved = page.locator('.road__stage--done').getByRole('checkbox', { name: /完了：国民年金/ });
  await expect(moved).toBeFocused();
});

test('国民年金に入っているか「わからない」：要確認だけで、必要・期限ありの札を出さない（FE-6）', async ({ page }) => {
  await page.goto('/e/E-move');
  const plan = OTHER_CITY.map(([q, a]) => (String(q) === String(/国民年金に入って/) ? [q, /^わからない/] : [q, a]) as [RegExp, RegExp]);
  await answerAll(page, plan, /いつ、区役所に行きますか/);
  await page.getByRole('link', { name: /^全体/ }).first().click();
  const item = page.locator('[data-card="kokumin-nenkin-kanyu"]').first();
  await expect(item.getByText('要確認')).toBeVisible();
  await expect(item.locator('.road__tag--must')).toHaveCount(0);
  // 「入っていない」人の国保は 必要・期限あり のまま
  await expect(page.locator('[data-card="nagoya-kokuho-kanyu"]').first().locator('.road__tag--must')).toHaveCount(2);
});
