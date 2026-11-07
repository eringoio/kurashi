import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { migrateProfile, Vault, type VaultEnv } from '../../src/storage/vault';

let env: VaultEnv;
let asked = 0;
beforeEach(() => {
  asked = 0;
  env = { indexedDB: new IDBFactory(), storage: { persist: async () => { asked++; return true; }, persisted: async () => true } };
  // idb は globalThis.indexedDB を使う
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = env.indexedDB;
});
const reopen = () => Vault.open(env);

describe('保存（SPEC 9.9）', () => {
  it('同意の前は、何も書かない', async () => {
    const v = await reopen();
    await v.put('profile', 'Q-origin', 'abroad');
    expect(v.shouldAskConsent()).toBe(true);
    const w = await reopen();
    expect(w.mode).toBe('undecided');
    expect(w.get('profile', 'Q-origin')).toBeUndefined();
  });
  it('「残す」で、それまでの分も書き、ブラウザに消さないよう頼む', async () => {
    const v = await reopen();
    await v.put('profile', 'Q-origin', 'abroad');
    await v.keep();
    expect(asked).toBe(1);
    await v.put('plan', 'nagoya-kokuho-kanyu', { status: 'todo', planned_on: '2026-11-06' });
    const w = await reopen();
    expect(w.mode).toBe('kept');
    expect(w.get('profile', 'Q-origin')).toBe('abroad');
    expect(w.get('plan', 'nagoya-kokuho-kanyu')).toEqual({ status: 'todo', planned_on: '2026-11-06' });
  });
  it('「残さない」は印だけを書き、次は聞かない', async () => {
    const v = await reopen();
    await v.put('profile', 'Q-origin', 'abroad');
    await v.dontKeep();
    const w = await reopen();
    expect(w.mode).toBe('not_kept');
    expect(w.get('profile', 'Q-origin')).toBeUndefined();
    await w.put('profile', 'Q-origin', 'abroad');
    expect(w.shouldAskConsent()).toBe(false);
  });
  it('見るだけは、保存を読まず、書かない。終わると元に戻る', async () => {
    const v = await reopen();
    await v.put('profile', 'Q-origin', 'abroad');
    await v.keep();
    v.startViewOnly();
    expect(v.get('profile', 'Q-origin')).toBeUndefined();
    await v.put('profile', 'Q-origin', 'other_city');
    expect(v.shouldAskConsent()).toBe(false);
    v.endViewOnly();
    expect(v.get('profile', 'Q-origin')).toBe('abroad');
    const w = await reopen();
    expect(w.get('profile', 'Q-origin')).toBe('abroad');
  });
  it('1つのストアだけ消せる', async () => {
    const v = await reopen();
    await v.put('profile', 'Q-origin', 'abroad');
    await v.put('phrases', 'w1', { saved_on: '2026-11-04' });
    await v.keep();
    await v.clearStore('phrases');
    const w = await reopen();
    expect(w.entries('phrases')).toEqual([]);
    expect(w.get('profile', 'Q-origin')).toBe('abroad');
  });
  it('全部消すと、同意の前に戻る', async () => {
    const v = await reopen();
    await v.put('profile', 'Q-origin', 'abroad');
    await v.keep();
    await v.wipe();
    const w = await reopen();
    expect(w.mode).toBe('undecided');
    expect(w.get('profile', 'Q-origin')).toBeUndefined();
  });
  it('IndexedDB が使えないときは、メモリの中だけで動く', async () => {
    const v = await Vault.open({});
    expect(v.mode).toBe('unavailable');
    await v.put('profile', 'Q-origin', 'abroad');
    expect(v.get('profile', 'Q-origin')).toBe('abroad');
  });
});

describe('古い保存の読み替え（B-4：国籍 → 在留資格）', () => {
  it('日本国籍の答えは国籍へ。ほかの在留資格は国籍を foreign に', () => {
    expect(migrateProfile(new Map([['Q-zairyu-status', 'japanese']]))).toEqual([['Q-nationality', 'japanese'], ['Q-zairyu-status', undefined]]);
    expect(migrateProfile(new Map([['Q-zairyu-status', 'student']]))).toEqual([['Q-nationality', 'foreign']]);
    expect(migrateProfile(new Map([['Q-zairyu-status', 'student'], ['Q-nationality', 'foreign']]))).toEqual([]);
    expect(migrateProfile(new Map())).toEqual([]);
  });
  it('開いたときに読み替えて保存する', async () => {
    const v = await reopen();
    await v.put('profile', 'Q-zairyu-status', 'japanese');
    await v.keep();
    const w = await reopen();
    expect(w.get('profile', 'Q-nationality')).toBe('japanese');
    expect(w.get('profile', 'Q-zairyu-status')).toBeUndefined();
    const x = await reopen();
    expect(x.get('profile', 'Q-zairyu-status')).toBeUndefined();
  });
});
