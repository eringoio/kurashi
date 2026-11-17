// Round 2 of candidates (after feedback). Usage: node design/assets/gen-candidates-2.cjs <repoRoot>
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const ILL = path.join(root, 'design/assets/illustrations/candidates');
const LOGO = path.join(root, 'design/assets/logo/candidates');
fs.mkdirSync(ILL, { recursive: true }); fs.mkdirSync(LOGO, { recursive: true });

const INK = '#2A2A2E', SW = 2.4;
const P = (d, fill = 'none', sw = SW, extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"${extra}/>`;
const C = (cx, cy, r, fill = 'none') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${SW}"/>`;
const DOT = (x, y) => `<path d="M${x} ${y} L${x + 0.1} ${y}" fill="none" stroke="${INK}" stroke-width="3.2"/>`;
const svg = (body, vb = '-2 -2 52 52', w = 104, h = 104) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;
const out = (dir, name, s) => fs.writeFileSync(path.join(dir, name), s);

/* ---------- you v2: between you.svg and you-a. Plain clothes, no ears/neck/collar ---------- */
const SKIN = { a: '#F6EBD6', b: '#EFCFA8', c: '#C99A72', d: '#8E6246' };
const body = fill => P('M7 47 Q7 27.4 24 25 Q41 27.4 41 47 Z', fill);
const face = (skin, glasses = false) => C(24, 16, 10, skin) + DOT(20.4, 17) + DOT(27.6, 17) +
  (glasses ? C(20.4, 17, 3) + C(27.6, 17, 3) + P('M23.4 17 H24.6') : '') + P('M21.4 21 Q24 23.2 26.6 21');
const people = {
  'you2-a-short-hair': body('#CFE1F7') + face(SKIN.a) +
    P('M14 15 Q13.6 6 24 6 Q34.4 6 34 15 Q30 10.6 24 11 Q18 10.6 14 15 Z', '#5B4636'),
  'you2-b-long-hair': P('M13 17 Q11.6 29 15 32 H33 Q36.4 29 35 17 Z', '#3E3029') + body('#FAD9B0') + face(SKIN.b) +
    P('M14 16 Q13.6 6 24 6 Q34.4 6 34 16 Q30 13 26.4 9.4 Q21 13.6 14 16 Z', '#3E3029'),
  'you2-c-scarf': body('#CFE1F7') +
    P('M12 17 Q12 4.4 24 4.4 Q36 4.4 36 17 Q36 27.6 30 30.6 Q24 33 18 30.6 Q12 27.6 12 17 Z', '#9FCBB0') +
    P('M15.4 16.6 A8.6 9.2 0 1 0 32.6 16.6 A8.6 9.2 0 1 0 15.4 16.6 Z', SKIN.b) +
    DOT(20.6, 17) + DOT(27.4, 17) + P('M21.6 20.8 Q24 22.8 26.4 20.8'),
  'you2-d-curly-glasses': body('#F8D978') + face(SKIN.c, true) +
    P('M14 15 Q12 10.6 15.4 8.4 Q16.4 4.8 20.4 5.6 Q24 3.4 27.6 5.6 Q31.6 4.8 32.6 8.4 Q36 10.6 34 15 Q30 11.6 24 12 Q18 11.6 14 15 Z', '#2E2622'),
  'you2-e-bob': body('#C9DCEF') + face(SKIN.d) +
    P('M13.4 20 Q12 6 24 5.6 Q36 6 34.6 20 Q33.6 13.4 31 12 Q24 12.6 17 12 Q14.4 13.4 13.4 20 Z', '#1F1A17'),
  'you2-f-elder': body('#E5D7F0') + face(SKIN.b) +
    P('M14.4 13.6 Q15 7.4 20 6.8 M33.6 13.6 Q33 7.4 28 6.8'),
};
for (const [n, s] of Object.entries(people)) out(ILL, n + '.svg', svg(s));

/* ---------- plane ---------- */
const planeTop = 'M24 3 C26.6 3 27.2 6 27.2 9 V19 L44 29.4 V33.4 L27.2 28.4 V37 L32.4 41 V44.4 L24 42.2 L15.6 44.4 V41 L20.8 37 V28.4 L4 33.4 V29.4 L20.8 19 V9 C20.8 6 21.4 3 24 3 Z';
out(ILL, 'plane2-a-top.svg', svg(`<g transform="rotate(45 24 24)">${P(planeTop, '#CFE1F7')}</g>`));
const small = (tx, ty, deg) => `<g transform="translate(${tx} ${ty}) rotate(${deg} 24 24) scale(0.78) translate(6.8 6.8)">${P(planeTop, '#CFE1F7', SW / 0.78)}</g>`;
out(ILL, 'plane2-c-takeoff.svg', svg(P('M4 44 Q14 42 22 34', 'none', SW, ' stroke-dasharray="0.1 5"') + small(9, -7, 45) + P('M4 46 H44')));
// landing: side view, level with the nose a little up, gliding down to the ground
out(ILL, 'plane2-d-landing.svg', svg(P('M3 14 Q9 20 15 26', 'none', SW, ' stroke-dasharray="0.1 5"') +
  `<g transform="translate(14 18) scale(0.7) rotate(-6 26 27)">${P('M10 14 L14.4 14 L20 22.4 H10 Z', '#A9C8EC', SW / 0.7) + P('M6.4 22.4 H37 Q46 22.4 46 27 Q46 31.6 37 31.6 H10.6 Q6.4 31.6 5.4 27 Z', '#CFE1F7', SW / 0.7) + P('M38.6 23.6 Q42.6 24 43.8 26.6 H38.6 Z', '#FFFFFF', SW / 0.7) + P('M20 28.4 L15.6 39 H20.4 L29.6 28.4 Z', '#A9C8EC', SW / 0.7)}</g>` + P('M4 46 H44')));

/* ---------- homemove: arc as a solid line ---------- */
const house = (x, y, w, fill) => {
  const h = w * 0.8, rx = x + w / 2;
  return P(`M${x} ${y} L${rx} ${y - w * 0.55} L${x + w} ${y} V${y + h} H${x} Z`, fill) +
    P(`M${rx - w * 0.14} ${y + h} V${y + h * 0.5} H${rx + w * 0.14} V${y + h}`, '#FFFFFF');
};
const head = (x, y, ang) => {
  const a = ang * Math.PI / 180, L = 6, W = 4, f = v => v.toFixed(2);
  const bx = x - L * Math.cos(a), by = y - L * Math.sin(a), px = -Math.sin(a) * W, py = Math.cos(a) * W;
  return P(`M${f(x)} ${f(y)} L${f(bx + px)} ${f(by + py)} L${f(bx - px)} ${f(by - py)} Z`, INK);
};
out(ILL, 'homemove2-b-arc.svg', svg(house(2, 30, 13, '#FFFFFF') + house(33, 30, 13, '#FAD9B0') +
  P('M8.5 17 Q22 3 35.4 13.6') + head(39.5, 18.4, 50)));

/* ---------- bank v2: simpler, still bigger than the ward office ---------- */
const coin = (cx, cy, r) => C(cx, cy, r, '#F2C14E');
out(ILL, 'bank2-a-simple.svg', svg(
  P('M4 44 H44') + P('M7 40 H41 V44 H7 Z', '#F2E3B6') +
  P('M9 40 V21 H39 V40', '#F8D978') + P('M15 24 V37 M24 24 V37 M33 24 V37', 'none', 3.4) +
  P('M5 21 L24 7 L43 21 Z', '#FBE7A1') + coin(24, 15.4, 3)));
out(ILL, 'bank2-b-coin.svg', svg(
  P('M4 44 H44') + P('M7 22 H41 V44 H7 Z', '#F8D978') + P('M14 26 V40 M34 26 V40', 'none', 3.4) +
  P('M19.5 44 V31 H28.5 V44', '#FFFFFF') +
  P('M5 22 L24 8 L43 22 Z', '#FBE7A1') + coin(24, 16.4, 4)));
out(ILL, 'bank2-c-wide.svg', svg(
  P('M3 44 H45') + P('M5 40 H43 V44 H5 Z', '#F2E3B6') +
  P('M7 40 V22 H41 V40', '#F8D978') + P('M13 25 V37 M20 25 V37 M28 25 V37 M35 25 V37', 'none', 3) +
  P('M4 22 H44 L24 8 Z', '#FBE7A1') + coin(24, 16, 2.8)));

/* ---------- logo: house + check, variations ---------- */
const houseD = 'M6 24 L24 9 L42 24 V42 H6 Z';
const check = (sw = 3.6, d = 'M15.4 29 L21.4 35 L33 23.4') => P(d, 'none', sw);
const marks = {
  'logo1-a-base': () => P(houseD, '#FAD9B0') + check(),
  'logo1-b-soft-roof': () => P('M6 25.6 Q6 23 8 21.4 L21.4 10.6 Q24 8.6 26.6 10.6 L40 21.4 Q42 23 42 25.6 V39 Q42 42 39 42 H9 Q6 42 6 39 Z', '#FAD9B0') + check(),
  'logo1-c-chimney': () => P('M31 15 V8 H36 V19.4', '#F2A65A') + P(houseD, '#FAD9B0') + check(),
  'logo1-d-check-out': () => P(houseD, '#FAD9B0') + check(4, 'M14 28 L21 35.4 L44 10.6'),
  'logo1-e-blue': () => P(houseD, '#CFE1F7') + check(),
  'logo1-f-app-icon': () => `<rect x="-1" y="-1" width="50" height="50" rx="12" fill="#F2A65A"/>` +
    P('M10 25 L24 13 L38 25 V39 H10 Z', '#FFF6E8') + check(3.4, 'M17 29.6 L22 34.6 L31.6 25'),
  'logo1-g-outline': () => P(houseD, 'none', 3.6) + check(3.6),
  'logo1-h-door-check': () => P(houseD, '#FAD9B0') + P('M18 42 V30 H30 V42', '#FFFFFF') + check(3.2, 'M20.6 35.6 L23.4 38.4 L28 33'),
};
for (const [n, m] of Object.entries(marks)) out(LOGO, n + '-mark.svg', svg(m()));

/* ---------- hand-drawn "kurashi" wordmark (paths, no font needed) ---------- */
// Each glyph: [width, (x) => path]. Baseline 40, x-height 26, ascender 19.
const G = {
  k: [10, x => `M${x} 19 V40 M${x + 9.5} 26.5 L${x} 34 M${x + 3.6} 31 L${x + 10} 40`],
  u: [10, x => `M${x} 26 V34.5 Q${x} 40 ${x + 5} 40 Q${x + 10} 40 ${x + 10} 34.5 M${x + 10} 26 V40`],
  r: [8, x => `M${x} 26 V40 M${x} 31.4 Q${x + 2} 26 ${x + 8} 26.6`],
  a: [10.5, x => `M${x + 10} 30.4 Q${x + 9.4} 26 ${x + 5} 26 Q${x} 26 ${x} 33 Q${x} 40 ${x + 5} 40 Q${x + 9.4} 40 ${x + 10} 35.6 M${x + 10} 26 V39 Q${x + 10} 40 ${x + 10.8} 40.4`],
  s: [9, x => `M${x + 8.6} 27.8 Q${x + 7} 26 ${x + 4.4} 26 Q${x + 0.4} 26 ${x + 0.4} 29.4 Q${x + 0.4} 32.4 ${x + 4.4} 33 Q${x + 8.8} 33.6 ${x + 8.8} 36.6 Q${x + 8.8} 40 ${x + 4.4} 40 Q${x + 1.4} 40 ${x} 38.2`],
  h: [10, x => `M${x} 19 V40 M${x} 31 Q${x} 26 ${x + 5} 26 Q${x + 10} 26 ${x + 10} 31 V40`],
  i: [0, x => `M${x} 27 V40`],
};
function handword(x0, { bounce = false, sw = 4, dot = 'house' } = {}) {
  let x = x0, s = '', ix = 0;
  'kurash'.split('').concat('i').forEach((ch, k) => {
    const [w, f] = G[ch];
    const rot = bounce ? (k % 2 ? 4 : -4) : 0, dy = bounce ? (k % 2 ? -1.2 : 0.8) : 0;
    const cx = x + w / 2;
    s += `<g transform="translate(0 ${dy}) rotate(${rot} ${cx} 33)">${P(f(x), 'none', sw)}</g>`;
    if (ch === 'i') ix = x;
    x += w + 5;
  });
  s += dot === 'house'
    ? P(`M${ix - 4.6} 20.6 L${ix} 16.4 L${ix + 4.6} 20.6 V24 H${ix - 4.6} Z`, '#F2A65A', 2)
    : `<circle cx="${ix}" cy="21" r="2.8" fill="#F2A65A" stroke="${INK}" stroke-width="2"/>`;
  return { s, end: x };
}
const wm = (name, opts, withMark = true, mark = 'logo1-a-base', dir = LOGO) => {
  const x0 = withMark ? 58 : 4, { s, end } = handword(x0, opts);
  const m = withMark ? marks[mark]() : '';
  out(dir, name, svg(m + s, `-2 -2 ${end + 4} 52`, (end + 6) * 2, 104));
};
wm('logo1-wordmark-hand.svg', {});
wm('logo1-wordmark-hand-bounce.svg', { bounce: true });
wm('logo1-wordmark-hand-dot.svg', { bounce: true, dot: 'dot', sw: 4.6 });
wm('logo1-wordmark-hand-only.svg', { bounce: true }, false);
// chosen logo: mark d + hand-drawn word (dot version)
const FINAL = path.join(root, 'design/assets/logo');
out(FINAL, 'kurashi-mark.svg', svg(marks['logo1-d-check-out']()));
wm('kurashi-logo.svg', { bounce: true, dot: 'dot', sw: 4.6 }, true, 'logo1-d-check-out', FINAL);
console.log('ok');

/* ---------- landing variants (round 3): wheels down, level, near the ground ---------- */
const sidePlane = (sw, wheels = true) =>
  P('M10 14 L14.4 14 L20 22.4 H10 Z', '#A9C8EC', sw) +
  (wheels ? P('M17 31.6 V35.4 M35 31.6 V35.4', 'none', sw) + C(17, 37.2, 1.8, '#FFFFFF').replace(`stroke-width="${SW}"`, `stroke-width="${sw}"`) + C(35, 37.2, 1.8, '#FFFFFF').replace(`stroke-width="${SW}"`, `stroke-width="${sw}"`) : '') +
  P('M6.4 22.4 H37 Q46 22.4 46 27 Q46 31.6 37 31.6 H10.6 Q6.4 31.6 5.4 27 Z', '#CFE1F7', sw) +
  P('M38.6 23.6 Q42.6 24 43.8 26.6 H38.6 Z', '#FFFFFF', sw) +
  P('M20 28.4 L15.6 39 H20.4 L29.6 28.4 Z', '#A9C8EC', sw);
const placed = (tx, ty, sc, rot, wheels = true) => `<g transform="translate(${tx} ${ty}) scale(${sc}) rotate(${rot} 26 27)">${sidePlane(SW / sc, wheels)}</g>`;
// a: wheels down, nose a little up, short level trail, just above the runway
out(ILL, 'plane3-a-wheels.svg', svg(P('M2 22 H8 M1 27 H6', 'none') + placed(6, 6, 0.8, -4) + P('M3 45 H45')));
// b: touching down — wheels on the runway, speed lines behind
out(ILL, 'plane3-b-touchdown.svg', svg(P('M1 28 H7 M2 33 H8 M1 38 H5', 'none') + placed(6, 12.6, 0.8, 0) + P('M3 45 H45')));
// c: gentle descent — shallow dotted path down to a runway with centre marks
out(ILL, 'plane3-c-approach.svg', svg(P('M2 12 Q6 15 10 18', 'none', SW, ' stroke-dasharray="0.1 4.6"') +
  placed(9, 5, 0.72, -3) + P('M3 43 H45') + P('M8 46.6 H13 M21 46.6 H27 M35 46.6 H40', 'none')));
// d: seen from above — plane pointing right on a runway strip
out(ILL, 'plane3-d-runway.svg', svg(P('M1 13 H47 V35 H1 Z', '#E9E4DA') + P('M5 24 H10 M16 24 H21', 'none') +
  `<g transform="translate(6 0) rotate(90 24 24) scale(0.72) translate(9.3 9.3)">${P(planeTop, '#CFE1F7', SW / 0.72)}</g>`));
