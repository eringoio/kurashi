/* 更新情報（data/updates.json。2026-11-14）。作者が承認したもの（approved）だけを本番に出す。新しい順 */
import { z } from 'zod';
import { Text } from './schema';
import updatesJson from '../../data/updates.json';

export const Update = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['added', 'updated', 'corrected']),
  status: z.enum(['pending', 'approved']),
  title: Text,
  event_id: z.string().regex(/^E-[a-z0-9-]+$/).optional(),
  card_id: z.string().regex(/^[a-z0-9-]+$/).optional(),
  /** この変更が入った版（公開したあとで入れる） */
  release_id: z.string().regex(/^[A-Za-z0-9._-]{1,40}$/).optional(),
});
export type Update = z.infer<typeof Update>;

export function parseUpdates(raw: unknown): Update[] {
  return z.object({ updates: z.array(Update) }).passthrough().parse(raw).updates;
}

/** 画面に出すもの：本番は approved だけ。開発は pending（確認前）も（印を付ける）。新しい順 */
export function visibleUpdates(all: Update[], withDrafts: boolean): Update[] {
  return all.filter((u) => withDrafts || u.status === 'approved').sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export const UPDATES = (): Update[] => parseUpdates(updatesJson);
