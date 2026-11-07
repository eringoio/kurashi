import { describe, expect, it } from 'vitest';
import { helpFor, loadHelp, telHref } from '../../src/core/help';
import sources from '../../data/sources.json';

describe('相談窓口（I-4）', () => {
  const ids = new Set(sources.sources.map((s) => s.source_id));
  it('読み込める。出典が sources.json にある。3つの表示レベルの文がある', () => {
    const list = loadHelp(undefined, ids);
    expect(list.map((c) => c.id)).toEqual(['nic', 'isa-info', 'yorisoi', '7119', 'sodai']);
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
  it('粗大ごみ受付センターは、ごみの画面だけに出す（作者 11/7）', () => {
    const ids = (p: string) => helpFor(p).map((c) => c.id);
    for (const p of ['/gomi', '/e/E-gomi', '/e/E-gomi/c/gomi-sodai', '/c/gomi-sodai', '/c/gomi-mochikomi']) expect(ids(p), p).toContain('sodai');
    for (const p of ['/', '/now', '/e/E-move', '/c/bank-account-open', '/clinic', '/gomi-x']) expect(ids(p), p).not.toContain('sodai');
    expect(ids('/')).toEqual(['nic', 'isa-info', 'yorisoi', '7119']);
    expect(ids('/gomi')[0]).toBe('sodai');
  });
});
