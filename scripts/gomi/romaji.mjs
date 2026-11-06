/* 収集日の写し（data/private/gomi-schedule.json。Git に入れない）の町名に、ローマ字（Hepburn。長音は書かない）を付ける。
   よみは data/gomi/town-readings.json（町・丁目は住所マスター、大字・字はウィキペディアの各町の記事。出典はファイルの中）。
   表に無い町名があれば止まる（推測のよみは付けない）。画面では日本語の町名といっしょに出す（"Romaji（日本語）"）。
   使い方：node scripts/gomi/romaji.mjs   … 写しの各行に romaji を足して書き戻す（もう付いている行は変えない。--force で作り直す） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = path.join(ROOT, 'data', 'private', 'gomi-schedule.json');
const READINGS = path.join(ROOT, 'data', 'gomi', 'town-readings.json');
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

/** カタカナ → Hepburn（長音符 ー は書かない） */
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
    out += BASE[c] ?? (/[A-Za-z0-9|]/.test(c) ? c : '');
  }
  return out;
}

const KN = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const KNUM = Object.fromEntries(KN.map((c, i) => [c, i]));
function chomeNumber(s) {
  if (/^\d+$/.test(s)) return Number(s);
  const m = /^(?:([一二三四五六七八九])?十)?([一二三四五六七八九])?$/.exec(s);
  if (!m) return null;
  let n = 0;
  if (s.includes('十')) n += (m[1] ? KNUM[m[1]] : 1) * 10;
  if (m[2]) n += KNUM[m[2]];
  return n || null;
}

const toKata = (x) => x.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
/** 語の切れ目の「う」（井上＝い・の・うえ、元植田＝もと・うえだ）は長音ではない。表のよみで | を入れておく */
const KEEP = [['イノウエ', 'イノ|ウエ'], ['モトウエ', 'モト|ウエ']];
/** 長音（ou・oo・uu）は書かない（Hepburn の簡単な書き方） */
const dropLong = (r) => r.replace(/ou|oo/g, 'o').replace(/uu/g, 'u');
/** ひらがなのよみ（スペースは語の区切り）→ "Narumicho Aibaramachi" */
export function readingToRomaji(reading) {
  return reading.split(/\s+/).map((w) => {
    let k = toKata(w);
    for (const [a, b] of KEEP) k = k.replace(a, b);
    return cap(dropLong(kataToRomaji(k)).replace(/\|/g, ''));
  }).join(' ');
}

const norm = (s) => s.replace(/\(字なし\)|（字なし）/g, '').replace(/[､・]/g, '、').replace(/ニ丁目/g, '二丁目').trim();
const variants = (s) => [...new Set([s, s.replace(/ヶ/g, 'ケ'), s.replace(/ケ/g, 'ヶ')])];

/** 町名（例「栄四丁目」「相川一丁目、二丁目」「鳴海町　相原町」）→ ローマ字。よみが表に無ければ null。
    3つ目からの区切り（「県道…の東側」「6-1、8」など）はローマ字にしない（画面で日本語といっしょに出る） */
export function makeRomaji(readings, ward, town) {
  const [head, aza] = norm(town).split('　');
  const table = readings.towns[ward] || {};
  const read = (name) => variants(name).map((v) => table[v]).find(Boolean);
  const out = [];
  for (const [i, piece] of head.split('、').entries()) {
    const m = /^(.*?)([〇一二三四五六七八九十0-9]+)丁目$/.exec(piece);
    if (m && i > 0 && !m[1]) { const n = chomeNumber(m[2]); if (!n) return null; out.push(n + '-chome'); continue; }
    const r = read(m ? m[1] : piece);
    if (!r) return null;
    const n = m ? chomeNumber(m[2]) : null;
    out.push(readingToRomaji(r) + (n ? ' ' + n + '-chome' : ''));
  }
  let s = out.join(', ');
  if (aza) {
    const t = readings.aza[head] || {};
    const r = variants(aza).map((v) => t[v]).find(Boolean);
    if (!r) return null;
    s += ' ' + readingToRomaji(r);
  }
  return s;
}

async function main() {
  const p = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const readings = JSON.parse(fs.readFileSync(READINGS, 'utf8'));
  const cache = new Map();
  const missing = new Set();
  let n = 0;
  for (const a of p.areas) {
    if (a.romaji && !FORCE) continue;
    const key = a.ward + '|' + a.town;
    if (!cache.has(key)) cache.set(key, makeRomaji(readings, a.ward, a.town));
    const r = cache.get(key);
    if (!r) { missing.add(key); continue; }
    a.romaji = r;
    n++;
  }
  if (missing.size) {
    console.error(`no reading in data/gomi/town-readings.json for ${missing.size} towns (nothing written):\n` + [...missing].join('\n'));
    process.exit(1);
  }
  fs.writeFileSync(FILE, JSON.stringify(p, null, 1));
  console.log(`romaji added to ${n} rows (${cache.size} distinct towns)`);
  console.log([...cache.entries()].slice(0, 8).map(([k, v]) => `${k} -> ${v}`).join('\n'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
