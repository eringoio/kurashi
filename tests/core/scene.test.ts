/* 場面ごとの QR（9.8）：QR には場面の id だけ。開いたら、その場面のページから始める。固有の名前・答えの初期値は持たない */
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { checkScenes, loadScenes, parseScenePath, rememberScene, SCENES, START_PATH } from '../../src/core/scene';
import scenesJson from '../../data/scenes.json';

const data = loadData();

describe('場面のデータ', () => {
  it('どの場面も、一覧か始めるページを持つ', () => {
    expect(SCENES().length).toBeGreaterThan(0);
    for (const s of SCENES()) {
      if (s.shows.type === 'card_list') expect(data.cards.some((c) => c.place === (s.shows as { place: string }).place), s.id).toBe(true);
      else expect(s.shows.path).toMatch(START_PATH);
    }
  });
  it('始めるページがカード・出来事なら、そのデータがある', () => {
    for (const s of SCENES()) {
      if (s.shows.type !== 'start') continue;
      const c = /^\/c\/(.+)$/.exec(s.shows.path);
      if (c) expect(data.cards.some((x) => x.id === c[1]), s.id).toBe(true);
      const e = /^\/e\/(.+)$/.exec(s.shows.path);
      if (e) expect(data.events.some((x) => x.id === e[1]), s.id).toBe(true);
    }
  });
  it('答えの初期値・固有の名前の欄を持たない（どこに置いても使える）', () => {
    for (const s of (scenesJson as { scenes: Record<string, unknown>[] }).scenes) expect(Object.keys(s).sort()).toEqual(['id', 'shows', 'title']);
  });
  it('検査：同じ id、文の欠け、決まっていない始めるページを止める', () => {
    const s = SCENES()[0];
    expect(checkScenes([s, s]).join()).toMatch(/2つ/);
    expect(checkScenes([{ ...s, title: { ja: 'x' } }]).join()).toMatch(/en/);
    expect(() => loadScenes({ scenes: [{ id: 'x', title: s.title, shows: { type: 'start', path: '/move?answer=1' } }] })).toThrow();
    expect(() => loadScenes({ scenes: [{ id: 'x', title: s.title, shows: { type: 'start', path: 'https://example.com/' } }] })).toThrow();
  });
});

describe('URL', () => {
  it('/s/{id} と古い /pack/{id}。ほかは受けない', () => {
    expect(parseScenePath('/s/ward-office')).toBe('ward-office');
    expect(parseScenePath('/pack/ward-office')).toBe('ward-office');
    expect(parseScenePath('/s/Ward?x=1')).toBeNull();
    expect(parseScenePath('/s/')).toBeNull();
  });
  it('開いた場面は後ろに足す（同じ場面は1つ）', () => {
    expect(rememberScene(['move'], 'ward-office')).toEqual(['move', 'ward-office']);
    expect(rememberScene(['move', 'ward-office'], 'move')).toEqual(['ward-office', 'move']);
  });
});
