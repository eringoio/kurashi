/* ごみの下書きのデータ（drafts/gomi/*.json）を読む。下書きなので、開発の `npm run dev:drafts` のときだけ読む（SPEC 18.9）。
   本番ビルドでは読まないので、ごみの画面は「準備中」になる。 */
import { z } from 'zod';
import { Evidence, Text } from './schema';
import { GomiItems, type DeliveryRegime, type Schedule } from './gomi';

const files: Record<string, unknown> = import.meta.env.MODE === 'drafts'
  ? import.meta.glob('../../drafts/gomi/*.json', { eager: true, import: 'default' })
  : {};

const Link = z.object({ label: Text, url: z.string().url(), evidence: Evidence });
export const GomiAreas = z.object({
  as_of: z.string(),
  wards: z.array(z.object({ id: z.string().regex(/^[a-z_]+$/), label: Text })),
  /** 収集日の表（地域ごと）。取得して人が確かめたものだけを入れる。空なら、どの地域も日付を出さない */
  schedules: z.array(z.any()).default([]),
  coverage: Text,
  links: z.array(Link),
});
export type GomiAreas = z.infer<typeof GomiAreas>;

export const GomiDelivery = z.object({
  as_of: z.string(),
  regimes: z.array(z.object({ id: z.string(), from: z.string().nullable(), to: z.string().nullable(), label: Text, evidence: Evidence })),
  not_stated: Text,
  links: z.array(Link),
});

export interface GomiBundle { items: GomiItems; areas: GomiAreas; delivery: z.infer<typeof GomiDelivery> & { regimes: DeliveryRegime[] }; schedules: Schedule[] }

export function parseGomi(raw: { items: unknown; areas: unknown; delivery: unknown }): GomiBundle {
  const items = GomiItems.parse(raw.items);
  const areas = GomiAreas.parse(raw.areas);
  const delivery = GomiDelivery.parse(raw.delivery);
  // 参照の検査：品目の区分・選択肢の区分がある
  const cats = new Set(items.categories.map((c) => c.id));
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const it of items.items) {
    if (seen.has(it.id)) errs.push(`品目 ${it.id} が2つある`);
    seen.add(it.id);
    if (!it.category && !it.ask) errs.push(`品目 ${it.id} に区分も質問もない`);
    if (it.category && !cats.has(it.category)) errs.push(`品目 ${it.id} の区分 ${it.category} がない`);
    it.ask?.choices.forEach((c) => { if (c.category && !cats.has(c.category)) errs.push(`品目 ${it.id} の選択肢の区分 ${c.category} がない`); });
  }
  const srcs = new Set(items.sources.map((x) => x.source_id));
  for (const it of items.items) it.evidence.source_ids.forEach((x) => { if (!srcs.has(x)) errs.push(`品目 ${it.id} の出典 ${x} がない`); });
  if (errs.length) throw new Error('ごみのデータの誤り：\n' + errs.join('\n'));
  return { items, areas, delivery, schedules: areas.schedules as Schedule[] };
}

let cached: GomiBundle | null | undefined;
/** 下書きが無ければ null（本番） */
export function gomiData(): GomiBundle | null {
  if (cached !== undefined) return cached;
  const get = (n: string) => files[`../../drafts/gomi/${n}.json`];
  cached = get('items') && get('areas') && get('delivery') ? parseGomi({ items: get('items'), areas: get('areas'), delivery: get('delivery') }) : null;
  return cached;
}
