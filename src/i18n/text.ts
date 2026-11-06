/* 多言語の文と表示レベル（SPEC 9.2・15.1）。
   言語は data/ui/languages.json だけで決まる。ここに言語名を書かない。 */
import languages from '../../data/ui/languages.json';
import strings from '../../data/ui/strings.json';

export type LevelKind = 'ja' | 'ja_easy' | 'foreign';
export interface Level { id: string; kind: LevelKind; lang: string; dir: 'ltr' | 'rtl'; label: string; labelRuby?: string; speechLang: string }
/** 言語ごとの文。キーは表示レベルの id（ja・ja_easy・en …）。ふりがなは {漢字|よみ} */
export type LocalizedText = { ja: string; ja_easy?: string; status?: 'draft' | 'verified' } & Record<string, string | undefined>;

export const LEVELS = languages.levels as Level[];
export const levelById = (id: string): Level => LEVELS.find((l) => l.id === id) ?? LEVELS[0];

const UI = strings as unknown as Record<string, LocalizedText>;
export type UiKey = Exclude<keyof typeof strings, '$comment'>;
export const ui = (k: UiKey): LocalizedText => UI[k];

/** 表示する形：主の1行と、外国語のときの2段目（ふりがな付きの日本語） */
export interface Shown { main: string; mainLang: string; sub: string | null; fallback: boolean; draft: boolean }

export function show(t: LocalizedText, level: Level): Shown {
  const easy = t.ja_easy ?? t.ja;
  const draft = t.status === 'draft';
  if (level.kind === 'ja') return { main: t.ja, mainLang: 'ja', sub: null, fallback: false, draft };
  if (level.kind === 'ja_easy') return { main: easy, mainLang: 'ja', sub: null, fallback: false, draft };
  const own = t[level.id];
  // その言語の文がないときは、日本語（やさしい）だけを出し、lang="ja" にする（SPEC 15.1・15.2）
  if (!own) return { main: easy, mainLang: 'ja', sub: null, fallback: true, draft };
  return { main: own, mainLang: level.lang, sub: easy, fallback: false, draft };
}

/** 1行だけの文（aria-label・狭いところ）。ふりがなは外す */
export function line(t: LocalizedText, level: Level): string {
  const s = show(t, level);
  return plain(s.main);
}

const RUBY = /\{([^|{}]+)\|([^{}]+)\}/g;
export type Seg = { t: string; r?: string };
/** {漢字|よみ} を区切る */
export function segs(s: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of s.matchAll(RUBY)) {
    if (m.index! > last) out.push({ t: s.slice(last, m.index) });
    out.push({ t: m[1], r: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last) });
  // 長いふりがな（正式名の「転入届（住居地の届出）」など）は、ふりがなの中で改行できず横にはみ出る。
  // 漢字の側と読みの側に同じ数の「（」「）」があれば、括弧の所で分ける（11/7。320px の窓口の画面）
  return out.flatMap((g) => {
    if (!g.r) return [g];
    const a = g.t.split(/(（[^（）]*）)/).filter(Boolean);
    const b = g.r.split(/(（[^（）]*）)/).filter(Boolean);
    if (a.length < 2 || a.length !== b.length) return [g];
    return a.map((t, i) => (/^（/.test(t) ? { t: t.slice(0, 1), r: undefined } : { t, r: b[i] })).flatMap((x, i) => {
      if (!/^（/.test(a[i])) return [x];
      return [{ t: '（' }, { t: a[i].slice(1, -1), r: b[i].slice(1, -1) }, { t: '）' }];
    });
  });
}
/** ふりがなを外した文（漢字のまま） */
export const plain = (s: string) => s.replace(RUBY, '$1');

/** 数と単位（「4〜7か月分」「14日以内」「052-951-7119」「#7119」「2,850円」）。表示の段階で <span class="nb"> に包み、途中で改行しない（11/7 6章） */
const NB = /#?\d[\d,.]*(?:[-〜~～][\d,.]+)*(?:か月分|か月|ヶ月|日以内|日間|週間|時間|キログラム|リットル|万円|円|日|年|月|歳|分|kg|㎡|帖|畳|%)?/g;
export type NbPart = { t: string; nb: boolean };
export function nbParts(s: string): NbPart[] {
  const out: NbPart[] = [];
  let last = 0;
  for (const m of s.matchAll(NB)) {
    if (m[0].length < 2) continue;
    if (m.index! > last) out.push({ t: s.slice(last, m.index), nb: false });
    out.push({ t: m[0], nb: true });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), nb: false });
  return out;
}
/** 読み上げ用の文（漢字を読みに置き換える。読み間違いを防ぐ。SPEC 6A.12） */
export const reading = (s: string) => s.replace(RUBY, '$2');
