/* 作者のレビュー用の紙（drafts/review/<task-id>.md）：原文の引用・生成文・条件・警告 */
const T = (t) => (t ? `ja: ${t.ja}\n  - やさしい: ${t.ja_easy ?? '（なし）'}\n  - en: ${t.en ?? '（なし）'}` : '（なし）');
const cond = (c) => (c ? '`' + JSON.stringify(c) + '`' : '（なし）');

export function renderReview({ task, bundle, sources, fetchRecs, warnings, state, today }) {
  const L = [];
  L.push(`# レビュー：${task.id} ${task.title || ''}`, '',
    `下書き（全部 needs_check）。作者が原文と照らして直し、承認した差分だけを data/ に移す。生成日 ${today}、契約 ${state.contract}、モデル ${state.stages.generate?.model ?? state.model}（${state.adapter}）。`, '');
  L.push('## 出典と取得結果', '', '| ID | URL（最終） | HTTP | 取得日時 | sha256（本文） | 文字数 |', '|---|---|---|---|---|---|');
  for (const f of fetchRecs) L.push(`| ${f.id} | ${f.final_url} | ${f.http_status} | ${f.fetched_at} | ${(f.sha256 || '').slice(0, 12)} | ${f.chars} |`);
  const tr = sources.filter((s) => s.truncated).map((s) => s.id);
  if (tr.length) L.push('', `注意：入力が長いため先頭だけをモデルに渡した出典：${tr.join(', ')}`);
  L.push('', '## 機械検査の警告（数・否定・記法の目安。誤検出もある）', '');
  L.push(...(warnings.length ? warnings.map((w) => `- ${w}`) : ['- なし']));
  const ev = (e) => (e ? `根拠 [${e.source_ids.join(',')}] ${e.status}「${e.quote ?? ''}」${e.note ? `（${e.note}）` : ''}` : '');
  L.push('', '## イベント', '');
  for (const e of bundle.events || []) L.push(`### ${e.id}`, `- 名前 ${T(e.title)}`, `- 質問: ${(e.questions || []).join(', ') || 'なし'}`, `- カード: ${(e.card_ids || []).join(', ')}`, `- 範囲のルール: ${e.scope_rule ?? '既定'}`, `- ${ev(e.evidence)}`, '');
  L.push('## カード', '');
  for (const c of bundle.cards || []) {
    L.push(`### ${c.id}（${c.kind ?? 'procedure'}、${c.obligation}、${c.awareness_type}）`, `- 名前 ${T(c.title)}`, `- 要約 ${T(c.summary)}`,
      `- 期限: ${c.deadline ? T(c.deadline.text) + '\n  - ' + ev(c.deadline.evidence) : 'なし'}`, `- 窓口 ${T(c.where?.text)}\n  - ${ev(c.where?.evidence)}`,
      `- 対象の条件（ルール）: ${JSON.stringify(c.eligibility)}`);
    for (const m of c.methods || []) L.push(`- 方法 ${m.type}: ${m.text.ja} / ${m.text.en}\n  - ${ev(m.evidence)}`);
    for (const a of c.alternatives || []) L.push(`- 代わり: ${a.text.ja}\n  - ${ev(a.evidence)}`);
    L.push(`- ${ev(c.evidence)}`, '');
  }
  L.push('## ルール（条件）', '');
  for (const r of bundle.rules || []) L.push(`- ${r.id}（${r.kind}）${cond(r.condition)}：${r.statement.ja} / ${r.statement.en}\n  - ${ev(r.evidence)}`);
  L.push('', '## 質問', '');
  for (const q of bundle.questions || []) L.push(`- ${q.id}（fact ${q.fact}、${q.scope}${q.multi ? '、複数選択' : ''}）${q.text.ja} / ${q.text.en}：${q.options.map((o) => o.value).join(' / ')}`);
  L.push('', '## 関係', '');
  for (const r of bundle.relations || []) L.push(`- ${r.id}（${r.type}）${r.from ? `${r.from} → ${r.to}` : (r.card_ids || []).join(' & ')}：${r.explain.ja}\n  - ${ev(r.evidence)}`);
  L.push('', '## 作者が見ること', '', '- 引用と生成文が合っているか。期限・日数・費用が原文のとおりか。', '- 条件（ルール）が原文より広くも狭くもなっていないか。', '- 承認できない箇所は消すか直す。承認前に data/ へ移さない。', '');
  return L.join('\n');
}
