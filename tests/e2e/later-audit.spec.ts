/* 「あとで」の監査（SPEC v0.5.30）：選んだ目的の手続きへ進む・もどる・再読み込み・保存。
   画面の確認用のスクリーンショットは SHOTS（フォルダ）を渡したときだけ撮る（docs/LATER_AUDIT.md）。 */
import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.SHOTS;
const TAG = process.env.SHOT_TAG ?? 'after';
const shot = async (page: Page, name: string) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${TAG}.png`, fullPage: true }); };
const keep = async (page: Page) => {
  const consent = page.getByRole('region', { name: /残しますか/ });
  // 保存の同意の帯は、最初に答えたあとに出る（9.9：同意の前は保存しない）。出るのを待ってから押す
  await consent.getByRole('button', { name: '残す', exact: true }).click({ timeout: 3000 }).catch(() => {});
  await expect(consent).toHaveCount(0);
  // 書き込み（IndexedDB）が終わるのを待つ。保存したものを読み直せるまで
  await page.waitForFunction(() => new Promise((r) => { const q = indexedDB.open('kurashi'); q.onsuccess = () => { q.result.close(); r(true); }; q.onerror = () => r(true); }));
  await page.waitForTimeout(300);
};
const title = (page: Page) => page.locator('#screen-title');

test.use({ viewport: { width: 390, height: 844 } });

test('ファミリーシップ：入口から手続きの画面へ直接。もどると入口の前へ。再読み込みで同じ画面', async ({ page }) => {
  await page.goto('/');
  await page.goto('/e/E-familyship');
  await expect(page).toHaveURL(/\/e\/E-familyship\/c\/marriage-familyship$/);
  await expect(title(page)).toContainText('ファミリーシップ');
  await shot(page, 'familyship');
  await page.reload();
  await expect(page).toHaveURL(/\/c\/marriage-familyship$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
});

const GOALS: [string, RegExp, string][] = [
  ['外国', /license-gaimen-kirikae$/, 'license-switch'],
  ['更新', /license-koshin$/, 'license-renew'],
  ['なくした', /license-saikofu$/, 'license-lost'],
];
for (const [label, url, name] of GOALS) {
  test(`運転免許：「${label}」を選ぶと、その手続きの画面へ`, async ({ page }) => {
    await page.goto('/e/E-license');
    await shot(page, 'license-question');
    await page.getByRole('button', { name: new RegExp(label) }).first().click();
    await expect(page).toHaveURL(url);
    await keep(page);
    await shot(page, name);
    // 再読み込みしても同じ手続き。目的は選び直せる
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('button', { name: 'ほかの目的を選ぶ' })).toBeVisible();
  });
}

test('結婚：答えたら全体の画面。婚姻届を出す が先、結婚したあと は「婚姻届のあと」', async ({ page }) => {
  await page.goto('/e/E-marriage');
  await shot(page, 'marriage-question');
  await page.getByRole('button').filter({ hasText: /日本|外国/ }).first().click();
  await keep(page);
  for (let i = 0; i < 3; i++) {
    const ov = page.getByRole('heading', { name: /婚姻届を出す/ });
    if (await ov.count()) break;
    const b = page.locator('.ov-ask button, .k-answer').first();
    if (await b.count()) await b.click();
  }
  await expect(page.getByRole('heading', { name: /婚姻届を出す/ })).toBeVisible();
  await expect(page.getByText(/のあとでします/).first()).toBeVisible();
  await shot(page, 'marriage');
});

test('住まい：はじめから全体の画面。公的住宅をすぐ開ける。入居から引っ越しのできごとへ行き、もどれる', async ({ page }) => {
  await page.goto('/e/E-house-search');
  await expect(page.getByRole('heading', { name: '部屋を探す' })).toBeVisible();
  await shot(page, 'house');
  await page.getByRole('link', { name: /市営・県営・UR住宅/ }).click();
  await expect(page).toHaveURL(/housing-public$/);
  await page.goBack();
  await page.getByRole('link', { name: /入居のとき/ }).first().click();
  await expect(page).toHaveURL(/housing-move-in$/);
  await shot(page, 'house-move-in');
  await page.getByRole('link', { name: /別の区へ/ }).click();
  await expect(page).toHaveURL(/\/e\/E-move-within$/);
  await page.goBack();
  await expect(page).toHaveURL(/housing-move-in$/);
});

test('住まい：入居の電気・水道を記録すると、再読み込みしても残る', async ({ page }) => {
  await page.goto('/e/E-house-search/c/housing-move-in');
  await keep(page);
  // 案内なのでチェックボックス（v0.5.35）。手続きの4つの状態の選択は出さない
  await expect(page.getByRole('combobox', { name: /水道/ })).toHaveCount(0);
  const water = page.getByRole('checkbox', { name: /水道/ });
  // 同意の前は保存しない（9.9）：はじめの記録のあと「残す」を押し、もう一度記録する
  await water.check();
  await keep(page);
  await water.uncheck();
  await water.check();
  // 続けて押しても、前に押した物の記録を消さない
  await page.getByRole('checkbox', { name: /^ガス/ }).check();
  await page.getByRole('checkbox', { name: /インターネット/ }).check();
  // リンクの無い項目は、名前を押してもチェックできる
  await page.getByText('郵便の転送', { exact: true }).click();
  await expect(page.getByText(/このリストで 4\/7 完了/)).toBeVisible();
  await page.reload();
  for (const n of [/水道/, /^ガス/]) await expect(page.getByRole('checkbox', { name: n })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /郵便の転送/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^電気/ })).not.toBeChecked();
});

test('財布：すぐ行う行動（カードの停止）が最初のまま', async ({ page }) => {
  await page.goto('/e/E-lost-wallet');
  await page.getByRole('button', { name: /キャッシュカード/ }).first().click();
  await page.getByRole('button', { name: /つぎへ/ }).click();
  // 全体の画面の最初の段が いますぐ（カードの停止）
  await expect(page.locator('.ov-phase').first().getByRole('heading')).toContainText('いますぐ');
  await expect(page.locator('.ov-phase').first()).toContainText('止める');
  await shot(page, 'lost');
});

test('銀行（口座がある）：一覧の上は いま の案内。もしものときは「関連する情報」', async ({ page }) => {
  await page.goto('/e/E-bank');
  // あなたについて（国籍など）は答えずに進む
  await page.getByRole('button', { name: '日本国籍' }).click();
  for (let i = 0; i < 4 && !(await page.getByRole('button', { name: 'ある', exact: true }).isVisible()); i++) await page.getByRole('button', { name: '答えずに進む' }).click({ timeout: 3000 }).catch(() => {});
  await page.getByRole('button', { name: 'ある', exact: true }).click();
  // 道（v0.5.31）では、関連する情報は道の段の名前
  const info = page.locator('.road__stage--info, h2', { hasText: /関連する情報/ }).first();
  for (let i = 0; i < 3 && !(await info.count()); i++) {
    const b = page.locator('.k-answer').first();
    if (await b.count()) await b.click();
  }
  await expect(info).toBeVisible();
  await shot(page, 'bank');
});
