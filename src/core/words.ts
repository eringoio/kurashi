/* 語学学習（作者が OK 2026-11-06。docs/LANGUAGE_STUDY_REVIEW.md の3章「最初の版」）。
   言葉：data/words.json（聞こえてくる言葉・言う文・画面の大事な単語）＋ 手続きの正式名（カード）＋ 書類の名前と書類の言葉（data/documents.json）
   ＋ 病院の体の場所・言う文・診療科・受付の言葉（data/clinic.json）。
   記録：画面に出た言葉を phrases ストアに自動で残す（同意のあとだけ。vault）。どの画面の言葉かは pageWordIds（道から決める）。★で大事にする。点数・連続日数は作らない（6A.8）。 */
import { z } from 'zod';
import { CLINIC } from './clinic';
import { DATA } from './data';
import { DOCUMENTS } from './documents';
import type { Text } from './schema';
import wordsJson from '../../data/words.json';
export type WordKind = 'heard' | 'say' | 'word' | 'official' | 'doc';
export const WORD_KINDS: WordKind[] = ['word', 'say', 'heard', 'official', 'doc'];

/** 分野（一覧の見出し）。この順に並べる。分野の中は WORD_KINDS の順 */
export const WORD_TOPICS = ['basic', 'ward_office', 'calendar', 'gomi', 'clinic', 'bank', 'job', 'housing', 'immigration', 'letter', 'other'] as const;
export type WordTopic = (typeof WORD_TOPICS)[number];

const Word = z.object({ id: z.string().regex(/^(heard|say|word)-[a-z0-9-]+$/), kind: z.enum(['heard', 'say', 'word']), scene: z.array(z.string()), ja: z.string(), easy: z.string(), en: z.string(), status: z.enum(['needs_check', 'verified']) });

export interface WordView {
  id: string;
  kind: WordKind;
  /** 日本語（{漢字|よみ}） */
  ja: string;
  /** 意味（表示レベルの文。ja_easy はやさしい言い換え） */
  meaning: Text;
  /** その言葉を出す画面の場面（pageScenes）。カード・書類の言葉は空（画面が id で残す） */
  scene: string[];
  /** 分野（一覧の見出し） */
  topic: WordTopic;
}

/** 残す記録（phrases ストア。key は word_id） */
export interface WordLog { word_id: string; first_seen: string; last_seen: string; count: number; starred: boolean;
  /** 最後に見た時刻（ミリ秒）。同じ日の中で見た順に並べる。古い記録にはない */
  at?: number }

/** 病院の受付の言葉のうち、言葉の表にもある言葉（同じ言葉を2つにしない） */
const CLINIC_SAME: Record<string, string> = { nihongo: 'say-nihongo', english: 'say-eigo' };
/** 病院の受付の言葉の id → 言葉の id */
export const clinicPhraseWord = (id: string) => CLINIC_SAME[id] ?? 'clinic-phrase:' + id;

/** できごとの group → 分野 */
// 結婚・離婚・ファミリーシップは区役所の届け。財布・運転免許は、いまは基本の言葉（2026-11-08。専用の言葉は提出のあと）
const GROUP_TOPIC: Record<string, WordTopic> = { move: 'ward_office', bank: 'bank', job: 'job', zairyu: 'immigration', housing: 'housing', gomi: 'gomi', family: 'ward_office', familyship: 'ward_office', lost: 'basic', license: 'basic' };
/** 場面 → 分野（言葉の表の scene の1つめ） */
const sceneTopic = (sc: string | undefined): WordTopic => (sc === 'move' ? 'ward_office' : (WORD_TOPICS as readonly string[]).includes(sc ?? '') ? (sc as WordTopic) : 'other');

