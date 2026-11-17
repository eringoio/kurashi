/* 書類の検索（v0.5.31。作者 11/8）：名前だけでなく、説明の大事な言葉からも探せる。端末の中だけ */
import { describe, expect, it } from 'vitest';
import { DOCUMENTS, docSearchItems } from '../../src/core/documents';
import { rank } from '../../src/core/search';

const items = docSearchItems(DOCUMENTS());
const ids = (q: string) => rank(items, q).map((x) => x.item.doc.id);

describe('書類の検索', () => {
  it('公開の書類16件すべてが対象。調査中（research）は入れない。要確認（review）は開発だけ（R-12）', () => {
    expect(items.filter((x) => x.doc.publication === 'public').length).toBe(16);
    expect(items.every((x) => x.doc.publication === 'public' || x.doc.publication === 'review')).toBe(true);
  });
  it('名前で探せる（漢字・よみ・英語）', () => {
    expect(ids('ねんきん定期便')[0]).toBe('nenkin-teikibin');
    expect(ids('住民票')[0]).toBe('juminhyo-utsushi');
    expect(ids('pension')).toContain('nenkin-teikibin');
  });
  it('説明の大事な言葉・発行元からも探せる', () => {
    expect(ids('加入記録')).toEqual(['nenkin-teikibin']);
    expect(ids('訴訟')).toEqual(['kakuu-seikyu']);
    expect(ids('落とし物')).toContain('ishitsu-todoke');
    expect(ids('入管')).toContain('zairyu-shinsa-kanryo');
  });
  it('名前で合う書類を、説明だけで合う書類より上に出す', () => {
    const r = ids('年金');
    expect(r).toContain('nenkin-teikibin');
    expect(r.indexOf('nenkin-nofusho')).toBeLessThan(r.indexOf('kokuho-shikaku') === -1 ? 99 : r.indexOf('kokuho-shikaku'));
  });
  it('税・国保・マイナンバーの言い方で探せる（C-4）', () => {
    // 住民税の通知は review（R-12）。開発（data/documents-review.json がある木）でだけ出る
    if (DOCUMENTS().some((d) => d.id === 'juminzei-tsuchi')) for (const q of ['税', 'tax', '住民税', 'ぜいきん', 'residence tax']) expect(ids(q)[0], q).toBe('juminzei-tsuchi');
    for (const q of ['kokuho', 'こくほ', '国保']) expect(['kokuho-shikaku', 'kokuho-nofu', 'kokuho-shikaku-joho'], q).toContain(ids(q)[0]);
    expect(ids('My Number')[0]).toBe('kojin-bango-tsuchisho');
    expect(ids('マイナンバー')[0]).toBe('kojin-bango-tsuchisho');
  });
  it('合わないときは空', () => {
    expect(ids('zzzz')).toEqual([]);
    expect(ids('')).toEqual([]);
  });
});
