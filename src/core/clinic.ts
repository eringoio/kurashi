/* 病院の案内（SPEC 6A.13。作者の指示 2026-11-05）。画面に依存しない。
   困っているところ（言葉・からだの絵）→ 行ってみる診療科の順番。診療科の説明は、その科がどこを見るかだけ（言葉の意味。14.1）。
   診断しない。緊急かどうかを判断しない（119・#7119 はいつも同じに出す。14.3）。選んだものは保存しない。 */
import { z } from 'zod';
import { normWord } from './gomi';
import { Evidence, Text } from './schema';
import clinicJson from '../../data/clinic.json';

const Part = z.object({
  id: z.string().regex(/^[a-z]+$/),
  name: Text,
  /** からだの絵の場所（絵にないものは null） */
  body_zone: z.string().nullable(),
  group: z.enum(['body', 'extra']),
  words: z.object({ kanji: z.array(z.string()), kana: z.array(z.string()), en: z.array(z.string()), romaji: z.array(z.string()) }),
  /** 行ってみる診療科の順番（1つめが「まず」） */
  departments: z.array(z.string()).min(1),
  /** 受付で見せる言葉 */
  say: Text,
  note: z.string().nullable().optional(),
  evidence: Evidence,
});
const Department = z.object({ id: z.string().regex(/^[a-z]+$/), name: Text, covers: Text, evidence: Evidence });
const Emergency = z.object({ id: z.string(), number: z.string(), always: z.boolean(), parts: z.array(z.string()).optional(), label: Text, evidence: Evidence });
const Link = z.object({ id: z.string(), url: z.string().url(), title: Text, desc: Text.optional(), evidence: Evidence });
const Bring = z.object({ id: z.string(), illustration: z.string(), title: Text, desc: Text.optional(), evidence: Evidence });
const Phrase = z.object({ id: z.string(), say: Text });

export const ClinicData = z.object({
  parts: z.array(Part),
  departments: z.array(Department),
  emergency: z.array(Emergency),
  advice: z.object({
    head: Text,
    small: z.object({ title: Text, desc: Text }),
    big: z.object({ title: Text, desc: Text }),
    text: z.array(Text),
    youdecide: Text,
    evidence: Evidence,
  }),
  /** 行く前に電話で聞くこと */
  callNote: z.object({ text: Text, evidence: Evidence }),
  links: z.array(Link),
  bring: z.array(Bring),
  phrases: z.array(Phrase),
});
export type ClinicData = z.infer<typeof ClinicData>;
export type ClinicPart = z.infer<typeof Part>;
export type ClinicDepartment = z.infer<typeof Department>;

/** 参照の検査（CI でも回す）。sourceIds は data/sources.json の id */
export function checkClinic(d: ClinicData, sourceIds: Set<string>): string[] {
  const err: string[] = [];
  const dup = (kind: string, ids: string[]) => ids.forEach((id, i) => { if (ids.indexOf(id) !== i) err.push(`${kind} ${id} が2つある`); });
  dup('場所', d.parts.map((p) => p.id));
  dup('診療科', d.departments.map((x) => x.id));
  dup('リンク', d.links.map((x) => x.id));
  const deps = new Set(d.departments.map((x) => x.id));
  for (const p of d.parts) {
    if (p.departments.length === 0) err.push(`${p.id}：診療科が無い`);
    p.departments.forEach((id) => { if (!deps.has(id)) err.push(`${p.id}：診療科 ${id} が無い`); });
  }
  for (const l of d.links) if (l.url.includes('?') || !l.url.startsWith('https://')) err.push(`${l.id}：https でない・クエリ文字列がある`);
  const ev = (where: string, e: { source_ids: string[] }) => e.source_ids.forEach((s) => { if (!sourceIds.has(s)) err.push(`${where}：出典 ${s} が無い`); });
  d.parts.forEach((p) => ev(p.id, p.evidence));
  d.departments.forEach((x) => ev(x.id, x.evidence));
  d.emergency.forEach((x) => ev(x.id, x.evidence));
  d.links.forEach((x) => ev(x.id, x.evidence));
  d.bring.forEach((x) => ev(x.id, x.evidence));
  ev('advice', d.advice.evidence);
  ev('callNote', d.callNote.evidence);
  return err;
}

let cached: ClinicData | null = null;
export const CLINIC = (): ClinicData => (cached ??= ClinicData.parse(clinicJson));

const plain = (s: string) => s.replace(/\{([^|{}]+)\|[^{}]+\}/g, '$1');
const reading = (s: string) => s.replace(/\{[^|{}]+\|([^{}]+)\}/g, '$1');
/** 探す言葉の一覧：言葉の表と、名前（ふりがなを外したもの・よみ） */
const wordsOf = (p: ClinicPart) =>
  [...p.words.kanji, ...p.words.kana, ...p.words.en, ...p.words.romaji, ...Object.values(p.name).flatMap((t) => [plain(t), reading(t)])].map(normWord).filter(Boolean);

/** 言葉で場所を探す。完全一致を先に、前方一致を次に（部分一致は2文字以上）。最大5つ */
export function searchParts(d: ClinicData, q: string): ClinicPart[] {
  const n = normWord(q);
  if (!n) return [];
  const score = (p: ClinicPart) => {
    const ws = wordsOf(p);
    if (ws.includes(n)) return 0;
    if (ws.some((w) => w.startsWith(n))) return 1;
    if (n.length >= 2 && ws.some((w) => w.length >= 2 && (w.includes(n) || n.includes(w)))) return 2;
    return -1;
  };
  return d.parts.map((p, i) => ({ p, s: score(p), i })).filter((x) => x.s >= 0).sort((a, b) => a.s - b.s || a.i - b.i).slice(0, 5).map((x) => x.p);
}

/** 行ってみる診療科（順番どおり。1つめが「まず」） */
export function departmentsFor(d: ClinicData, part: ClinicPart): ClinicDepartment[] {
  return part.departments.map((id) => d.departments.find((x) => x.id === id)!).filter(Boolean);
}

/** 緊急の連絡先：いつも出すもの（119・#7119）と、その場所のときだけ出すもの（こどもの #8000）。判断はしない */
export function emergencyFor(d: ClinicData, part: ClinicPart | null) {
  return d.emergency.filter((e) => e.always || (!!part && (e.parts ?? []).includes(part.id)));
}
