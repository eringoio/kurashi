/* 確認状態の検査の共通部品（2026-11-08 作者の一括承認）。
   作者の一括承認（verified_by に「一括承認」）で verified にした根拠は、作者の確認として認める。それ以外の verified を探す */
interface Ev { status?: string; verified_by?: string }
export const isBulk = (e: Ev | undefined | null): boolean => e?.status === 'verified' && /一括承認|全部照合済み|\(bulk\)/.test(e.verified_by ?? '');

/** verified の根拠のうち、一括承認でないものの場所（JSON の文字列でも物でもよい） */
export function verifiedNotBulk(x: unknown): string[] {
  const o = typeof x === 'string' ? JSON.parse(x) : x;
  const out: string[] = [];
  const walk = (v: unknown, p: string) => {
    if (Array.isArray(v)) return v.forEach((y, i) => walk(y, `${p}[${i}]`));
    if (v && typeof v === 'object') {
      const e = v as Ev & Record<string, unknown>;
      if (e.status === 'verified' && ('source_ids' in e || 'verified_by' in e) && !isBulk(e)) out.push(p);
      for (const [k, y] of Object.entries(e)) walk(y, `${p}.${k}`);
    }
  };
  walk(o, '');
  return out;
}
