import { describe, expect, it } from 'vitest';
import { loadHelp, telHref } from '../../src/core/help';
import sources from '../../data/sources.json';

describe('相談窓口（I-4）', () => {
  const ids = new Set(sources.sources.map((s) => s.source_id));
  it('読み込める。出典が sources.json にある。3つの表示レベルの文がある', () => {
    const list = loadHelp(undefined, ids);
    expect(list.map((c) => c.id)).toEqual(['nic', 'isa-info', 'yorisoi', '7119']);
  });
  it('確かめていない窓口（FRESC・学校の留学生係）は入れない', () => {
    const t = JSON.stringify(loadHelp());
    expect(t).not.toContain('FRESC');
    expect(t).not.toContain('留学生');
  });
  it('電話のリンク：# は %23、ハイフンは消す', () => {
    expect(telHref('#7119')).toBe('tel:%237119');
    expect(telHref('052-581-0100')).toBe('tel:0525810100');
  });
});
