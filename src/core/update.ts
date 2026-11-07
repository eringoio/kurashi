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
  /** 比べるためのハッシュ：本文から「最終更新日」などの行を除いて取る（stableText）。無いときは sha256 で比べる */
  stable_sha256: z.string().nullable().optional(),
  /** 次の取得で「変わっていなければ 304」を頼むための値 */
  etag: z.string().nullable().optional(),
  last_modified: z.string().nullable().optional(),
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
    else if (sameBody(p, n)) out.unchanged.push(id);
    else out.changed.push(id);
  }
  return out;
}

const sameBody = (p: IndexEntry, n: IndexEntry) => (p.stable_sha256 && n.stable_sha256 ? p.stable_sha256 === n.stable_sha256 : p.sha256 === n.sha256);

/** 中身と関係なく変わる短い行（更新日・ページ番号・閲覧数など）を除く。ハッシュを比べる前に使う */
const NOISE = /(最終更新日|更新日|掲載日|公開日|ページID|ページ番号|閲覧数|アクセス数|Last updated|Updated)\s*[:：]?/i;
export function stableText(text: string): string {
  return text.split('\n').filter((l) => !(l.length <= 60 && NOISE.test(l))).join('\n');
}

/** 前の本文に無かった行（新しい本文で足された・変わった行） */
export function addedLines(prev: string, next: string): string[] {
  const old = new Set(prev.split('\n').map((l) => l.trim()));
  return [...new Set(next.split('\n').map((l) => l.trim()).filter((l) => l && !old.has(l) && !NOISE.test(l)))];
}

/** 引用にいちばん近い場所（2文字の組がいちばん多く重なる所）。見つからなければ -1 */
export function nearest(body: string, quote: string): number {
  const q = normalize(quote);
  if (q.length < 2 || !body) return -1;
  const grams = new Set<string>();
  for (let i = 0; i < q.length - 1; i++) grams.add(q.slice(i, i + 2));
  const w = Math.max(q.length, 20);
  let best = -1, score = 0;
  const step = Math.max(1, Math.floor(w / 4));
  for (let i = 0; i < body.length; i += step) {
    const s = normalize(body.slice(i, i + w + 10));
    let hit = 0;
    for (let k = 0; k < s.length - 1; k++) if (grams.has(s.slice(k, k + 2))) hit++;
    if (hit > score) { score = hit; best = i; }
  }
  return score >= Math.min(3, grams.size) ? best : -1;
}

/** AI に送る本文の抜き出し：前の引用に近い所の前後と、前の週から変わった行だけ。全体で limit 字まで */
export function excerpt(body: string, quotes: string[], prev: string | null, limit = 6000, around = 700): string {
  const spans: [number, number][] = [];
  for (const q of quotes) {
    const at = nearest(body, q);
    if (at >= 0) spans.push([Math.max(0, at - around), Math.min(body.length, at + q.length + around)]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const s of spans) { const l = merged[merged.length - 1]; if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push([...s]); }
  const parts = merged.map(([a, b]) => body.slice(a, b));
  if (prev !== null) {
    // 変わった行は1行 300 字まで、全体の半分まで（長い1行のページでも、抜き出しが本文の全体にならないように）
    const add = addedLines(prev, body).map((l) => l.slice(0, 300)).join('\n').slice(0, Math.floor(limit / 2));
    if (add) parts.push('【前の週から変わった行】\n' + add);
  }
  // 近い所も変わった行も無いときは、本文の始めから
  const out = parts.length ? parts.join('\n…\n') : body;
  return out.slice(0, limit);
}

/** 1つの出典について、残った項目をまとめて聞いたときの答えの形（n は項目の番号） */
export const AiBatch = z.object({ items: z.array(z.object({ n: z.number().int(), verdict: z.enum(['unchanged', 'changed', 'unclear']), new_quote: z.string().optional(), proposal: z.string().optional() })) });
export const AI_BATCH_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer' }, verdict: { type: 'string', enum: ['unchanged', 'changed', 'unclear'] }, new_quote: { type: 'string' }, proposal: { type: 'string' } }, required: ['n', 'verdict'], additionalProperties: false } } },
  required: ['items'], additionalProperties: false,
} as const;

/** データの根拠を needs_check にするか。verified・ai_checked だけを下げる（draft・needs_check はそのまま）。取得できないときは変えない */
export function shouldMarkNeedsCheck(v: Verdict, status: string): boolean {
  if (status !== 'verified' && status !== 'ai_checked') return false;
  if (v.verdict === 'unchanged' || v.why === 'fetch_failed') return false;
  return true;
}

export const Verdict = z.object({
  where: z.string(),
  source_id: z.string(),
  verdict: z.enum(['unchanged', 'changed', 'unclear']),
  /** 判断の理由（no_quote：引用が無い／quote_missing：引用が新しい本文に無い／quote_found：そのままある／ai：AI の判断） */
  why: z.enum(['no_quote', 'quote_missing', 'quote_found', 'ai', 'fetch_failed', 'ai_limit']),
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
/** AI が書いた文（新しい引用・提案）：リンク・HTML・メンションにならないようにする（外のページの指示を PR に持ち込ませない） */
export const aiCell = (s?: string | null) => cell(s).replace(/[[\]<>`]/g, '').replace(/:\/\//g, ':／／').replace(/@/g, '＠');
/** PR の本文（作者が読む）。changed・unclear の項目は needs_check にする提案。verified にはしない */
export interface RunInfo { baseline?: boolean; usage?: { calls: number; input_tokens: number; output_tokens: number }; skipped_by_limit?: number }
export function prBody(date: string, cmp: ReturnType<typeof compareIndex>, verdicts: Verdict[], sample: boolean, info: RunInfo = {}): string {
  const need = verdicts.filter((v) => v.verdict !== 'unchanged');
  const lines = [
    `# データの更新の確認（${date}）`,
    '',
    info.baseline ? '> 1回目の実行：今のページを記録しただけ。AI は使わず、データも変えていない。' : sample ? '> 見本の実行（API キーなし）。判定は引用の照合だけ。' : '> 引用の照合と AI の判断。verified にはしていない（作者が確かめる）。',
    '',
    ...(info.usage ? [`AI：${info.usage.calls} 回・入力 ${info.usage.input_tokens} トークン・出力 ${info.usage.output_tokens} トークン${info.skipped_by_limit ? `（上限で ${info.skipped_by_limit} 件を聞かなかった）` : ''}`, ''] : []),
    `出典：変わった ${cmp.changed.length}・変わらない ${cmp.unchanged.length}・新しく取得 ${cmp.added.length}・取得できない ${cmp.failed.length}`,
    '',
    `作者が見る項目：${need.length} 件（変わった・判断できない）。これらは needs_check にする。`,
    '',
    '| 項目 | 出典 | 判定 | 理由 | 前の引用 | 新しい引用 | 提案 |',
    '|---|---|---|---|---|---|---|',
    ...need.map((v) => `| ${cell(v.where)} | ${v.url ? `[${cell(v.source_id)}](${v.url})` : cell(v.source_id)} | ${v.verdict} | ${v.why} | ${cell(v.old_quote)} | ${aiCell(v.new_quote)} | ${aiCell(v.proposal)} |`),
  ];
  if (cmp.failed.length) lines.push('', '取得できなかった出典（403 などは回避しない。前の本文のまま）：' + cmp.failed.join('、'));
  return lines.join('\n') + '\n';
}
