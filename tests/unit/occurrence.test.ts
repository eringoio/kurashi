/* 出来事ごとの進捗（SPEC 9.9 v0.4.7）。古い保存の読み方、出来事の分離、人の答えと出来事の答えの分け方 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { answerTarget, answersFor, currentOf, legacyOccurrence, listOccurrences, newOccurrence, type Occurrence } from '../../src/core/occurrence';
import { Vault } from '../../src/storage/vault';

const Q = loadData().questions;

describe('出来事ごとの進捗', () => {
  it('古い保存（v0.4.6）の引っ越しを occ-legacy として読む。人の答えは入れない', () => {
    const profile = { 'Q-origin': 'abroad', 'Q-age-band': '20_59', 'Q-moved-in': 'yes' };
    const plan = { 'nagoya-tennyu-todoke': { card_id: 'nagoya-tennyu-todoke', status: 'done' as const } };
    const o = legacyOccurrence(profile, plan, Q, '2026-11-03')!;
    expect(o).toMatchObject({ id: 'occ-legacy', event_id: 'E-move', started_on: '2026-11-03', answers: { 'Q-origin': 'abroad', 'Q-moved-in': 'yes' }, plan });
    expect(o.answers['Q-age-band']).toBeUndefined();
    expect(legacyOccurrence({}, {}, Q, null)).toBeNull();
  });
  it('同じイベントをもう一度始めると新しい出来事。前の「済んだ」は持ち込まない', () => {
    const first: Occurrence = { id: 'occ-lost-wallet-1', event_id: 'E-lost-wallet', started_on: '2026-10-01', closed_on: '2026-11-04', answers: { 'Q-x': 'a' }, plan: { c: { card_id: 'c', status: 'done' } } };
    const second = newOccurrence([first], 'E-lost-wallet', '2026-11-04');
    expect(second).toEqual({ id: 'occ-lost-wallet-2', event_id: 'E-lost-wallet', started_on: '2026-11-04', answers: {}, plan: {} });
    const list = listOccurrences([first, second], null);
    expect(currentOf(list, 'E-lost-wallet')?.id).toBe('occ-lost-wallet-2');
  });
  it('同時に進む別の出来事を混ぜない', () => {
    const move: Occurrence = { id: 'occ-move-1', event_id: 'E-move', started_on: '2026-11-01', answers: { 'Q-origin': 'other_city' }, plan: {} };
    const lost: Occurrence = { id: 'occ-lost-wallet-1', event_id: 'E-lost-wallet', started_on: '2026-11-04', answers: {}, plan: {} };
    const list = listOccurrences([move, lost], null);
    expect(currentOf(list, 'E-move')?.id).toBe('occ-move-1');
    expect(currentOf(list, 'E-lost-wallet')?.answers).toEqual({});
  });
  it('人の答え（年齢など）は出来事をまたいで使い、出来事の答えは混ぜない', () => {
    const profile = { 'Q-age-band': '20_59', 'Q-origin': 'abroad' };
    const occ: Occurrence = { id: 'occ-x-1', event_id: 'E-x', started_on: '2026-11-04', answers: { 'Q-moved-in': 'yes' }, plan: {} };
    expect(answersFor(occ, profile, Q)).toEqual({ 'Q-age-band': '20_59', 'Q-moved-in': 'yes' });
    expect(answerTarget(Q, 'Q-age-band')).toBe('profile');
    expect(answerTarget(Q, 'Q-origin')).toBe('occurrence');
  });
  it('ID に答え・日付を入れない（13.4）', () => {
    const o = newOccurrence([], 'E-lost-wallet', '2026-11-04');
    expect(o.id).not.toMatch(/2026|abroad/);
  });
});

describe('保存（SCHEMA_VERSION 2）', () => {
  it('v1 の保存を開いても消えず、occurrences ストアが足される。同意の前は書かない', async () => {
    const idb = new IDBFactory();
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = idb;
    // v1 の保存を作る（occurrences が無い）
    await new Promise<void>((ok) => {
      const r = idb.open('kurashi', 1);
      r.onupgradeneeded = () => { for (const s of ['settings', 'profile', 'plan', 'items', 'dates', 'objects', 'phrases', 'consent', 'resume', 'meta']) r.result.createObjectStore(s); };
      r.onsuccess = () => {
        const tx = r.result.transaction(['consent', 'profile'], 'readwrite');
        tx.objectStore('consent').put('yes', 'value');
        tx.objectStore('profile').put('abroad', 'Q-origin');
        tx.oncomplete = () => { r.result.close(); ok(); };
      };
    });
    const v = await Vault.open({ indexedDB: idb });
    expect(v.mode).toBe('kept');
    expect(v.get('profile', 'Q-origin')).toBe('abroad');
    await v.put('occurrences', 'occ-lost-wallet-1', { id: 'occ-lost-wallet-1' });
    const w = await Vault.open({ indexedDB: idb });
    expect(w.get('occurrences', 'occ-lost-wallet-1')).toEqual({ id: 'occ-lost-wallet-1' });

    const fresh = new IDBFactory();
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = fresh;
    const u = await Vault.open({ indexedDB: fresh });
    await u.put('occurrences', 'occ-a-1', { id: 'occ-a-1' });
    const u2 = await Vault.open({ indexedDB: fresh });
    expect(u2.get('occurrences', 'occ-a-1')).toBeUndefined();
  });
});
