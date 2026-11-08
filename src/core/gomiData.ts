/* ごみの道具のデータ（data/gomi/*.json）を読む。11/7 C-7 で下書き（drafts/gomi）から公開へ移した。すべて needs_check／ai_checked のまま。
   収集日の表の写しは data/private/（Git に入れない。src/core/gomiSchedule.ts）。 */
import { z } from 'zod';
import { Evidence, Notice, Text } from './schema';
import { GomiItem, GomiItems, normWord, type DeliveryRegime, type Schedule } from './gomi';

const files: Record<string, unknown> = import.meta.glob(['../../data/gomi/items.json', '../../data/gomi/areas.json', '../../data/gomi/delivery.json'], { eager: true, import: 'default' });
/** 分別早見表（名古屋市のオープンデータ。CC BY 4.0）は公開の data/gomi/ に置く（作者の決定 11/6 F） */
import opendataJson from '../../data/gomi/opendata.json';
/** 早見表の品目の名前の英語と、ふりがな付きの日本語（早見表は日本語だけのため。Claude が訳した。名前だけで、区分・出し方は変えない） */
import itemNamesJson from '../../data/gomi/item-names.json';

const Link = z.object({ label: Text, url: z.string().url(), evidence: Evidence });
export const GomiAreas = z.object({
  as_of: z.string(),
  wards: z.array(z.object({ id: z.string().regex(/^[a-z_]+$/), label: Text })),
  /** 収集日の表（地域ごと）。取得して人が確かめたものだけを入れる。空なら、どの地域も日付を出さない */
  schedules: z.array(z.any()).default([]),
  coverage: Text,
  links: z.array(Link),
  /** 家庭ごみの範囲の外（事業系ごみ）への案内 */
  business: z.object({ text: Text, link: Link }).optional(),
});
export type GomiAreas = z.infer<typeof GomiAreas>;

export const GomiDelivery = z.object({
  as_of: z.string(),
  regimes: z.array(z.object({ id: z.string(), from: z.string().nullable(), to: z.string().nullable(), label: Text, evidence: Evidence })),
  not_stated: Text,
  links: z.array(Link),
  /** お知らせ（期間つき。B-7c） */
  notices: z.array(Notice).optional(),
});

export interface GomiBundle { items: GomiItems; areas: GomiAreas; delivery: z.infer<typeof GomiDelivery> & { regimes: DeliveryRegime[] }; schedules: Schedule[] }

const OpenData = z.object({
  source: z.object({ source_id: z.string(), url: z.string().url(), title: z.string(), last_modified: z.string().nullable(), attribution: z.string(), license: z.string() }).passthrough(),
  items: z.array(z.unknown()),
}).passthrough();

/** 品目：手で確かめた品目（items.json）を先に、オープンデータ（opendata.json）を後に。同じ名前のオープンデータの行は使わない */
export function parseGomi(raw: { items: unknown; areas: unknown; delivery: unknown; opendata?: unknown; names?: unknown }): GomiBundle {
  const items = GomiItems.parse(raw.items);
  if (raw.opendata) {
    const od = OpenData.parse(raw.opendata);
    const plainRuby = (s: string) => s.replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1');
    const known = new Set(items.items.flatMap((it) => [...Object.values(it.label).map(plainRuby), ...it.aliases]).map(normWord));
    const extra = z.array(GomiItem).parse(od.items).filter((it) => ![it.label.ja, ...it.aliases].some((w) => known.has(normWord(w))));
    // 名前の表があれば、英語とふりがな付きの日本語を足す（ふつうの日本語・やさしい日本語は同じ形。ふりがなは設定で出す）
    const names = (raw.names as { names?: Record<string, { ja?: string; en?: string }> } | undefined)?.names ?? {};
    for (const it of extra) { const n = names[it.label.ja]; if (n) it.label = { ja: n.ja ?? it.label.ja, ja_easy: n.ja ?? it.label.ja, ...(n.en ? { en: n.en } : {}) }; }
    items.items.push(...extra);
    items.sources.push({ source_id: od.source.source_id, url: od.source.url, title: od.source.attribution, page_updated_at: od.source.last_modified?.slice(0, 10) ?? null, license: String(od.source.license ?? '') || undefined });
  }
  const areas = GomiAreas.parse(raw.areas);
  const delivery = GomiDelivery.parse(raw.delivery);
  // 参照の検査：品目の区分・選択肢の区分がある
  const cats = new Set(items.categories.map((c) => c.id));
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const it of items.items) {
    if (seen.has(it.id)) errs.push(`品目 ${it.id} が2つある`);
    seen.add(it.id);
    if (!it.category && !it.ask && !it.review) errs.push(`品目 ${it.id} に区分も質問もない`);
    if (it.category && !cats.has(it.category)) errs.push(`品目 ${it.id} の区分 ${it.category} がない`);
    it.ask?.choices.forEach((c) => { if (c.category && !cats.has(c.category)) errs.push(`品目 ${it.id} の選択肢の区分 ${c.category} がない`); });
  }
  const srcs = new Set(items.sources.map((x) => x.source_id));
  for (const it of items.items) it.evidence.source_ids.forEach((x) => { if (!srcs.has(x)) errs.push(`品目 ${it.id} の出典 ${x} がない`); });
  if (errs.length) throw new Error('ごみのデータの誤り：\n' + errs.join('\n'));
  return { items, areas, delivery, schedules: areas.schedules as Schedule[] };
}

let cached: GomiBundle | null | undefined;
/** データが無ければ null */
export function gomiData(): GomiBundle | null {
  if (cached !== undefined) return cached;
  const get = (n: string) => files[`../../data/gomi/${n}.json`];
  cached = get('items') && get('areas') && get('delivery') ? parseGomi({ items: get('items'), areas: get('areas'), delivery: get('delivery'), opendata: opendataJson, names: itemNamesJson }) : null;
  return cached;
}
