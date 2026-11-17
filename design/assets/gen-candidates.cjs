// Generates candidate illustrations and logos. Usage: node gen.js <repoRoot>
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const ILL = path.join(root, 'design/assets/illustrations/candidates');
const LOGO = path.join(root, 'design/assets/logo/candidates');
fs.mkdirSync(ILL, { recursive: true }); fs.mkdirSync(LOGO, { recursive: true });

const INK = '#2A2A2E', SW = 2.4;
const P = (d, fill = 'none', extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}"${extra.includes("stroke-width") ? "" : ` stroke-width="${SW}"`}${extra}/>`;
const C = (cx, cy, r, fill = 'none') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${SW}"/>`;
const DOT = (x, y) => `<path d="M${x} ${y} L${x + 0.1} ${y}" fill="none" stroke="${INK}" stroke-width="3.4"/>`;
const svg = (body, vb = '-2 -2 52 52') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="104" height="104" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;
const out = (dir, name, s) => fs.writeFileSync(path.join(dir, name), s);

/* ---------- you: bigger head, shoulders fill the box, more detail ---------- */
const SKIN = { a: '#F6EBD6', b: '#EFCFA8', c: '#C99A72', d: '#8E6246' };
function face(skin, { brows = true, glasses = false, blush = true } = {}) {
  let s = '';
  s += P('M20 26 V31 H28 V26', skin);                               // neck
  s += C(13.6, 17, 2.4, skin) + C(34.4, 17, 2.4, skin);             // ears
  s += C(24, 16, 10.5, skin);                                       // head
  s += DOT(20, 17) + DOT(28, 17);                                    // eyes
  if (brows) s += P('M18.2 13.6 Q20 12.6 21.8 13.6 M26.2 13.6 Q28 12.6 29.8 13.6');
  if (glasses) s += C(20, 17, 3.2) + C(28, 17, 3.2) + P('M23.2 17 H24.8');
  if (blush) s += `<circle cx="17.6" cy="20.6" r="1.6" fill="#F4B7A6"/><circle cx="30.4" cy="20.6" r="1.6" fill="#F4B7A6"/>`;
  s += P('M21.2 21.4 Q24 23.8 26.8 21.4');                          // smile
  return s;
}
const body = (fill, extra = '') => P('M4 48 Q4 33 17 30.5 Q24 34 31 30.5 Q44 33 44 48 Z', fill) + extra;
const people = {
  // short hair, shirt with collar
  'you-a-short-hair': body('#CFE1F7', P('M17 30.5 L24 37 L31 30.5') + P('M24 37 V48')) +
    face(SKIN.a) + P('M13.6 15 Q13 5.5 24 5 Q35 5.5 34.4 15 Q31 9.5 25 10.5 Q21 12 16 11.5 Q14.5 13 13.6 15 Z', '#5B4636'),
  // long hair, round neck top
  'you-b-long-hair': P('M12 18 Q10 32 14 36 H34 Q38 32 36 18 Z', '#3E3029') +
    body('#FAD9B0', P('M19 31 Q24 35 29 31')) + face(SKIN.b) +
    P('M13.4 17 Q13 5 24 5 Q35 5 34.6 17 Q30 13 26 8.6 Q21 13 13.4 17 Z', '#3E3029'),
  // head scarf (hijab)
  'you-c-scarf': body('#CFE1F7') +
    P('M11.5 17 Q11.5 3.5 24 3.5 Q36.5 3.5 36.5 17 Q37 29 31 32.5 Q24 36 17 32.5 Q11 29 11.5 17 Z', '#9FCBB0') +
    P('M24 16 m-9 0 a9 9.6 0 1 0 18 0 a9 9.6 0 1 0 -18 0', SKIN.b) +
    DOT(20.4, 16.6) + DOT(27.6, 16.6) + P('M18.8 13.4 Q20.4 12.6 22 13.4 M26 13.4 Q27.6 12.6 29.2 13.4') +
    `<circle cx="18.2" cy="20" r="1.5" fill="#F4B7A6"/><circle cx="29.8" cy="20" r="1.5" fill="#F4B7A6"/>` +
    P('M21.4 20.6 Q24 22.8 26.6 20.6') + P('M17 32.5 Q22 38 29 40'),
  // curly hair, glasses
  'you-d-curly-glasses': body('#F8D978', P('M18 31 L18 48 M30 31 L30 48')) + face(SKIN.c, { glasses: true }) +
    P('M13.4 15 Q11 11 14 8.6 Q14.5 4.5 18.6 5 Q21 2.4 24 3.8 Q27 2.4 29.4 5 Q33.5 4.5 34 8.6 Q37 11 34.6 15 Q33 11.5 30 11.6 Q27 13 24 11.6 Q21 13 18 11.6 Q15 11.5 13.4 15 Z', '#2E2622'),
  // student: bob hair + backpack straps
  'you-e-student': body('#C9DCEF', P('M14 31.5 Q13 40 15 48 M34 31.5 Q35 40 33 48', 'none') +
    P('M12.5 32.5 L16.5 31 L18 48 H13 Z M35.5 32.5 L31.5 31 L30 48 H35 Z', '#F2A65A')) +
    face(SKIN.d) + P('M12.6 21 Q11 6 24 5 Q37 6 35.4 21 Q34.4 15 33 12.6 Q26 13 20 10 Q16 13 15 15.4 Q14 18 12.6 21 Z', '#1F1A17'),
  // older person: grey hair, beard
  'you-f-elder-beard': body('#E5D7F0', P('M17 30.5 L24 37 L31 30.5')) + face(SKIN.b, { brows: false, blush: false, glasses: true }) +
    P('M14 22 Q15 30 24 30.5 Q33 30 34 22 Q31 25 28 24 Q24 26.4 20 24 Q17 25 14 22 Z', '#D9D4CC') +
    P('M13.6 15 Q14 7 19 6.4 M34.4 15 Q34 7 29 6.4', 'none') + P('M18.2 13.2 H21.6 M26.4 13.2 H29.8'),
};
for (const [n, s] of Object.entries(people)) out(ILL, n + '.svg', svg(s));

