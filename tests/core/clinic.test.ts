/* 病院の案内（SPEC 6A.13・18.10）：読み込みと参照、言葉で探す、診療科の順番、緊急の連絡先 */
import { describe, expect, it } from 'vitest';
import { checkClinic, CLINIC, departmentsFor, emergencyFor, searchParts } from '../../src/core/clinic';
import sourcesJson from '../../data/sources.json';

const d = CLINIC();
const src = new Set((sourcesJson as { sources: { source_id: string }[] }).sources.map((s) => s.source_id));
const part = (id: string) => d.parts.find((p) => p.id === id)!;
const firstDept = (id: string) => departmentsFor(d, part(id))[0].id;
const ids = (q: string) => searchParts(d, q).map((p) => p.id);

describe('データ', () => {
  it('14の場所・20の診療科。参照の誤りが無い', () => {
    expect(d.parts).toHaveLength(14);
    expect(d.departments).toHaveLength(20);
    expect(checkClinic(d, src)).toEqual([]);
  });
  it('どの場所にも診療科が1つ以上。すべて確認待ち', () => {
    for (const p of d.parts) {
      expect(p.departments.length, p.id).toBeGreaterThan(0);
      expect(p.evidence.status).toBe('needs_check');
    }
  });
  it('リンクは https で、クエリ文字列が無い', () => {
    for (const l of d.links) { expect(l.url.startsWith('https://')).toBe(true); expect(l.url).not.toContain('?'); }
  });
  it('検査：知らない診療科・重なった id・クエリ文字列を止める', () => {
    const bad = { ...d, parts: [...d.parts, { ...part('eye'), departments: ['nope'] }], links: [{ ...d.links[0], url: 'https://example.com/?q=1' }] };
    const e = checkClinic(bad, src).join('\n');
    expect(e).toMatch(/nope/);
    expect(e).toMatch(/2つある/);
    expect(e).toMatch(/クエリ/);
  });
});

describe('言葉で探す', () => {
  it('「は」「歯」「ハ」「Tooth」「tooth」で歯・口が出る（先頭）', () => {
    for (const q of ['は', '歯', 'ハ', 'Tooth', 'tooth']) expect(ids(q)[0], q).toBe('mouth');
  });
  it('知らない言葉では何も出ない。空も出ない', () => {
    expect(ids('xyzzy')).toEqual([]);
    expect(ids('  ')).toEqual([]);
  });
  it('目・頭も探せる', () => {
    expect(ids('め')[0]).toBe('eye');
    expect(ids('headache')[0]).toBe('head');
  });
});

describe('診療科の順番と緊急の連絡先', () => {
  it('各場所の1つめの科', () => {
    const first = firstDept;
    expect(first('eye')).toBe('ganka');
    expect(first('mouth')).toBe('shika');
    expect(first('limbs')).toBe('seikei');
    expect(first('child')).toBe('shoni');
    expect(first('preg')).toBe('sanfujin');
  });
  it('119・#7119・#8000 はいつも同じに出す（判断はしない。10c：どの場所でも先に確かめられる）', () => {
    const nums = (id: string | null) => emergencyFor(d, id ? part(id) : null).map((e) => e.number);
    expect(nums(null)).toEqual(['119', '#7119', '#8000']);
    expect(nums('mouth')).toEqual(['119', '#7119', '#8000']);
    expect(nums('child')).toEqual(['119', '#7119', '#8000']);
  });
  it('10c（医師のアドバイザー）：骨・関節は整形外科、子どもは小児科、病名・確率の言葉を使わない', () => {
    const first = firstDept;
    expect(first('limbs')).toBe('seikei');
    expect(d.departments.find((x) => x.id === 'seikei')!.covers.ja).toContain('ねんざ');
    expect(first('child')).toBe('shoni');
    const all = JSON.stringify({ parts: d.parts.map((p) => [p.name, p.say]), deps: d.departments.map((x) => x.covers), advice: d.advice, phrases: d.phrases });
    for (const w of ['かもしれません', '可能性', '最も適した', '病気です', '診断します']) expect(all, w).not.toContain(w);
    // 紹介状が無くても受診できる、と書く
    expect(d.advice.big.desc.ja.replace(/\{([^|}]+)\|[^}]+\}/g, '$1')).toContain('紹介状がなくても診てもらえます');
    // 公式のリンクだけ（https・クエリ文字列なし）
    for (const l of d.links) expect(l.url).toMatch(/^https:\/\/[^?]+$/);
  });
});
