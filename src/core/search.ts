/* 手続きを探す（入口の検索）。言葉1つでも、文でも探せる（作者 11/7 の試し）。
   端末の中だけで比べる。探した言葉は URL にも保存にも入れない（SPEC 13.4）。
   - 日本語の文：カードの言葉（名前・よみ・keywords）が文の中にあれば当たり（「引っ越したので住所を変えたい」→ 引っ越し・住所）。
   - 英語の文：語に分けて、よくある語（I・need・to など）を外し、語の形（-ing・-s など）をそろえて比べる。
   - 打っている途中の短い言葉：カードの言葉の一部なら当たり（今までどおり）。 */

const RUBY = /\{([^|{}]+)\|([^|{}]+)\}/g;
const plainOf = (s: string) => s.replace(RUBY, '$1');
const readingOf = (s: string) => s.replace(RUBY, '$2');

/** 比べる形：全角・半角をそろえ、小文字にし、カタカナをひらがなにする。空白は外す */
export const norm = (s: string) => spaced(s).replace(/\s+/g, '');

/** 比べる形（空白は1つに）。記号は空白にする */
const spaced = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[、。，．,.!?！？「」『』（）()・/／:：;；"'“”‘’\-–—~〜]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const LATIN = /^[ -~]+$/;
/** 英語の文によく出て、手続きを決めない語 */
const STOP = new Set(
  ('i me my mine we our you your he she they it its a an the to of in on at for from by with and or but so ' +
    'is am are was were be been do does did have has had can could should would will shall may might must ' +
    'need needs want wants like how what when where which who why please help about this that these those ' +
    'just get got go going some any there here new now then also too very really thing things know not no yes hi hello')
    .split(' '),
);
/** 語の形をそろえる（moving→mov、moved→mov、accounts→account、insurance→insur…）。ゆるくてよい */
const stem = (w: string) => w.replace(/(ing|ed|es|s|e)$/, '') || w;

/** 日本語の文を、助詞などで区切る（分かち書きのかわり。ゆるくてよい） */
const JA_SPLIT = /(?:したい|したら|したので|しました|します|する|ので|から|まで|けど|ため|たい|ました|です|ます|ください|って|を|は|が|に|で|と|も|へ|や|の|か|ね|よ)/g;

interface Term { text: string; latin: boolean; words: string[] }

export interface Searchable {
  card: {
    title: Record<string, string | undefined>;
    official_name: { ja: string; reading: string };
    keywords: string[];
  };
}

function termsOf(c: Searchable): Term[] {
  const t = Object.values(c.card.title).filter((x): x is string => typeof x === 'string');
  const raw = [...t.map(plainOf), ...t.map(readingOf), c.card.official_name.ja, c.card.official_name.reading, ...c.card.keywords];
  const seen = new Set<string>();
  const out: Term[] = [];
  for (const r of raw) {
    const s = spaced(r);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    const latin = LATIN.test(s);
    out.push({ text: latin ? s : s.replace(/ /g, ''), latin, words: latin ? s.split(' ').filter((w) => !STOP.has(w)).map(stem) : [] });
  }
  return out;
}

/** 探す言葉を読んだ形 */
export interface Query {
  /** 空白を外した全体（日本語の文の中を探す） */
  compact: string;
  /** 英語の語（よくある語を外し、形をそろえた） */
  latin: string[];
  /** 英語の語の、打ったままの形（合った言葉として見せる） */
  latinRaw: string[];
  /** 日本語の区切り（2文字以上） */
  ja: string[];
}

export function parseQuery(q: string): Query {
  const s = spaced(q);
  const parts = s.split(' ').filter(Boolean);
  const latinRaw = parts.filter((p) => LATIN.test(p) && !STOP.has(p) && stem(p).length >= 2);
  const latin = latinRaw.map(stem);
  const ja = parts
    .filter((p) => !LATIN.test(p))
    .flatMap((p) => [p, ...p.split(JA_SPLIT)])
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  return { compact: s.replace(/ /g, ''), latin, latinRaw, ja };
}

/** どのくらい合うか（0 は合わない）と、合ったカードの言葉 */
export function score(c: Searchable, q: Query): { score: number; hits: string[] } {
  if (!q.compact) return { score: 0, hits: [] };
  // 同じ言葉でカードの言葉が何度も合っても、1回と数える。長い言葉で合うほど強い（「ごみの日」は「ごみ」より強い）
  const ja = new Set<string>();
  const latinWhole = new Set<number>();
  const latinPart = new Map<number, string>();
  const qWords = q.latin;
  for (const t of termsOf(c)) {
    if (t.latin) {
      const n = t.words.length;
      if (!n) continue;
      // カードの言葉（1語でも2語でも）が、文の中に並んで出てくる
      let found = false;
      for (let i = 0; i + n <= qWords.length; i++) {
        if (t.words.every((w, j) => qWords[i + j] === w)) { found = true; for (let j = 0; j < n; j++) latinWhole.add(i + j); }
      }
      if (found) continue;
      // 打っている途中（3文字以上）：カードの語の始まりと同じ
      qWords.forEach((w, i) => {
        if (w.length >= 3 && t.words.some((tw) => tw.startsWith(w) || (w.length >= 4 && tw.length >= 4 && w.startsWith(tw)))) latinPart.set(i, w);
      });
    } else {
      if (t.text.length >= 2 && q.compact.includes(t.text)) { ja.add(t.text); continue; }
      // 短い言葉（打っている途中・区切った言葉）が、カードの言葉の一部
      for (const w of q.ja) if (t.text.includes(w)) ja.add(w);
      if (q.compact.length <= 8 && t.text.includes(q.compact)) ja.add(q.compact);
    }
  }
  // ほかの合った言葉の中に入っている言葉は数えない（「ごみの日」と「ごみ」なら「ごみの日」だけ）
  const jaHits = [...ja].filter((w) => ![...ja].some((o) => o !== w && o.includes(w)));
  let total = jaHits.reduce((n, w) => n + w.length, 0) + latinWhole.size * 3;
  const hits = [...jaHits];
  for (const i of [...latinWhole].sort((a, b) => a - b)) hits.push(q.latinRaw[i]);
  for (const [i, w] of latinPart) if (!latinWhole.has(i)) { total += 1; hits.push(q.latinRaw[i] ?? w); }
  return { score: total, hits: [...new Set(hits)] };
}

/** 合うカードを、合う順に。いちばん合うものより、ずっと弱いものは外す（文のときの雑音を減らす） */
export function rank<T extends Searchable>(items: T[], text: string): { item: T; hits: string[] }[] {
  const q = parseQuery(text);
  const scored = items.map((item) => ({ item, ...score(item, q) })).filter((x) => x.score > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((x) => x.score));
  return scored
    .filter((x) => x.score * 3 >= best)
    .sort((a, b) => b.score - a.score)
    .map(({ item, hits }) => ({ item, hits }));
}

/** 今までの使い方（当たるかどうかだけ） */
export function match(c: Searchable, q: string): boolean {
  return score(c, parseQuery(q)).score > 0;
}