/* ---------- plane ---------- */
const planeTop = 'M24 3 C26.6 3 27.2 6 27.2 9 V19 L44 29.4 V33.4 L27.2 28.4 V37 L32.4 41 V44.4 L24 42.2 L15.6 44.4 V41 L20.8 37 V28.4 L4 33.4 V29.4 L20.8 19 V9 C20.8 6 21.4 3 24 3 Z';
out(ILL, 'plane-a-top.svg', svg(`<g transform="rotate(45 24 24)">${P(planeTop, '#CFE1F7')}${P('M22.4 9.6 Q24 8.6 25.6 9.6')}</g>`));
out(ILL, 'plane-b-side.svg', svg(
  P('M10 14 L14.4 14 L20 22.4 H10 Z', '#A9C8EC') +                                  // tail fin
  P('M6.4 22.4 H37 Q46 22.4 46 27 Q46 31.6 37 31.6 H10.6 Q6.4 31.6 5.4 27 Z', '#CFE1F7') + // body
  P('M38.6 23.6 Q42.6 24 43.8 26.6 H38.6 Z', '#FFFFFF') +                            // cockpit
  P('M20 28.4 L15.6 39 H20.4 L29.6 28.4 Z', '#A9C8EC') +                             // wing
  DOT(17, 26) + DOT(21.4, 26) + DOT(25.8, 26) + DOT(30.2, 26) + DOT(34.6, 26)));
out(ILL, 'plane-c-takeoff.svg', svg(
  P('M4 44 Q14 42 22 34', 'none', ' stroke-dasharray="0.1 5"') +
  `<g transform="translate(9 -7) rotate(45 24 24) scale(0.78) translate(6.8 6.8)">${P(planeTop, '#CFE1F7')}</g>` + P('M4 46 H44')));

