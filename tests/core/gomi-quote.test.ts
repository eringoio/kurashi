/* G-15：市の備考の終わりのリンクの名前を改行で分けても、文は1字も変わらない */
import { describe, expect, it } from 'vitest';
import opendata from '../../data/gomi/opendata.json';
import { splitCityLinks } from '../../src/core/gomiData';

describe('市の備考のリンクの名前', () => {
  const notes = (opendata.items as { label: { ja: string }; note?: { ja: string } }[]).filter((x) => x.note?.ja);
  it('すべての備考で、本文＋リンクの名前をつなぐと、もとの文と同じ', () => {
    for (const x of notes) {
      const s = splitCityLinks(x.note!.ja);
      expect(s.body + s.links.join(''), x.label.ja).toBe(x.note!.ja);
    }
  });
  it('「血圧計」は2つのリンクの名前に分かれる。分けたものが数百件ある', () => {
    const bp = notes.find((x) => x.label.ja === '血圧計')!;
    expect(splitCityLinks(bp.note!.ja).links).toEqual(['小型家電・充電式家電のリサイクル', '蛍光管・水銀体温計・水銀温度計・水銀血圧計の分け方・出し方']);
    expect(notes.filter((x) => splitCityLinks(x.note!.ja).links.length > 0).length).toBeGreaterThan(300);
  });
  it('終わりが名前でない文は分けない', () => {
    expect(splitCityLinks('袋に入れて出してください。')).toEqual({ body: '袋に入れて出してください。', links: [] });
  });
});
