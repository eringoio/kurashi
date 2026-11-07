/* データの更新の結果を、データのファイルに入れる（docs/DATA_UPDATE.md 5章の3）。
   変えるのは根拠の status だけ（verified・ai_checked → needs_check）。値は変えない（提案は PR の本文にある）。
   ファイルの書き方（改行・並び）を保つため、JSON を読み直して書くのではなく、status の値の所だけを書き換える。 */
import { shouldMarkNeedsCheck, type Verdict } from '../../src/core/update';

type Path = (string | number)[];
interface Node { start: number; end: number; kind: 'obj' | 'arr' | 'str' | 'other'; keys?: Map<string, Node>; items?: Node[]; value?: string }

/** 位置つきの JSON の読み取り（値ごとに、ファイルの中の始めと終わり） */
export function parsePositions(src: string): Node {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const str = (): Node => {
    const start = i; i++;
    while (src[i] !== '"') { if (src[i] === '\\') i++; i++; }
    i++;
    return { start, end: i, kind: 'str', value: JSON.parse(src.slice(start, i)) };
  };
  const val = (): Node => {
    ws();
    const c = src[i];
    if (c === '"') return str();
    if (c === '{') {
      const start = i++; const keys = new Map<string, Node>();
      ws();
      if (src[i] === '}') { i++; return { start, end: i, kind: 'obj', keys }; }
      for (;;) {
        ws(); const k = str().value!; ws(); i++; // :
        keys.set(k, val()); ws();
        if (src[i++] === '}') return { start, end: i, kind: 'obj', keys };
      }
    }
    if (c === '[') {
      const start = i++; const items: Node[] = [];
      ws();
      if (src[i] === ']') { i++; return { start, end: i, kind: 'arr', items }; }
      for (;;) {
        items.push(val()); ws();
        if (src[i++] === ']') return { start, end: i, kind: 'arr', items };
      }
    }
    const start = i;
    while (i < src.length && !/[\s,\]}]/.test(src[i])) i++;
    return { start, end: i, kind: 'other' };
  };
  return val();
}

const at = (n: Node | undefined, p: Path): Node | undefined => {
  for (const k of p) {
    if (!n) return undefined;
    n = typeof k === 'number' ? n.items?.[k] : n.keys?.get(k);
  }
  return n;
};

/** 根拠の場所（collectEvidence の where）から、ファイルとその中の道筋を出す */
export function locate(where: string, files: { cards: Set<string>; lists: Record<string, Map<string, number>> }): { file: string; path: Path } | null {
  const dot = where.indexOf('.');
  const id = dot < 0 ? where : where.slice(0, dot);
  const rest = dot < 0 ? '' : where.slice(dot + 1);
  if (files.cards.has(id)) {
    const file = `cards/${id}.json`;
    if (!rest) return { file, path: ['evidence'] };
    const m = rest.match(/^(\w+)(?:\[(\d+)\])?$/);
    if (!m) return null;
    const [, k, n] = m;
    if (n === undefined && ['deadline', 'fee', 'where'].includes(k)) return { file, path: [k, 'evidence'] };
    if (n !== undefined && (k === 'methods' || k === 'alternatives')) return { file, path: [k, Number(n), 'evidence'] };
    if (n !== undefined && k === 'urgent') return { file, path: ['urgent', 'contacts', Number(n), 'evidence'] };
    return null;
  }
  for (const [list, ids] of Object.entries(files.lists)) {
    const n = ids.get(id) ?? ids.get(where);
    if (n === undefined) continue;
    const whole = ids.has(where);
    if (whole) return { file: `${list}.json`, path: [list, n, 'evidence'] };
    if (rest === 'day_order') return { file: `${list}.json`, path: [list, n, 'day_order'] };
    return null;
  }
  return null;
}

/** 1つのファイルの中で、道筋の根拠の status を needs_check にする。変えたら新しい文、変えなければ null */
export function markInText(src: string, path: Path, verdict: Verdict): { text: string; from: string } | null {
  const ev = at(parsePositions(src), path);
  const st = ev?.keys?.get('status');
  if (!st || st.kind !== 'str' || !shouldMarkNeedsCheck(verdict, st.value!)) return null;
  return { text: src.slice(0, st.start) + '"needs_check"' + src.slice(st.end), from: st.value! };
}

export interface Applied { where: string; file: string; from: string }
/** 判定をまとめてファイルに入れる。read・write は data/ からの相対の名前 */
export function applyVerdicts(verdicts: Verdict[], read: (f: string) => string | null, write: (f: string, s: string) => void, cardIds: string[]): { applied: Applied[]; not_found: string[] } {
  const lists: Record<string, Map<string, number>> = {};
  for (const l of ['rules', 'relations', 'objects', 'events']) {
    const s = read(`${l}.json`);
    const arr = s ? (JSON.parse(s)[l] as { id: string }[]) : [];
    lists[l] = new Map(arr.map((x, i) => [x.id, i]));
  }
  const files = { cards: new Set(cardIds), lists };
  const cache = new Map<string, string>();
  const applied: Applied[] = []; const notFound = new Set<string>();
  const done = new Set<string>();
  for (const v of verdicts) {
    if (done.has(v.where) || v.verdict === 'unchanged' || v.why === 'fetch_failed') continue;
    const loc = locate(v.where, files);
    if (!loc) { notFound.add(v.where); continue; }
    const src = cache.get(loc.file) ?? read(loc.file);
    if (src === null) { notFound.add(v.where); continue; }
    const r = markInText(src, loc.path, v);
    if (!r) continue;
    cache.set(loc.file, r.text);
    applied.push({ where: v.where, file: loc.file, from: r.from });
    done.add(v.where);
  }
  for (const [f, s] of cache) write(f, s);
  return { applied, not_found: [...notFound] };
}
