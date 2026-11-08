/* 書類の説明（SPEC 6A.9a。v0.5.25）：データの参照・公開の段階・書類の種類ごとに出す欄が違うこと */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DATA } from '../../src/core/data';
import { ALL_DOCUMENTS, isShown, loadDocuments } from '../../src/core/documents';
import candidates from '../../data/document-candidates.json';

const docs = ALL_DOCUMENTS();
const by = (id: string) => docs.find((d) => d.id === id)!;
const draftCards = new Set((existsSync('drafts/data') ? readdirSync('drafts/data') : []).filter((f) => f.endsWith('.bundle.json'))
  .flatMap((f) => (JSON.parse(readFileSync('drafts/data/' + f, 'utf8')).cards ?? []).map((c: { id: string }) => c.id)));

describe('書類のデータ', () => {
  it('リンク・カード・調査資料の id はみな在る。リンクは公式の URL', () => {
    const cand = new Set(candidates.candidates.map((c) => c.id));
    const cards = new Set(DATA().cards.map((c) => c.id));
    for (const d of docs) {
      for (const l of d.links) {
        const s = DATA().sources.find((x) => x.source_id === l.source_id);
        expect(s?.url, d.id + ' ' + l.source_id).toMatch(/^https:\/\//);
        expect(['government', 'public_corp'], d.id + ' ' + l.source_id).toContain(s!.owner_type);
      }
      for (const c of d.card_ids) expect(cards.has(c) || draftCards.has(c), d.id + ' ' + c).toBe(true);
      for (const c of d.catalogue_ids) expect(cand.has(c), d.id + ' ' + c).toBe(true);
    }
  });

  it('調査資料の候補は 388 件で、すべて research（画面に出さない）', () => {
    expect(candidates.count).toBe(388);
    expect(candidates.candidates.every((c) => c.status === 'research')).toBe(true);
  });

  it('公開は16件（作者が 11/8 に9件を確認）。要確認（review）の書類は本番に出さない', () => {
    expect(docs.filter((d) => isShown(d, false)).length).toBe(16);
    // 公開の書類は、作者が確かめた（verified_by）か、要確認の札が出る（needs_check）
    for (const d of docs.filter((x) => x.publication === 'public')) expect(d.evidence.status === 'verified' ? d.evidence.verified_by : d.evidence.status, d.id).toBeTruthy();
    expect(isShown({ ...by('tennyu-todoke'), publication: 'review' }, false)).toBe(false);
    expect(isShown({ ...by('tennyu-todoke'), publication: 'review' }, true)).toBe(true);
    expect(isShown({ ...by('tennyu-todoke'), publication: 'research' }, true)).toBe(false);
  });

  it('関係する書類の id が無いと読み込めない', () => {
    const raw = { documents: [{ ...by('tennyu-todoke'), related_docs: ['no-such-doc'] }] };
    expect(() => loadDocuments(raw)).toThrow(/no-such-doc/);
  });

  it('書類の種類ごとに、出す欄が変わる（10 の型）', () => {
    // 受け取る通知・書いて出す・払う・確かめて残す・更新・在留・使用量・警察への届け・証明書・あやしい通知
    const want: [string, string, string][] = [
      ['tennyugaku-tsuchisho', 'notice', 'receive'], ['tennyu-todoke', 'application', 'submit'], ['nenkin-nofusho', 'bill', 'receive'],
      ['nenkin-teikibin', 'statement', 'receive'], ['menkyo-koshin-renrakusho', 'notice', 'receive'], ['zairyu-shinsa-kanryo', 'email', 'receive'],
      ['suido-shiyoryo', 'statement', 'receive'], ['ishitsu-todoke', 'application', 'submit'], ['juminhyo-utsushi', 'certificate', 'receive'],
      ['kakuu-seikyu', 'warning', 'warning'],
    ];
    for (const [id, kind, dir] of want) {
      const d = by(id);
      expect([d.kind, d.direction], id).toEqual([kind, dir]);
      expect(d.actions.length, id).toBeGreaterThan(0);
      expect(d.links.length, id).toBeGreaterThan(0);
    }
    // 見本のリンクは「実物の見本」として出すものだけ（案内のページを見本にしない）
    expect(by('nenkin-nofusho').links.find((l) => l.kind === 'sample')?.source_id).toBe('nenkin-nofusho-2026-sample');
    expect(by('tennyu-todoke').links.some((l) => l.kind === 'sample' || l.kind === 'filled_example')).toBe(false);
    // 架空請求は電話しないことを先に。審査完了は「許可」と言い切らない
    expect(by('kakuu-seikyu').caution?.ja).toMatch(/電話|でんわ/);
    expect(by('zairyu-shinsa-kanryo').caution?.en).toMatch(/not proof of approval/);
    expect(by('zairyu-shinsa-kanryo').actions[2].ja).toMatch(/オンライン/);
    expect(by('tennyugaku-tsuchisho').actions.map((a) => a.ja).join()).toMatch(/教科/);
  });
});
