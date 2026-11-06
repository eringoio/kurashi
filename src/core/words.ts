/* 語学学習（作者が OK 2026-11-06。docs/LANGUAGE_STUDY_REVIEW.md の3章「最初の版」）。
   言葉：data/words.json（聞こえてくる言葉・言う文）＋ 手続きの正式名（カード）＋ 書類の名前（data/documents.json）。
   記録：画面に出た言葉を phrases ストアに自動で残す（同意のあとだけ。vault）。★で大事にする。点数・連続日数は作らない（6A.8）。 */
import { z } from 'zod';
import { DATA } from './data';
import { DOCUMENTS } from './documents';
import type { Text } from './schema';
import wordsJson from '../../data/words.json';

export type WordKind = 'heard' | 'say' | 'official' | 'doc';
export const WORD_KINDS: WordKind[] = ['heard', 'say', 'official', 'doc'];

const Word = z.object({ id: z.string().regex(/^(heard|say)-[a-z0-9-]+$/), kind: z.enum(['heard', 'say']), scene: z.array(z.string()), ja: z.string(), easy: z.string(), en: z.string(), status: z.enum(['needs_check', 'verified']) });

export interface WordView {
  id: string;
  kind: WordKind;
  /** 日本語（{漢字|よみ}） */
  ja: string;
  /** 意味（表示レベルの文。ja_easy はやさしい言い換え） */
  meaning: Text;
  scene: string[];
}

/** 残す記録（phrases ストア。key は word_id） */
export interface WordLog { word_id: string; first_seen: string; last_seen: string; count: number; starred: boolean;
  /** 最後に見た時刻（ミリ秒）。同じ日の中で見た順に並べる。古い記録にはない */
  at?: number }

let cached: WordView[] | null = null;
export function allWords(): WordView[] {
  if (cached) return cached;
  const data = z.object({ words: z.array(Word) }).parse(wordsJson).words.map((w) => ({ id: w.id, kind: w.kind, ja: w.ja, meaning: { ja: w.easy, ja_easy: w.easy, en: w.en }, scene: w.scene }));
  // 手続きの正式名：行く所がある公開のカードだけ（例：区役所）
  const official = DATA().cards.filter((c) => c.place).map((c) => ({ id: 'card:' + c.id, kind: 'official' as const, ja: `{${c.official_name.ja}|${c.official_name.reading}}`, meaning: c.title, scene: [c.place!] }));
  const docs = DOCUMENTS().map((d) => ({ id: 'doc:' + d.id, kind: 'doc' as const, ja: d.look_for, meaning: d.title, scene: ['home'] }));
  cached = [...data, ...official, ...docs];
  return cached;
}

/** 記録を足す（新しい順に並べるため last_seen を今日に。count を1つ増やす。★はそのまま） */
export function logSeen(prev: WordLog | undefined, id: string, today: string, at?: number): WordLog {
  const t = at === undefined ? {} : { at };
  return prev ? { ...prev, ...t, last_seen: today, count: prev.count + 1 } : { word_id: id, first_seen: today, last_seen: today, count: 1, starred: false, ...t };
}

export type WordMode = 'all' | 'seen' | 'star';
const recency = (a: WordLog, b: WordLog) => b.last_seen.localeCompare(a.last_seen) || (b.at ?? 0) - (a.at ?? 0) || b.count - a.count;

export type WordFilter = { mode?: WordMode; starred?: boolean; kind?: WordKind; today?: string; q?: string };
const norm = (s: string) => s.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1$2').toLowerCase().replace(/[\s　]/g, '');

/** 一覧。mode: seen（既定。記録のある言葉）・star（★だけ）・all（全部。見たものを新しい順に先に、残りは元の順）。
    どのモードでも、種類・今日・言葉の絞り込みは同じ */
export function listWords(words: WordView[], logs: Record<string, WordLog>, f: WordFilter): { w: WordView; log: WordLog }[] {
  const q = f.q ? norm(f.q) : '';
  const mode: WordMode = f.mode ?? (f.starred ? 'star' : 'seen');
  const unseen = (w: WordView): WordLog => ({ word_id: w.id, first_seen: '', last_seen: '', count: 0, starred: false });
  const rows = words
    .filter((w) => mode === 'all' || logs[w.id])
    .map((w) => ({ w, log: logs[w.id] ?? unseen(w) }))
    .filter(({ w, log }) => (mode !== 'star' || log.starred) && (!f.kind || w.kind === f.kind) && (!f.today || log.last_seen === f.today)
      && (!q || norm(w.ja).includes(q) || Object.values(w.meaning).some((m) => typeof m === 'string' && norm(m).includes(q))));
  return [...rows.filter((r) => r.log.count > 0).sort((a, b) => recency(a.log, b.log)), ...rows.filter((r) => r.log.count === 0)];
}

/** さいきん見たもの：最後に見た順に上から n 件（既定10） */
export function recentWords(words: WordView[], logs: Record<string, WordLog>, n = 10): { w: WordView; log: WordLog }[] {
  return listWords(words, logs, { mode: 'seen' }).slice(0, n);
}

/** 窓口で先に出す、聞こえてくる言葉（★を先に。3つ） */
export function heardFirst(words: WordView[], logs: Record<string, WordLog>, place: string, n = 3): WordView[] {
  return words.filter((w) => w.kind === 'heard' && w.scene.includes(place))
    .sort((a, b) => Number(!!logs[b.id]?.starred) - Number(!!logs[a.id]?.starred))
    .slice(0, n);
}