/* ---------- homemove: houses apart, solid arrow head ---------- */
const house = (x, y, w, fill, door = true) => {
  const h = w * 0.8, rx = x + w / 2;
  return P(`M${x} ${y} L${rx} ${y - w * 0.55} L${x + w} ${y} V${y + h} H${x} Z`, fill) +
    (door ? P(`M${rx - w * 0.14} ${y + h} V${y + h * 0.5} H${rx + w * 0.14} V${y + h}`, '#FFFFFF') : '');
};
const head = (x, y, ang) => { // filled triangle arrow head pointing at angle (deg)
  const a = ang * Math.PI / 180, L = 6, W = 4;
  const bx = x - L * Math.cos(a), by = y - L * Math.sin(a);
  const px = -Math.sin(a) * W, py = Math.cos(a) * W;
  const f = v => v.toFixed(2);
  return P(`M${f(x)} ${f(y)} L${f(bx + px)} ${f(by + py)} L${f(bx - px)} ${f(by - py)} Z`, INK);
};
out(ILL, 'homemove-a-straight.svg', svg(
  house(2, 27, 14, '#FAD9B0') + house(32, 27, 14, '#FAD9B0') + P('M2 38.2 H46', 'none') +
  P('M18 31 H27') + head(30, 31, 0)));
out(ILL, 'homemove-b-arc.svg', svg(
  house(2, 30, 13, '#FFFFFF') + house(33, 30, 13, '#FAD9B0') +
  P('M8.5 17 Q24 2 37 15', 'none', ' stroke-dasharray="0.1 4.6"') + head(39.5, 18.4, 50)));
out(ILL, 'homemove-c-box.svg', svg(
  house(1, 24, 15, '#FFFFFF') + house(32, 24, 15, '#FAD9B0') +
  P('M18.6 33 H29.4 V43 H18.6 Z M18.6 36 H29.4', '#E8C39E') +
  P('M19 22 H26') + head(29.4, 22, 0)));

/* ---------- bank: grander, clearly not the ward office ---------- */
const coin = (cx, cy, r) => C(cx, cy, r, '#F2C14E') + C(cx, cy, r - 2.2, 'none');
const cols = (xs, y1, y2) => xs.map(x =>
  P(`M${x - 1.8} ${y1} H${x + 1.8} V${y2} H${x - 1.8} Z`, '#FFF6DA')).join('');
out(ILL, 'bank-a-columns.svg', svg(
  P('M3 46 H45 V42.4 H3 Z', '#E8D7A8') + P('M6 42.4 H42 V39.6 H6 Z', '#F2E3B6') +   // steps
  P('M7 39.6 V22 H41 V39.6', '#F8D978') +
  cols([11.5, 19.8, 28.2, 36.5], 22.4, 39.2) +
  P('M5 22 H43 V18.4 H5 Z', '#F2C14E') +                                           // frieze
  P('M4 18.4 L24 5 L44 18.4 Z', '#FBE7A1') + coin(24, 13, 3.8)));
out(ILL, 'bank-b-dome.svg', svg(
  P('M3 46 H45 V42.4 H3 Z', '#E8D7A8') +
  P('M6 42.4 V24 H42 V42.4 Z', '#F8D978') +
  cols([12, 20, 28, 36], 25.4, 42) +
  P('M4.4 24 H43.6 V20.4 H4.4 Z', '#F2C14E') +
  P('M13 20.4 Q13 8 24 8 Q35 8 35 20.4 Z', '#FBE7A1') + P('M24 8 V3.4') + coin(24, 15, 3.4)));
