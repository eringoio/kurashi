/* 操作の段階ごとのスクリーンショット記録（作者の確認一覧のため）。
   - 日付・初期状態・画面幅・言語を固定する（同じコードなら同じ画像になるように）
   - 毎回、新しいブラウザの保存領域で動く（作者のブラウザ・保存データには触れない）
   - 撮った画像と記録は screenshots/candidate/<flow>/ に書く。作者が確認した版（screenshots/approved/）は書き換えない
   使い方は scripts/shots/README.md。 */
import { expect, test as base, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 固定する日時（JST 2026-11-04 09:00）。アプリの「今日」はこれになる */
export const FIXED_NOW = new Date('2026-11-04T09:00:00+09:00');
export const VIEWPORT = { width: 390, height: 844 };
const OUT = join(process.cwd(), 'screenshots', 'candidate');

export interface FlowMeta {
  /** フローの名前（フォルダ名。英小文字とハイフン） */
  id: string;
  /** 作者に見せる題 */
  title: string;
  /** このフローが関係するファイル（glob）。ここが変わったら撮り直す。共通の判定・保存・部品は scripts/shots/affected.mjs が全フローに足す */
  touches: string[];
  /** 根拠（カードID・出典ID・調査の受け渡し） */
  evidence?: string[];
  /** 表示レベル（既定 ja）。locale で固定する */
  level?: 'ja' | 'en';
}

export interface StepMeta {
  /** 段階の名前（短く） */
  name: string;
  /** その段階で入力した回答・操作 */
  input?: string;
  /** 期待結果（作者が読む文） */
  expected: string;
  /** なぜこの結果になるか（判定・順序の理由） */
  why?: string;
}

interface Recorded extends StepMeta { n: number; file: string; sha256: string; url: string; h1: string; actual: string; ok: boolean; error?: string }

/** フローを1つ定義する。ブラウザの文脈は日付・幅・言語を固定し、動きを減らす */
export function flow(meta: FlowMeta, body: (page: Page, snap: (s: StepMeta, check?: () => Promise<void>) => Promise<void>) => Promise<void>) {
  const locale = meta.level === 'en' ? 'en-US' : 'ja-JP';
  base.describe(meta.title, () => {
    base.use({ locale, viewport: VIEWPORT, reducedMotion: 'reduce', timezoneId: 'Asia/Tokyo', colorScheme: 'light' });
    base(meta.id, async ({ page }) => {
      base.setTimeout(120_000);
      await page.clock.setFixedTime(FIXED_NOW);
      const dir = join(OUT, meta.id);
      mkdirSync(dir, { recursive: true });
      const steps: Recorded[] = [];
      let n = 0;
      const snap = async (s: StepMeta, check?: () => Promise<void>) => {
        n++;
        let ok = true;
        let error: string | undefined;
        if (check) {
          try { await check(); } catch (e) { ok = false; error = String((e as Error).message ?? e).split('\n').slice(0, 6).join('\n'); }
        }
        await page.evaluate(() => document.fonts.ready);
        // カーソルの点滅・フォーカスの輪で差が出ないように、フォーカスを外す
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
        const file = `${String(n).padStart(2, '0')}-${s.name.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40)}.png`;
        const buf = await page.screenshot({ path: join(dir, file), fullPage: true, animations: 'disabled', caret: 'hide' });
        const h1 = (await page.locator('h1').first().innerText().catch(() => '')).trim();
        const actual = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 600);
        steps.push({ ...s, n, file, sha256: createHash('sha256').update(buf).digest('hex'), url: new URL(page.url()).pathname, h1, actual, ok, error });
        writeFileSync(join(dir, 'meta.json'), JSON.stringify({ ...meta, locale, viewport: VIEWPORT, fixed_now: FIXED_NOW.toISOString(), steps }, null, 2) + '\n');
        if (!ok) throw new Error(`段階「${s.name}」の期待結果と違う：${error}`);
      };
      await body(page, snap);
    });
  });
}

export { expect };