let cached: WordView[] | null = null;
let kwIds: Map<string, string[]> | null = null;
export function allWords(): WordView[] {
  if (cached) return cached;
  // rank：同じ分野・同じ種類の中の順（小さいほど先）。言葉の表の順はそのまま
  type Row = WordView & { rank: number };
  const data: Row[] = z.object({ words: z.array(Word) }).parse(wordsJson).words.map((w) => ({ id: w.id, kind: w.kind, ja: w.ja, meaning: { ja: w.easy, ja_easy: w.easy, en: w.en }, scene: w.scene, topic: sceneTopic(w.scene[0]), rank: 1 }));
  // 病院（data/clinic.json）：体の場所・その場所の言う文・受付の言葉・診療科（診療科は画面が出した科だけを残す）。
  // 病院の中の順：単語は 病院の言葉 → 体の場所、言う文は 受付で言う文 → 症状 → 体の場所の文
  const c = CLINIC();
  const clinic: Row[] = [
    ...c.phrases.filter((p) => !CLINIC_SAME[p.id]).map((p) => ({ id: clinicPhraseWord(p.id), kind: (p.id === 'itsukara' ? 'heard' : 'say') as WordKind, ja: p.say.ja, meaning: p.say, scene: ['clinic'], topic: 'clinic' as const, rank: 0 })),
    ...c.parts.filter((p) => p.id !== 'unknown').map((p) => ({ id: 'clinic-part:' + p.id, kind: 'word' as const, ja: p.name.ja, meaning: p.name, scene: ['clinic'], topic: 'clinic' as const, rank: 2 })),
    ...c.parts.filter((p) => p.id !== 'unknown').map((p) => ({ id: 'clinic-say:' + p.id, kind: 'say' as const, ja: p.say.ja, meaning: p.say, scene: ['clinic'], topic: 'clinic' as const, rank: 2 })),
    ...c.departments.map((d) => ({ id: deptWordId(d.id), kind: 'official' as const, ja: d.name.ja, meaning: { ja: d.covers.ja, ja_easy: d.covers.ja_easy, en: d.name.en + ' — ' + d.covers.en }, scene: [], topic: 'clinic' as const, rank: 1 })),
  ];
  // 手続きの正式名：公開のカード全部（カードの画面が card:{id} で残す）。分野は、銀行で行うものは銀行、ほかは最初のできごと
  const { cards, events } = DATA();
  const official: Row[] = cards.map((card) => {
    const group = events.find((e) => e.card_ids.includes(card.id))?.group ?? '';
    const topic: WordTopic = card.place === 'bank' ? 'bank' : card.place === 'immigration' ? 'immigration' : GROUP_TOPIC[group] ?? 'other';
    return { id: 'card:' + card.id, kind: 'official' as const, ja: `{${card.official_name.ja}|${card.official_name.reading}}`, meaning: card.title, scene: [], topic, rank: 1 };
  });
  // 書類：名前と、書類の大事な言葉（同じ言葉は1つ。書類の画面が残す）
  const docs: Row[] = [];
  const byWord = new Map<string, string>();
  kwIds = new Map();
  for (const d of DOCUMENTS()) {
    docs.push({ id: 'doc:' + d.id, kind: 'doc', ja: d.look_for, meaning: d.title, scene: [], topic: 'letter', rank: 1 });
    const ids: string[] = [];
    d.key_words.forEach((k, i) => {
      let id = byWord.get(k.word);
      if (!id) { id = 'doc-word:' + d.id + ':' + i; byWord.set(k.word, id); docs.push({ id, kind: 'doc', ja: k.word, meaning: k.meaning, scene: [], topic: 'letter', rank: 1 }); }
      ids.push(id);
    });
    kwIds.set(d.id, ids);
  }
  const rows = [...data, ...clinic, ...official, ...docs];
  const at = new Map(rows.map((r, i) => [r.id, i]));
  const order = (r: Row) => [WORD_TOPICS.indexOf(r.topic), WORD_KINDS.indexOf(r.kind), r.rank, at.get(r.id)!];
  rows.sort((x, y) => { const p = order(x), q = order(y); for (let i = 0; i < 4; i++) if (p[i] !== q[i]) return p[i] - q[i]; return 0; });
  cached = rows.map(({ rank: _r, ...w }) => w);
  return cached;
}

/** 1つの言葉（無ければ undefined） */
export const wordById = (id: string): WordView | undefined => allWords().find((w) => w.id === id);

/** 病院の画面で残す診療科の言葉（画面に出した科だけ） */
export const deptWordId = (id: string) => 'clinic-dept:' + id;

/** 書類の画面で残す言葉：書類の名前と大事な言葉 */
export function docWordIds(docId: string): string[] {
  allWords();
  return ['doc:' + docId, ...(kwIds!.get(docId) ?? [])];
}