out(ILL, 'bank-c-vault.svg', svg(
  P('M3 46 H45 V42.4 H3 Z', '#E8D7A8') +
  P('M6 42.4 V20 H42 V42.4 Z', '#F8D978') +
  cols([10.4, 37.6], 21.4, 42) +
  P('M16 42.4 V30 Q16 24.6 24 24.6 Q32 24.6 32 30 V42.4 Z', '#FFF6DA') +           // arched door
  P('M24 25 V42.4') +
  P('M4.4 20 H43.6 V16.6 H4.4 Z', '#F2C14E') +
  P('M4 16.6 L24 4.6 L44 16.6 Z', '#FBE7A1') + coin(24, 11.4, 3.4)));

/* ---------- logos ---------- */
const FONT = `font-family="'Zen Maru Gothic','M PLUS Rounded 1c','Hiragino Maru Gothic ProN',system-ui,sans-serif"`;
const word = (x, y, size, fill = INK, w = 700) => `<text x="${x}" y="${y}" ${FONT} font-size="${size}" font-weight="${w}" fill="${fill}">Kurashi</text>`;
const lsvg = (vb, w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>\n`;

// 1: house with a check inside
const markHouse = (fill = '#FAD9B0') => P('M6 24 L24 9 L42 24 V42 H6 Z', fill) + P('M15.4 29 L21.4 35 L33 23.4', 'none', ' stroke-width="3.6"');
// 2: card stack (procedure cards) + check badge
const markCards = () => P('M10 12 H34 Q37 12 37 15 V38 Q37 41 34 41 H10 Q7 41 7 38 V15 Q7 12 10 12 Z', '#CFE1F7') +
  P('M13 20 H30 M13 26.4 H26 M13 32.8 H22') + C(36, 36, 7.4, '#9FCBB0') + P('M32.4 36 L35 38.6 L39.6 33.6', 'none', ' stroke-width="2.8"');
// 3: "K" drawn as a house roof + path of steps
const markK = () => P('M6 6 H42 Q46 6 46 10 V38 Q46 42 42 42 H6 Q2 42 2 38 V10 Q2 6 6 6 Z', '#F8D978') +
  P('M14 14 V34 M14 25 L30 14 M19.6 21.4 L31 34', 'none', ' stroke-width="4"') + `<circle cx="36" cy="34" r="2.6" fill="${INK}"/>`;
// 4: speech bubble with a house (asking / noticing)
const markBubble = () => P('M24 4 C36 4 44 11 44 21 C44 31 36 37 25 37 L15 44 L16.4 35.6 C9 33 4 27.6 4 21 C4 11 12 4 24 4 Z', '#C9DCEF') +
  P('M15 23 L24 15.6 L33 23 V31 H15 Z', '#FFFFFF') + P('M22 31 V26 H26 V31');
// 5: map-pin with house inside (Nagoya life)
const markPin = () => P('M24 3 C33.4 3 40 9.6 40 18.6 C40 30 24 45 24 45 C24 45 8 30 8 18.6 C8 9.6 14.6 3 24 3 Z', '#F2A65A') +
  P('M16.6 21 L24 14.4 L31.4 21 V28 H16.6 Z', '#FFFFFF');

const logos = {
  'logo-1-house-check': markHouse,
  'logo-2-cards': markCards,
  'logo-3-k-mark': markK,
  'logo-4-bubble': markBubble,
  'logo-5-pin': markPin,
};
for (const [n, m] of Object.entries(logos)) {
  out(LOGO, n + '-mark.svg', lsvg('-2 -2 52 52', 104, 104, m()));
  out(LOGO, n + '-wordmark.svg', lsvg('-2 -2 200 52', 400, 104, `<g>${m()}</g>` + word(56, 35, 30)));
}
// 6: pure wordmark — i-dot is a small house
out(LOGO, 'logo-6-wordmark-only.svg', lsvg('0 0 200 60', 400, 120,
  `<text x="6" y="46" ${FONT} font-size="40" font-weight="700" fill="${INK}">Kurash</text>` +
  `<path d="M163 25 V46" stroke="${INK}" stroke-width="7" fill="none"/>` +
  P('M157 13 L163 7.4 L169 13 V19 H157 Z', '#F2A65A')));
console.log('ok');
