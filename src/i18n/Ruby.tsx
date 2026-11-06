/* 文を出す部品。ふりがなを消したときは <ruby> を出さない（SPEC 15.2）。
   改行（11/7 6章）：数と単位は <span class="nb">（途中で改行しない）。phrase のときは BudouX で文節の切れ目にだけ <wbr> を入れ、
   CSS の .phrase（word-break: keep-all）で、それ以外の所では改行しない。使う所は題・項目の名前・一文（lead）だけ（作者の許可 11/6 夜）。 */
import { loadDefaultJapaneseParser } from 'budoux';
import { Fragment, type ElementType, type ReactNode } from 'react';
import { nbParts, segs, show, type LocalizedText, type UiKey, ui } from './text';
import { usePrefs } from '../storage/prefs';

let parser: ReturnType<typeof loadDefaultJapaneseParser> | null = null;
const cache = new Map<string, Set<number>>();
const JA = /[぀-ヿ㐀-鿿]/;
/** 文節の切れ目（文の先頭からの文字数）。日本語を含まない文は切れ目なし */
function breaksOf(plainText: string): Set<number> {
  if (!JA.test(plainText)) return new Set();
  const hit = cache.get(plainText);
  if (hit) return hit;
  parser ??= loadDefaultJapaneseParser();
  const out = new Set<number>();
  let n = 0;
  for (const c of parser.parse(plainText).slice(0, -1)) out.add((n += c.length));
  if (cache.size > 2000) cache.clear();
  cache.set(plainText, out);
  return out;
}

/** 数と単位を nb の span に包む */
function withNb(t: string, key: string): ReactNode[] {
  return nbParts(t).map((p, i) => (p.nb ? <span key={key + '-' + i} className="nb">{p.t}</span> : <Fragment key={key + '-' + i}>{p.t}</Fragment>));
}

/** furigana を渡すと、設定にかかわらずふりがなを付ける（ことば。作者 11/7 K-5） */
export function Ruby({ s, phrase, furigana: force }: { s: string; phrase?: boolean; furigana?: boolean }) {
  const furigana = usePrefs().furigana || !!force;
  const parts = segs(s);
  const br = phrase ? breaksOf(parts.map((g) => g.t).join('')) : new Set<number>();
  const out: ReactNode[] = [];
  let at = 0;
  parts.forEach((g, i) => {
    if (g.r) {
      if (at > 0 && br.has(at)) out.push(<wbr key={'w' + i} />);
      out.push(furigana ? (
        <ruby key={i}>
          {g.t}
          {/* 読みは目で見るためのもの。読み上げでは漢字だけを読ませ、二重に読まれないようにする（U34。VoiceOver の実機で確かめる） */}
          <rt aria-hidden="true">{g.r}</rt>
        </ruby>
      ) : <Fragment key={i}>{g.t}</Fragment>);
    } else {
      // 文字の文：文節の切れ目で分け、<wbr> を入れる
      let from = 0;
      for (let k = 1; k <= g.t.length; k++) {
        if (k === g.t.length || br.has(at + k)) {
          if (from > 0 || (at > 0 && br.has(at))) out.push(<wbr key={'w' + i + '-' + from} />);
          out.push(...withNb(g.t.slice(from, k), i + '-' + from));
          from = k;
        }
      }
    }
    at += g.t.length;
  });
  return phrase ? <span className="phrase">{out}</span> : <>{out}</>;
}

/** 大事な文：表示レベルの1行。外国語のときは下にふりがな付きの日本語（BilingualText） */
export function Bi({ t, k, as, className, phrase }: { t?: LocalizedText; k?: UiKey; as?: ElementType; className?: string; phrase?: boolean }) {
  const { level } = usePrefs();
  const text = t ?? ui(k!);
  const s = show(text, level);
  const Tag = as ?? 'span';
  return (
    <Tag className={'bi' + (className ? ' ' + className : '')}>
      <span className="bi__main" lang={s.mainLang}>
        <Ruby s={s.main} phrase={phrase} />
      </span>
      {s.sub && (
        <span className="bi__ja" lang="ja">
          <Ruby s={s.sub} phrase={phrase} />
        </span>
      )}
    </Tag>
  );
}

/** 1行だけの文（狭いところ。English は英語だけ） */
export function One({ t, k, phrase }: { t?: LocalizedText; k?: UiKey; phrase?: boolean }) {
  const { level } = usePrefs();
  const s = show(t ?? ui(k!), level);
  return (
    <span lang={s.mainLang}>
      <Ruby s={s.main} phrase={phrase} />
    </span>
  );
}
