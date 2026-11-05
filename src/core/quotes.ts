/* 根拠（evidence）を集めて、AI 照合の条件を確かめる（SPEC v0.4.9・docs/DATA_UPDATE.md 3章・6章）。
   画面に依存しない。scripts/check-quotes.ts（CI）と /review（作者が確認する一覧）で同じものを使う。 */
import type { GuideData } from './data';
import type { Evidence } from './schema';
import { AI_CHECK_COUNTS, canBeAiChecked, type FieldKind } from './trust';

export interface EvidenceAt { where: string; kind: FieldKind; e: Evidence }

/** データの中の根拠を、欄の種類つきで全部並べる */
export function collectEvidence(d: GuideData): EvidenceAt[] {
  const out: EvidenceAt[] = [];
  const add = (where: string, kind: FieldKind, e: Evidence | undefined) => { if (e) out.push({ where, kind, e }); };
  for (const c of d.cards) {
    add(c.id, 'card_text', c.evidence);
    add(c.id + '.deadline', 'deadline', c.deadline?.evidence);
    add(c.id + '.where', 'place', c.where.evidence);
    (c.methods ?? []).forEach((m, i) => add(`${c.id}.methods[${i}]`, 'method', m.evidence));
    (c.alternatives ?? []).forEach((a, i) => add(`${c.id}.alternatives[${i}]`, 'object_name', a.evidence));
    (c.urgent?.contacts ?? []).forEach((k, i) => add(`${c.id}.urgent[${i}]`, k.type === 'link' ? 'link' : 'contact', k.evidence));
  }
  for (const r of d.rules.values()) add(r.id, 'rule', r.evidence);
  for (const r of d.relations) {
    const pre = r.type === 'legal_prerequisite' || r.type === 'practical_prerequisite';
    add(r.id, pre ? 'prerequisite' : 'relation', r.evidence);
    if (r.type === 'practical_prerequisite') add(r.id + '.day_order', 'prerequisite', r.day_order);
  }
  for (const o of d.objects) add(o.id, 'object_name', o.evidence);
  for (const e of d.events) add(e.id, 'card_text', e.evidence);
  return out;
}

/** 作者が確認する一覧（v0.4.9 の4）：ai_checked でも U のまま残った項目と、照合が食い違った項目 */
export function authorQueue(items: EvidenceAt[]): { stays_u: EvidenceAt[]; disagree: EvidenceAt[] } {
  return {
    stays_u: items.filter((x) => x.e.status === 'ai_checked' && !AI_CHECK_COUNTS[x.kind]),
    disagree: items.filter((x) => x.e.ai_check?.verdict === 'disagree'),
  };
}

/** 引用の確かめ。read(source_id, 日付) は取得した本文（sources/snapshots/<source_id>/<日付>.txt）か null。
    ai_checked は条件を満たさなければ誤り。引用だけがある根拠は、本文があれば同じに確かめる */
export function checkQuotes(items: EvidenceAt[], read: (sourceId: string, day: string) => string | null, sha256: (s: string) => string): string[] {
  const err: string[] = [];
  for (const { where, e } of items) {
    if (e.status !== 'ai_checked' && !e.ai_check) continue;
    const day = e.ai_check?.fetched_at;
    const bodies = day ? e.source_ids.map((s) => read(s, day)).filter((b): b is string => b !== null) : [];
    const body = bodies.find((b) => !e.ai_check || sha256(b) === e.ai_check.sha256) ?? null;
    if (e.ai_check && bodies.length && !body) err.push(`${where}：本文のハッシュが記録と違う`);
    const r = canBeAiChecked(e, body);
    if (!r.ok && e.status === 'ai_checked') err.push(`${where}：ai_checked にできない（${r.why.join('・')}）`);
  }
  return err;
}
