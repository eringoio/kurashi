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
  /** 出す画面（パスの先頭か末尾。例 '/gomi'・'/c/gomi-sodai'）。無ければどの画面でも出す（作者 11/7：関係のある画面だけ） */
  show_on: z.array(z.string().startsWith('/')).optional(),
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

const onPath = (path: string, p: string) => path === p || path.startsWith(p + '/') || path.endsWith(p);
/** いまの画面に出す窓口：show_on が無いものと、パスが show_on の先頭か末尾に合うもの。この画面だけの窓口を先に */
export const helpFor = (path: string, list: HelpContact[] = HELP()) => [
  ...list.filter((c) => c.show_on?.some((p) => onPath(path, p))),
  ...list.filter((c) => !c.show_on),
];

/** 電話をかけるリンク（# は %23） */
export const telHref = (phone: string) => 'tel:' + encodeURIComponent(phone.replace(/-/g, ''));
