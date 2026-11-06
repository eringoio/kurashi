/* 収集日の写し（data/private/gomi-schedule.json。Git に入れない）の町名に、ローマ字（Hepburn。長音は書かない）を付ける。
   よみは kuromoji（形態素解析）。町名のよみは間違うことがあるので、画面では日本語の町名といっしょに出す（"Romaji（日本語）"）。
   使い方：node scripts/gomi/romaji.mjs   … 写しの各行に romaji を足して書き戻す（もう付いている行は変えない。--force で作り直す） */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const kuromoji = require('kuromoji');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = path.join(ROOT, 'data', 'private', 'gomi-schedule.json');
const FORCE = process.argv.includes('--force');

const BASE = {
  ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o', カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko', サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
  タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to', ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no', ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
  マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo', ヤ: 'ya', ユ: 'yu', ヨ: 'yo', ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro', ワ: 'wa', ヲ: 'o', ン: 'n',
  ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go', ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo', ダ: 'da', ヂ: 'ji', ヅ: 'zu', デ: 'de', ド: 'do',
  バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo', パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po', ヴ: 'vu', ヰ: 'i', ヱ: 'e', ヶ: 'ke',
};
const SMALL = { キ: 'k', シ: 's', チ: 'ch', ニ: 'n', ヒ: 'h', ミ: 'm', リ: 'r', ギ: 'g', ジ: 'j', ビ: 'b', ピ: 'p', ヂ: 'j' };
const YOON = { ャ: 'a', ュ: 'u', ョ: 'o' };
const VOWEL_SMALL = { ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o' };

/** カタカナ → Hepburn（長音符は書かない：Aioicho ではなく Aioichō の ō も o） */
export function kataToRomaji(kana) {
  let out = '';
  const chars = [...kana];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const nx = chars[i + 1];
    if (c === 'ッ') { const nr = nx && (BASE[nx] || ''); out += nr ? (nr.startsWith('ch') ? 't' : nr[0]) : ''; continue; }
    if (c === 'ー') continue;
    if (nx && YOON[nx] && SMALL[c]) {
      const k = SMALL[c];
      out += (k === 's' ? 'sh' : k) + (k === 's' || k === 'ch' || k === 'j' ? '' : 'y') + YOON[nx];
      i++; continue;
    }
    if (nx && VOWEL_SMALL[nx] && BASE[c]) { out += BASE[c].slice(0, -1) + VOWEL_SMALL[nx]; i++; continue; }
    if (c === 'ン') { out += 'n'; continue; }
    out += BASE[c] ?? (/[A-Za-z0-9]/.test(c) ? c : '');
  }
  return out;
}

const KNUM = { 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function kanjiNumber(s) {
  if (/^[〇一二三四五六七八九]+$/.test(s) && s.length > 1) return Number([...s].map((c) => KNUM[c]).join(''));
  let n = 0;
  const m = /^(?:([一二三四五六七八九])?十)?([一二三四五六七八九])?$/.exec(s);
  if (!m) return null;
  if (s.includes('十')) n += (m[1] ? KNUM[m[1]] : 1) * 10;
  if (m[2]) n += KNUM[m[2]];
  return n || (KNUM[s] ?? null);
}

function buildTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: path.join(ROOT, 'node_modules', 'kuromoji', 'dict') }).build((err, t) => (err ? reject(err) : resolve(t)));
  });
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** 長音（ou・oo・uu）は書かない（Hepburn の簡単な書き方） */
const dropLong = (r) => r.replace(/ou|oo/g, 'o').replace(/uu/g, 'u');

export function makeRomaji(tokenizer, town) {
  const toKata = (x) => x.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const reading = (x) => tokenizer.tokenize(x).map((t) => (t.reading && t.reading !== '*' ? t.reading : t.surface_form)).join('');
  const word = (x) => cap(dropLong(kataToRomaji(toKata(reading(x)))));
  // 「栄四丁目」→ Sakae 4-chome。「相川一丁目、二丁目」→ Aikawa 1-chome, 2-chome
  const pieces = town.split('、');
  const out = [];
  let base = '';
  pieces.forEach((piece, i) => {
    const m = /^(.*?)([〇一二三四五六七八九十]+)丁目$/.exec(piece);
    if (m && i > 0 && !m[1]) { const n = kanjiNumber(m[2]); if (n) out.push(n + '-chome'); return; }
    if (m) { base = word(m[1]); const n = kanjiNumber(m[2]); out.push((base ? base + ' ' : '') + (n ? n + '-chome' : '')); return; }
    out.push(word(piece));
  });
  return out.join(', ');
}

async function main() {
  const p = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const tk = await buildTokenizer();
  const cache = new Map();
  let n = 0;
  for (const a of p.areas) {
    if (a.romaji && !FORCE) continue;
    if (!cache.has(a.town)) cache.set(a.town, makeRomaji(tk, a.town));
    a.romaji = cache.get(a.town);
    n++;
  }
  fs.writeFileSync(FILE, JSON.stringify(p, null, 1));
  console.log(`romaji added to ${n} rows (${cache.size} distinct towns)`);
  const sample = [...cache.entries()].slice(0, 8).map(([k, v]) => `${k} -> ${v}`).join('\n');
  console.log(sample);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
