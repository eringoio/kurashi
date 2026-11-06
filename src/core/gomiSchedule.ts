/* 収集日の表（作者の決定 2026-11-06 F）。名古屋市の表の写しは data/private/gomi-schedule.json（.gitignore。許諾が出るまで公開しない）。
   VITE_GOMI_SCHEDULE=on のときだけ読む（既定は off）。ファイルが無くてもビルドは通る（何も出さない）。
   住所は区＋町名（丁目まで）を残す。番地で曜日が分かれる町だけ、そのときに番地を聞く（番地は残さない）。 */
import type { Schedule, ScheduleRule } from './gomi';

export interface PrivateArea { id: string; ward: string; town: string; banchi: string | null; days: Record<string, ScheduleRule> }
export interface PrivateSchedule { source: { url: string; title: string; fetched_at: string; valid_from: string | null }; areas: PrivateArea[] }

/** 年末年始（12/29〜1/3）の収集の例外は、写しの表に無い。この日までだけ日付を出す */
export const EXCEPTIONS_UNTIL = '2026-12-28';

export const SCHEDULE_ON = import.meta.env.VITE_GOMI_SCHEDULE === 'on';

const files: Record<string, unknown> = SCHEDULE_ON
  ? import.meta.glob('../../data/private/gomi-schedule.json', { eager: true, import: 'default' })
  : {};

let cached: PrivateSchedule | null | undefined;
export function privateSchedule(raw: unknown = files['../../data/private/gomi-schedule.json']): PrivateSchedule | null {
  if (raw === undefined) return null;
  if (cached !== undefined && raw === files['../../data/private/gomi-schedule.json']) return cached;
  const p = raw as PrivateSchedule;
  const ok = !!p && Array.isArray(p.areas);
  const v = ok ? p : null;
  if (raw === files['../../data/private/gomi-schedule.json']) cached = v;
  return v;
}

/** 区の町名の一覧（同じ町名の番地の行は1つにまとめる） */
export function townsOf(p: PrivateSchedule, ward: string): string[] {
  return [...new Set(p.areas.filter((a) => a.ward === ward).map((a) => a.town))].sort((a, b) => a.localeCompare(b, 'ja'));
}

/** 町名の行。2つ以上なら番地で分かれている（そのときだけ番地を聞く） */
export function rowsOf(p: PrivateSchedule, ward: string, town: string): PrivateArea[] {
  return p.areas.filter((a) => a.ward === ward && a.town === town);
}

/** gomi.ts の Schedule の形にする（作者が表示を on にしたので、未承認でも出す。画面には「要確認」を付ける） */
export function toSchedules(p: PrivateSchedule): Schedule[] {
  return p.areas.flatMap((a) => Object.entries(a.days).map(([category, rule]) => ({
    area_id: a.id, category, rule, valid_from: p.source.valid_from ?? p.source.fetched_at, valid_to: null, observed_at: p.source.fetched_at, exceptions: [],
    // 年末年始の例外は表に無い。12/28 までだけ日付を出す（それより後は出さない）
    exceptions_known_until: EXCEPTIONS_UNTIL, review_status: 'needs_human_review',
  }) as unknown as Schedule));
}
