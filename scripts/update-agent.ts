/* データの更新のエージェント（docs/DATA_UPDATE.md 5章）。npm run data:agent（npm run data:fetch のあと）
   - 変わった・新しく取得・取得できない出典を使う根拠ごとに、「変わらない／変わった／判断できない」を出す。
   - まず機械で：引用が新しい本文にそのままあれば unchanged。それ以外は unclear。
   - ANTHROPIC_API_KEY があれば、unclear の項目だけ Claude に聞く（JSON の形を決めて返させる）。新しい引用が本文にそのまま無ければ採らない。
     キーが無いときは見本（機械の判定だけ）で動く。
   - 結果：sources/report/<日付>.json（Zod で検査）と .md（PR の本文）。verified にはしない。 */
import Anthropic from '@anthropic-ai/sdk';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { loadData } from '../src/core/data';
import { collectEvidence } from '../src/core/quotes';
import { acceptAi, compareIndex, judgeByQuotes, prBody, SourceIndex, Verdict } from '../src/core/update';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const root = arg('--root') ?? 'sources';
const MODEL = process.env.UPDATE_MODEL || 'claude-sonnet-5-5';

const read = (f: string) => SourceIndex.parse(existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {});
const prev = read(join(root, 'index.prev.json'));
const next = read(join(root, 'index.json'));
const cmp = compareIndex(prev, next);
const date = Object.values(next)[0]?.fetched_at ?? new Date().toISOString().slice(0, 10);
const body = (id: string) => {
  const e = next[id];
  const f = e && e.result === 'ok' ? join(root, 'snapshots', id, e.fetched_at + '.txt') : '';
  return f && existsSync(f) ? readFileSync(f, 'utf8') : null;
};
const url = (id: string) => next[id]?.url ?? null;

const data = loadData();
const items = collectEvidence(data);
let verdicts = judgeByQuotes(items, [...cmp.changed, ...cmp.added, ...cmp.failed], body, url);

const key = process.env.ANTHROPIC_API_KEY;
if (key) {
  const client = new Anthropic({ apiKey: key, maxRetries: 2 });
  const schema = { type: 'object', properties: { verdict: { type: 'string', enum: ['unchanged', 'changed', 'unclear'] }, new_quote: { type: 'string' }, proposal: { type: 'string' } }, required: ['verdict'], additionalProperties: false };
  const out: Verdict[] = [];
  for (const v of verdicts) {
    const b = body(v.source_id);
    if (v.verdict !== 'unclear' || !b) { out.push(v); continue; }
    const res = await client.beta.messages.create({
      model: MODEL, max_tokens: 2048,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: [
        { type: 'text', text: `名古屋市の生活の手続きのガイドのデータの、根拠「${v.where}」を確かめます。` },
        { type: 'text', text: `前の引用：${v.old_quote ?? '（なし）'}` },
        { type: 'text', text: `公式のページの今の本文：\n${b.slice(0, 60_000)}` },
        { type: 'text', text: '前の引用の内容が今の本文でも同じなら unchanged、変わっていれば changed（今の本文からそのまま写した new_quote と、直した値の proposal）、判断できなければ unclear。本文に無いことは書かないでください。' },
      ] }],
    });
    const t = res.stop_reason === 'refusal' ? null : res.content.find((c) => c.type === 'text');
    let raw: unknown = null;
    try { raw = t && t.type === 'text' ? JSON.parse(t.text) : null; } catch { raw = null; }
    out.push(acceptAi(v, raw, b));
  }
  verdicts = out;
}

const report = z.array(Verdict).parse(verdicts);
mkdirSync(join(root, 'report'), { recursive: true });
writeFileSync(join(root, 'report', date + '.json'), JSON.stringify({ date, sample: !key, ...cmp, verdicts: report }, null, 2) + '\n');
writeFileSync(join(root, 'report', date + '.md'), prBody(date, cmp, report, !key));
console.log(`判定 ${report.length} 件（変わらない ${report.filter((v) => v.verdict === 'unchanged').length}・変わった ${report.filter((v) => v.verdict === 'changed').length}・判断できない ${report.filter((v) => v.verdict === 'unclear').length}）。${key ? '' : '見本（キーなし）。'}`);
