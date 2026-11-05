/* データの更新（SPEC 12章・付録D v0.4.6 の4・v0.4.9、docs/DATA_UPDATE.md）。画面に依存しない。
   取得（scripts/fetch-sources.ts）→ 前回と比べる → 根拠ごとに「変わらない／変わった／判断できない」→ PR の本文。
   エージェントにさせないこと：verified にする・公式の一覧にないページを読む・本アプリの定義を変える。 */
import { z } from 'zod';
import type { EvidenceAt } from './quotes';
import { normalize } from './trust';

export const IndexEntry = z.object({
  source_id: z.string(),
  url: z.string().nullable(),
  fetched_at: z.string(),
  /** ok／http_403／robots_disallow／domain_not_allowed／pdf_unreadable など（scripts/produce/lib/fetch.mjs） */
  result: z.string(),
  sha256: z.string().nullable(),
  http_status: z.number().nullable(),
});
export type IndexEntry = z.infer<typeof IndexEntry>;
export const SourceIndex = z.record(z.string(), IndexEntry);
export type SourceIndex = z.infer<typeof SourceIndex>;

/** 前回と今回の取得を比べる。取得に失敗した出典は failed（前回の本文のまま。値は変えない） */
export function compareIndex(prev: SourceIndex, next: SourceIndex): { changed: string[]; unchanged: string[]; failed: string[]; added: string[] } {
  const out = { changed: [] as string[], unchanged: [] as string[], failed: [] as string[], added: [] as string[] };
  for (const [id, n] of Object.entries(next)) {
    const p = prev[id];
    if (n.result !== 'ok' || !n.sha256) out.failed.push(id);
    else if (!p || !p.sha256) out.added.push(id);
    else if (p.sha256 === n.sha256) out.unchanged.push(id);
    else out.changed.push(id);
  }
  return out;
}

export const Verdict = z.object({
  where: z.string(),
  source_id: z.string(),
  verdict: z.enum(['unchanged', 'changed', 'unclear']),
  /** 判断の理由（no_quote：引用が無い／quote_missing：引用が新しい本文に無い／quote_found：そのままある／ai：AI の判断） */
  why: z.enum(['no_quote', 'quote_missing', 'quote_found', 'ai', 'fetch_failed']),
  old_quote: z.string().optional(),
  /** changed のとき：新しい本文の中の引用（本文にそのまま無ければ採らない） */
  new_quote: z.string().optional(),
  /** changed のとき：直した値の提案（作者が確かめる） */
  proposal: z.string().optional(),
  url: z.string().nullable(),
});
export type Verdict = z.infer<typeof Verdict>;

/** 機械でできる判定：引用が新しい本文にそのままあれば unchanged、無ければ unclear（AI か作者が見る）。引用の無い根拠も unclear */
export function judgeByQuotes(items: EvidenceAt[], sourceIds: string[], body: (sourceId: string) => string | null, url: (sourceId: string) => string | null): Verdict[] {
  const ids = new Set(sourceIds);
  const out: Verdict[] = [];
  for (const { where, e } of items) {
    for (const s of e.source_ids) {
      if (!ids.has(s)) continue;
      const b = body(s);
      const base = { where, source_id: s, url: url(s), old_quote: e.quote };
      if (b === null) out.push({ ...base, verdict: 'unclear', why: 'fetch_failed' });
      else if (!e.quote) out.push({ ...base, verdict: 'unclear', why: 'no_quote' });
      else if (normalize(b).includes(normalize(e.quote))) out.push({ ...base, verdict: 'unchanged', why: 'quote_found' });
      else out.push({ ...base, verdict: 'unclear', why: 'quote_missing' });
    }
  }
  return out;
}

/** AI の判断を受け取る形（Zod で検査）。新しい引用が本文にそのまま無ければ unclear に戻す（作り話を防ぐ） */
export const AiJudgement = z.object({ verdict: z.enum(['unchanged', 'changed', 'unclear']), new_quote: z.string().max(200).optional(), proposal: z.string().max(400).optional() });
export function acceptAi(v: Verdict, raw: unknown, body: string): Verdict {
  const r = AiJudgement.safeParse(raw);
  if (!r.success) return v;
  const j = r.data;
  if (j.verdict === 'changed' && (!j.new_quote || !normalize(body).includes(normalize(j.new_quote)))) return { ...v, verdict: 'unclear', why: 'ai' };
  if (j.verdict === 'unchanged' && v.old_quote && !normalize(body).includes(normalize(v.old_quote))) return { ...v, verdict: 'unclear', why: 'ai' };
  return { ...v, verdict: j.verdict, why: 'ai', new_quote: j.new_quote, proposal: j.proposal };
}

const cell = (s?: string | null) => (s ?? '').replace(/\|/g, '｜').replace(/\n/g, ' ').slice(0, 200);
/** PR の本文（作者が読む）。changed・unclear の項目は needs_check にする提案。verified にはしない */
export function prBody(date: string, cmp: ReturnType<typeof compareIndex>, verdicts: Verdict[], sample: boolean): string {
  const need = verdicts.filter((v) => v.verdict !== 'unchanged');
  const lines = [
    `# データの更新の確認（${date}）`,
    '',
    sample ? '> 見本の実行（API キーなし）。判定は引用の照合だけ。' : '> 引用の照合と AI の判断。verified にはしていない（作者が確かめる）。',
    '',
    `出典：変わった ${cmp.changed.length}・変わらない ${cmp.unchanged.length}・新しく取得 ${cmp.added.length}・取得できない ${cmp.failed.length}`,
    '',
    `作者が見る項目：${need.length} 件（変わった・判断できない）。これらは needs_check にする。`,
    '',
    '| 項目 | 出典 | 判定 | 理由 | 前の引用 | 新しい引用 | 提案 |',
    '|---|---|---|---|---|---|---|',
    ...need.map((v) => `| ${cell(v.where)} | ${v.url ? `[${cell(v.source_id)}](${v.url})` : cell(v.source_id)} | ${v.verdict} | ${v.why} | ${cell(v.old_quote)} | ${cell(v.new_quote)} | ${cell(v.proposal)} |`),
  ];
  if (cmp.failed.length) lines.push('', '取得できなかった出典（403 などは回避しない。前の本文のまま）：' + cmp.failed.join('、'));
  return lines.join('\n') + '\n';
}