/** できごとの group → 場面 */
const GROUP_SCENE: Record<string, string> = { move: 'move', bank: 'bank', job: 'job', zairyu: 'immigration', housing: 'housing', gomi: 'gomi', family: 'ward_office', familyship: 'ward_office', lost: 'basic', license: 'basic' };
/** 行く所（カードの place・付き添い）→ 場面 */
const PLACE_SCENE: Record<string, string> = { ward_office: 'ward_office', prev_city: 'ward_office', bank: 'bank', immigration: 'immigration', clinic: 'clinic' };
/** QR の場面（data/scenes.json）→ 場面 */
const QR_SCENE: Record<string, string> = { 'ward-office': 'ward_office', bank: 'bank', move: 'move', search: 'basic' };

/** 画面（道）の場面。言葉の表の scene と合わせる。言葉を出さない画面は空 */
export function pageScenes(path: string): string[] {
  if (path === '/' || path === '' || path === '/search' || path === '/here') return ['basic'];
  if (/^\/(move|now|all|today|past|resume)(\/|$)/.test(path)) return ['move'];
  const ev = /^\/(?:e|g)\/([A-Za-z0-9-]+)/.exec(path);
  if (ev) {
    const group = path.startsWith('/g/') ? ev[1] : DATA().events.find((e) => e.id === ev[1])?.group;
    return group && GROUP_SCENE[group] ? [GROUP_SCENE[group]] : [];
  }
  const card = /^\/c\/([a-z0-9-]+)$/.exec(path);
  if (card) { const p = DATA().cards.find((c) => c.id === card[1])?.place; return p && PLACE_SCENE[p] ? [PLACE_SCENE[p]] : []; }
  const visit = /^\/visit\/([a-z_]+)/.exec(path);
  if (visit) return PLACE_SCENE[visit[1]] ? [PLACE_SCENE[visit[1]]] : [];
  const qr = /^\/(?:s|pack)\/([a-z0-9-]+)$/.exec(path);
  if (qr) return QR_SCENE[qr[1]] ? [QR_SCENE[qr[1]]] : [];
  if (path.startsWith('/clinic')) return ['clinic'];
  if (path.startsWith('/doc/')) return ['letter'];
  const one: Record<string, string> = { '/gomi': 'gomi', '/letter': 'letter', '/calendar': 'calendar' };
  return one[path] ? [one[path]] : [];
}

/** 画面の分野（その画面の場所の言葉を先に並べるため） */
export const pageTopics = (path: string): WordTopic[] => pageScenes(path).map(sceneTopic);

/** 画面の大事な言葉（場面の言葉）。その場面がいちばん目の言葉を先に（どこでも使う言葉は後に）。ほかは言葉の表の順 */
export function pageWordIds(path: string): string[] {
  const sc = pageScenes(path);
  if (!sc.length) return [];
  const ws = allWords().filter((w) => w.scene.some((s) => sc.includes(s)));
  return [...ws.filter((w) => sc.includes(w.scene[0])), ...ws.filter((w) => !sc.includes(w.scene[0]))].map((w) => w.id);
}

/** 記録を足す（新しい順に並べるため last_seen を今日に。count を1つ増やす。★はそのまま） */
export function logSeen(prev: WordLog | undefined, id: string, today: string, at?: number): WordLog {
  const t = at === undefined ? {} : { at };
  return prev ? { ...prev, ...t, last_seen: today, count: prev.count + 1 } : { word_id: id, first_seen: today, last_seen: today, count: 1, starred: false, ...t };
}

export type WordMode = 'all' | 'seen' | 'star';
const recency = (a: WordLog, b: WordLog) => b.last_seen.localeCompare(a.last_seen) || (b.at ?? 0) - (a.at ?? 0) || b.count - a.count;

export type WordFilter = { mode?: WordMode; starred?: boolean; kind?: WordKind; topic?: WordTopic; today?: string; q?: string };
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
    .filter(({ w, log }) => (mode !== 'star' || log.starred) && (!f.kind || w.kind === f.kind) && (!f.topic || w.topic === f.topic) && (!f.today || log.last_seen === f.today)
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
