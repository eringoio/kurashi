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
export interface WordLog { word_id: string; first_seen: string; last_seen: string; count: number; starred: boolean }

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
export function logSeen(prev: WordLog | undefined, id: string, today: string): WordLog {
  return prev ? { ...prev, last_seen: today, count: prev.count + 1 } : { word_id: id, first_seen: today, last_seen: today, count: 1, starred: false };
}

export type WordFilter = { starred?: boolean; kind?: WordKind; today?: string; q?: string };
const norm = (s: string) => s.replace(/\{([^|}]+)\|([^}]+)\}/g, '$1$2').toLowerCase().replace(/[\s　]/g, '');

/** 一覧：記録のある言葉を新しい順（同じ日なら回数の多い順）。絞り込み */
export function listWords(words: WordView[], logs: Record<string, WordLog>, f: WordFilter): { w: WordView; log: WordLog }[] {
  const q = f.q ? norm(f.q) : '';
  return words
    .filter((w) => logs[w.id])
    .map((w) => ({ w, log: logs[w.id] }))
    .filter(({ w, log }) => (!f.starred || log.starred) && (!f.kind || w.kind === f.kind) && (!f.today || log.last_seen === f.today)
      && (!q || norm(w.ja).includes(q) || Object.values(w.meaning).some((m) => typeof m === 'string' && norm(m).includes(q))))
    .sort((a, b) => b.log.last_seen.localeCompare(a.log.last_seen) || b.log.count - a.log.count);
}

/** 窓口で先に出す、聞こえてくる言葉（★を先に。3つ） */
export function heardFirst(words: WordView[], logs: Record<string, WordLog>, place: string, n = 3): WordView[] {
  return words.filter((w) => w.kind === 'heard' && w.scene.includes(place))
    .sort((a, b) => Number(!!logs[b.id]?.starred) - Number(!!logs[a.id]?.starred))
    .slice(0, n);
}
