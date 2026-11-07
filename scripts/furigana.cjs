/* ふつうの日本語（ja）の文に、ふりがなの印 {漢字|よみ} を付ける（SPEC 15.1。初期はオフで、設定でオンにできる）。
   使い方：npm run furigana        … data/ の文で、印のない漢字に印を付ける（もう付いているところは変えない）
          npm run furigana -- --check … 印のない漢字が残っていれば、一覧を出して止まる（書き換えない）
   よみは形態素解析（kuromoji）で作るので、間違うことがある。固有名詞のよみは、作者が確かめる（docs/TODO.md）。 */
const fs = require('fs');
const path = require('path');
const kuromoji = require('kuromoji');

const ROOT = path.join(__dirname, '..');
const CHECK = process.argv.includes('--check');
const KANJI = /[㐀-鿿々〆ヶ]/;
const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** 1語に印を付ける：漢字の部分にだけよみを付け、送りがなは外に出す（引っ越し → {引|ひ}っ{越|こ}し） */
function rubyToken(surface, reading) {
  if (!KANJI.test(surface) || !reading) return surface;
  const yomi = kata2hira(reading);
  const parts = surface.match(/[㐀-鿿々〆ヶ]+|[^㐀-鿿々〆ヶ]+/g);
  const re = new RegExp('^' + parts.map((p) => (KANJI.test(p[0]) ? '(.+?)' : kata2hira(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('') + '$');
  const m = re.exec(yomi);
  if (!m) return `{${surface}|${yomi}}`;
  let i = 1;
  return parts.map((p) => (KANJI.test(p[0]) ? `{${p}|${m[i++]}}` : p)).join('');
}

/** 解析が間違えやすいよみの直し（このアプリの使い方に合わせる）。見つけたら、ここに足す */
const FIXES = [
  ['{日本|にっぽん}', '{日本|にほん}'],
  ['{開|あ}け', '{開|ひら}け'],
  ['{開|あ}く', '{開|ひら}く'],
  ['{通帳|かよいちょう}', '{通帳|つうちょう}'],
  ['までの{間|ま}', 'までの{間|あいだ}'],
];
const fix = (s) => FIXES.reduce((a, [from, to]) => a.split(from).join(to), s);

/** 文に印を付ける。{...} の中は変えない */
function addRuby(tok, s) {
  return s.split(/(\{[^{}]*\})/).map((seg) => {
    if (seg.startsWith('{') || !KANJI.test(seg)) return seg;
    return tok.tokenize(seg).map((t) => rubyToken(t.surface_form, t.reading)).join('');
  }).join('');
}
const ruby = (tok, s) => fix(addRuby(tok, s));

/** ガイドと画面の文（ja と、ほかの言語のキーを持つもの）の ja だけを直す */
function walk(node, fn) {
  if (Array.isArray(node)) return node.forEach((x) => walk(x, fn));
  if (!node || typeof node !== 'object') return;
  if (typeof node.ja === 'string' && ('ja_easy' in node || 'en' in node)) fn(node);
  for (const v of Object.values(node)) walk(v, fn);
}

const files = [
  'data/ui/strings.json', 'data/rules.json', 'data/questions.json', 'data/objects.json', 'data/relations.json',
  ...fs.readdirSync(path.join(ROOT, 'data/cards')).map((f) => 'data/cards/' + f),
  // 下書きのできごとも（10d で短い一文 lead を足すため）
  ...(fs.existsSync(path.join(ROOT, 'drafts/data')) ? fs.readdirSync(path.join(ROOT, 'drafts/data')) : []).filter((f) => f.endsWith('.bundle.json')).map((f) => 'drafts/data/' + f),
];

kuromoji.builder({ dicPath: path.join(ROOT, 'node_modules/kuromoji/dict') }).build((err, tok) => {
  if (err) throw err;
  const left = [];
  for (const f of files) {
    const p = path.join(ROOT, f);
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    let changed = 0;
    walk(data, (t) => {
      const out = ruby(tok, t.ja);
      if (out !== t.ja) {
        if (CHECK) left.push(f + '：' + t.ja);
        else { t.ja = out; changed++; }
      }
    });
    if (changed) { fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n'); console.log(f, changed); }
  }
  if (CHECK && left.length) { console.error('ふりがなの印がない文：\n' + left.join('\n')); process.exit(1); }
});
