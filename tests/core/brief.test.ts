/* 10d：短い一文（作者の指摘 11/6「文字が多い」） */
import { describe, expect, it } from 'vitest';
import { briefText, cardLead, firstSentence } from '../../src/core/brief';
import { DATA } from '../../src/core/data';

describe('短い一文', () => {
  it('最初の一文で切る。かっこ・「」の中では切らない', () => {
    expect(firstSentence('転入届を出します（14日以内。要確認）。在留カードを持って行きます。', 'ja')).toBe('転入届を出します（14日以内。要確認）。');
    expect(firstSentence('電話で：「お電話しました。名前と申します。」と言います。次へ。', 'ja')).toBe('電話で：「お電話しました。名前と申します。」と言います。');
    expect(firstSentence('File it e.g. at a counter. Then wait.', 'en')).toBe('File it e.g. at a counter.');
  });
  it('後ろの文が要確認なら、一文にも要確認を付ける', () => {
    const b = briefText({ ja: '区役所に行きます。期限は14日です（要確認）。', en: 'Go to the ward office. Deadline 14 days (to be checked).' });
    expect(b.ja).toBe('区役所に行きます（{要|よう}{確認|かくにん}）。');
    expect(b.en).toBe('Go to the ward office (to be checked).');
  });
  it('lead があればそれ。本文が要確認なら lead にも付ける', () => {
    expect(cardLead({ lead: { ja: '短い。' }, summary: { ja: '長い本文です（要確認）。' } }).ja).toBe('短い（{要|よう}{確認|かくにん}）。');
    expect(cardLead({ lead: { ja: '短い。' }, summary: { ja: '長い本文です。' } }).ja).toBe('短い。');
  });
  it('公開のカードの短い一文は、ふつうの日本語で70字まで', () => {
    const plain = (s: string) => s.replace(/\{([^|}]+)\|[^}]+\}/g, '$1');
    const long = DATA().cards.map((c) => [c.id, plain(cardLead(c).ja)] as const).filter(([, s]) => s.length > 70);
    expect(long).toEqual([]);
  });
});
