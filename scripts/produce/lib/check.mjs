/* 機械の検査（Zod のあと）。errors は保存の前に直す／warnings はレビューの紙に出して作者が見る。
   - 引用が原文テキストに実在するか（正規化して部分一致）
   - 3表示レベル（ja・ja_easy・en）の欠け
   - 数と否定が、日本語・やさしい日本語・英語で対応しているか（言葉の目安。誤検出はあり得る） */

export const normalize = (s) => s.normalize('NFKC').replace(/\{([^{}|]+)\|[^{}]*\}/g, '$1').replace(/[\s　"'“”‘’「」『』]/g, '').toLowerCase();

const walk = (v, f, p = '') => {
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, f, `${p}[${i}]`));
  else if (v && typeof v === 'object') { f(v, p); for (const [k, x] of Object.entries(v)) walk(x, f, p ? `${p}.${k}` : k); }
};

const isEvidence = (o) => Array.isArray(o.source_ids) && 'status' in o && 'checked_at' in o;
const isText = (o) => typeof o.ja === 'string' && !('reading' in o) && Object.keys(o).every((k) => ['ja', 'ja_easy', 'en'].includes(k));

const NEG_JA = /(できません|できない|ません|不要|いりません|禁止|不可|してはいけ|ではありません|なりません|されない|ありません|対象外)/;
const NEG_EN = /\b(not|no|cannot|can't|never|without|unable|don't|doesn't|isn't|aren't|won't|none|unnecessary|closed|except|excluding|unless|exempt)\b|n't/i;
const nums = (s) => (s.normalize('NFKC').match(/\d+/g) || []).map((n) => String(Number(n)));

/** sourceTexts: { 出典ID: 原文テキスト（モデルに渡した範囲） } */
export function mechanicalChecks(bundle, sourceTexts) {
  const errors = [], warnings = [];
  const norm = Object.fromEntries(Object.entries(sourceTexts).map(([k, t]) => [k, normalize(t)]));
  let quotes = 0;
  walk(bundle, (o, p) => {
    if (isEvidence(o)) {
      if (o.status !== 'needs_check') errors.push(`${p}: status は "needs_check" だけ（"${o.status}"）`);
      if (!o.source_ids.length) errors.push(`${p}: source_ids が空`);
      if (!o.quote || !o.quote.trim()) errors.push(`${p}: quote（原文の引用）がない`);
      else {
        quotes++;
        if (o.quote.length > 120) errors.push(`${p}: quote が120字を超えている`);
        const q = normalize(o.quote);
        const ok = o.source_ids.some((id) => norm[id] && norm[id].includes(q));
        if (!ok) errors.push(`${p}: quote が原文に見つからない「${o.quote.slice(0, 40)}…」（出典 ${o.source_ids.join(',')}）`);
      }
    }
    if (isText(o)) {
      for (const k of ['ja', 'ja_easy', 'en']) if (typeof o[k] !== 'string' || !o[k].trim()) errors.push(`${p}: ${k} が空（3表示レベルの欠け）`);
      if (/\{[^{}|]+\|[^{}]*\}/.test(Object.values(o).join(''))) warnings.push(`${p}: ふりがなの記法 {漢字|よみ} が入っている（あとで機械が付けるので不要）`);
      if (o.ja && o.en) {
        const nj = nums(o.ja), ne = nums(o.en), nz = nums(o.ja_easy || '');
        for (const n of nj) if (!ne.includes(n)) warnings.push(`${p}: 数「${n}」が日本語にあり英語にない`);
        for (const n of ne) if (!nj.includes(n)) warnings.push(`${p}: 数「${n}」が英語にあり日本語にない`);
        if (o.ja_easy) for (const n of nj) if (!nz.includes(n)) warnings.push(`${p}: 数「${n}」がやさしい日本語にない`);
        const nj1 = NEG_JA.test(o.ja), ne1 = NEG_EN.test(o.en.replace(/not sure/gi, '')), nz1 = NEG_JA.test(o.ja_easy || '');
        if (nj1 !== ne1) warnings.push(`${p}: 否定が日本語と英語で対応していない（ja:${nj1 ? '否定' : '肯定'} / en:${ne1 ? '否定' : '肯定'}）`);
        if (o.ja_easy && nj1 !== nz1) warnings.push(`${p}: 否定が日本語とやさしい日本語で対応していない`);
      }
    }
  });
  if (!quotes) errors.push('根拠（evidence）が1つもない');
  return { errors, warnings, quotes };
}
