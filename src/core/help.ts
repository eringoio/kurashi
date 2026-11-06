/* 相談窓口（上の帯の「相談」。作者の指示 2026-11-06 I-4）。電話番号・時間は公式ページの本文で確かめたものだけ（data/help.json）。 */
import { z } from 'zod';
import { Evidence, Text } from './schema';
import helpJson from '../../data/help.json';

export const HelpContact = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  phone: z.string().regex(/^(#\d{4}|0[\d-]{9,12})$/),
  name: Text,
  what: Text,
  hours: Text,
  url: z.string().startsWith('https://').refine((u) => !u.includes('?'), 'クエリ文字列は使わない'),
  evidence: Evidence,
});
export type HelpContact = z.infer<typeof HelpContact>;

export function loadHelp(raw: unknown = helpJson, sourceIds?: Set<string>): HelpContact[] {
  const list = z.object({ contacts: z.array(HelpContact) }).parse(raw).contacts;
  const ids = new Set<string>();
  for (const c of list) {
    if (ids.has(c.id)) throw new Error('相談窓口 ' + c.id + ' が2つある');
    ids.add(c.id);
    for (const l of ['ja', 'ja_easy', 'en']) if (!c.name[l] || !c.what[l] || !c.hours[l]) throw new Error(c.id + '：' + l + ' の文がない');
    if (sourceIds) c.evidence.source_ids.forEach((s) => { if (!sourceIds.has(s)) throw new Error(c.id + '：出典 ' + s + ' が無い'); });
  }
  return list;
}

let cache: HelpContact[] | null = null;
export const HELP = () => (cache ??= loadHelp());

/** 電話をかけるリンク（# は %23） */
export const telHref = (phone: string) => 'tel:' + encodeURIComponent(phone.replace(/-/g, ''));
