/* 語学学習の最初の版（作者が OK 2026-11-06。STATUS 10b） */
import { describe, expect, it } from 'vitest';
import { DATA } from '../../src/core/data';
import { allWords, docWordIds, heardFirst, listWords, logSeen, pageScenes, pageWordIds, recentWords, type WordLog } from '../../src/core/words';

const W = allWords();
describe('ことば', () => {
  it('聞こえる言葉・言う文・手続きの名前・書類の言葉がある', () => {
    for (const k of ['heard', 'say', 'word', 'official', 'doc']) expect(W.some((w) => w.kind === k), k).toBe(true);
    expect(W.find((w) => w.id === 'card:nagoya-tennyu-juukyochi')).toBeTruthy();
  });
  it('記録：初めては1回、別の日は回数が増える。★は残る', () => {
    const a = logSeen(undefined, 'heard-bangofuda', '2026-11-06');
    expect(a).toEqual({ word_id: 'heard-bangofuda', first_seen: '2026-11-06', last_seen: '2026-11-06', count: 1, starred: false });
    const b = logSeen({ ...a, starred: true }, 'heard-bangofuda', '2026-11-07');
    expect(b).toMatchObject({ count: 2, last_seen: '2026-11-07', starred: true });
  });
  it('一覧：新しい順・★だけ・種類・今日・言葉で探す', () => {
    const logs: Record<string, WordLog> = {
      'heard-bangofuda': { word_id: 'heard-bangofuda', first_seen: '2026-11-05', last_seen: '2026-11-05', count: 3, starred: true },
      'say-nihongo': { word_id: 'say-nihongo', first_seen: '2026-11-06', last_seen: '2026-11-06', count: 1, starred: false },
    };
    expect(listWords(W, logs, {}).map((x) => x.w.id)).toEqual(['say-nihongo', 'heard-bangofuda']);
    expect(listWords(W, logs, { starred: true }).map((x) => x.w.id)).toEqual(['heard-bangofuda']);
    expect(listWords(W, logs, { kind: 'say' }).map((x) => x.w.id)).toEqual(['say-nihongo']);
    expect(listWords(W, logs, { today: '2026-11-06' }).map((x) => x.w.id)).toEqual(['say-nihongo']);
    expect(listWords(W, logs, { q: 'ばんごう' }).map((x) => x.w.id)).toEqual(['heard-bangofuda']);
    expect(listWords(W, logs, { q: 'number ticket' }).map((x) => x.w.id)).toEqual(['heard-bangofuda']);
  });
  it('モード all/seen/star：同じ絞り込みで、見たものを新しい順に先に。さいきんは最大10件', () => {
    const logs: Record<string, WordLog> = {
      'heard-bangofuda': { word_id: 'heard-bangofuda', first_seen: '2026-11-06', last_seen: '2026-11-06', count: 1, starred: true, at: 1000 },
      'say-nihongo': { word_id: 'say-nihongo', first_seen: '2026-11-06', last_seen: '2026-11-06', count: 5, starred: false, at: 2000 },
    };
    const all = listWords(W, logs, { mode: 'all' });
    expect(all).toHaveLength(W.length);
    expect(all.slice(0, 2).map((x) => x.w.id)).toEqual(['say-nihongo', 'heard-bangofuda']);
    expect(listWords(W, logs, { mode: 'seen' })).toHaveLength(2);
    expect(listWords(W, logs, { mode: 'star' }).map((x) => x.w.id)).toEqual(['heard-bangofuda']);
    expect(listWords(W, logs, { mode: 'all', kind: 'say' }).every((x) => x.w.kind === 'say')).toBe(true);
    expect(listWords(W, logs, { mode: 'all', q: 'number ticket' }).map((x) => x.w.id)).toEqual(['heard-bangofuda']);
    expect(recentWords(W, logs).map((x) => x.w.id)).toEqual(['say-nihongo', 'heard-bangofuda']);
    const many = Object.fromEntries(W.slice(0, 15).map((w, i) => [w.id, { word_id: w.id, first_seen: '2026-11-07', last_seen: '2026-11-07', count: 1, starred: false, at: i }]));
    const r = recentWords(W, many);
    expect(r).toHaveLength(10);
    expect(r[0].w.id).toBe(W[14].id);
  });
  it('記録に時刻 at を残す', () => {
    expect(logSeen(undefined, 'x', '2026-11-07', 5)).toMatchObject({ at: 5 });
    expect(logSeen(logSeen(undefined, 'x', '2026-11-07', 5), 'x', '2026-11-07', 9)).toMatchObject({ at: 9, count: 2 });
  });
  it('窓口で：聞こえる言葉を3つ。★を先に', () => {
    const logs: Record<string, WordLog> = { 'heard-tsugi': { word_id: 'heard-tsugi', first_seen: 'x', last_seen: 'x', count: 1, starred: true } };
    const h = heardFirst(W, logs, 'ward_office');
    expect(h).toHaveLength(3);
    expect(h[0].id).toBe('heard-tsugi');
  });
  it('画面の言葉：ごみは種類と曜日、病院は症状と体の場所、書類は大事な言葉。id は重ならない', () => {
    const ids = new Set(W.map((w) => w.id));
    expect(ids.size).toBe(W.length);
    const gomi = pageWordIds('/gomi');
    for (const id of ['word-kanen', 'word-funen', 'word-getsuyou', 'word-nichiyou', 'word-shushubi']) expect(gomi).toContain(id);
    expect(pageWordIds('/e/E-gomi')).toEqual(gomi);
    const clinic = pageWordIds('/clinic/departments');
    for (const id of ['say-netsu', 'say-seki', 'clinic-part:head', 'clinic-say:head', 'heard-monshin']) expect(clinic).toContain(id);
    const doc = docWordIds('kokuho-shikaku');
    expect(doc.length).toBeGreaterThan(1);
    expect(doc.every((id) => ids.has(id))).toBe(true);
    expect(pageWordIds('/words')).toEqual([]);
  });
  it('公開のできごとの画面には、どれも大事な言葉がある。言葉の場面は、どこかの画面で出る', () => {
    for (const e of DATA().events.filter((x) => x.status === 'built')) expect(pageWordIds('/e/' + e.id).length, e.id).toBeGreaterThan(5);
    const scenes = new Set(['/', '/move', '/e/E-bank', '/e/E-job', '/e/E-stay-renew', '/e/E-house-search', '/gomi', '/clinic', '/letter', '/calendar', '/visit/ward_office'].flatMap(pageScenes));
    for (const w of W) for (const sc of w.scene) expect(scenes.has(sc), w.id + ' ' + sc).toBe(true);
  });
});
