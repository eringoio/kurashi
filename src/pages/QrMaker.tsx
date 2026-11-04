/* QR を作る（作者用。SPEC 9.8）：場面か、アプリの中のページを選ぶと、その URL の QR と「kurashi で開く：〇〇」を出す。
   スマホのカメラで QR を読むと、その URL でアプリが開く。QR に入れるのはパスだけ（13.4）。
   画像は端末の中で作る（外に送らない）。印刷用の SVG を保存できる。 */
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { DATA } from '../core/data';
import { qrFileName, qrUrl, validQrPath } from '../core/qr';
import { SCENES } from '../core/scene';
import type { Text } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { line, plain, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { Link, useFocusTitle } from '../ui/router';

/** パスの見出し：場面の見出し／カードの名前／パスそのもの */
function titleOf(path: string): Text | null {
  const s = /^\/s\/([a-z0-9-]+)$/.exec(path);
  if (s) return SCENES().find((x) => x.id === s[1])?.title ?? null;
  const c = /^\/c\/([a-z0-9-]+)$/.exec(path);
  if (c) return DATA().cards.find((x) => x.id === c[1])?.title ?? null;
  return null;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 印刷用の SVG：QR の下に「kurashi で開く：〇〇」と URL */
function labelSvg(qr: string, name: string, url: string): string {
  const inner = qr.replace(/^[\s\S]*?<svg[^>]*viewBox="([^"]+)"[^>]*>/, '<svg x="30" y="20" width="300" height="300" viewBox="$1">');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="360" height="400" viewBox="0 0 360 400" font-family="Zen Maru Gothic, Hiragino Sans, Meiryo, sans-serif">`
    + `<rect width="360" height="400" fill="#fff"/>${inner}`
    + `<text x="180" y="350" text-anchor="middle" font-size="16" font-weight="700">${esc('kurashi で開く：' + name)}</text>`
    + `<text x="180" y="374" text-anchor="middle" font-size="11" fill="#333">${esc(url)}</text></svg>\n`;
}

export function QrMaker() {
  const { level } = usePrefs();
  useFocusTitle('qr');
  const [path, setPath] = useState('/s/' + (SCENES()[0]?.id ?? ''));
  const [svg, setSvg] = useState('');
  const ok = validQrPath(path);
  const url = ok ? qrUrl(path) : '';
  const t = ok ? titleOf(path) : null;
  const name = t ? plain(t.ja) : path;
  useEffect(() => {
    if (!ok) { setSvg(''); return; }
    let live = true;
    void QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }).then((s) => { if (live) setSvg(s); });
    return () => { live = false; };
  }, [url, ok]);
  const label = svg ? labelSvg(svg, name, url) : '';

  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="qr.title" /></h1></div>
      <p className="sub"><Bi k="qr.sub" /></p>
      <fieldset>
        <legend className="label"><One k="qr.scenes" /></legend>
        <div className="chips">
          {SCENES().map((s) => (
            <button key={s.id} type="button" className="seg" aria-pressed={path === '/s/' + s.id} onClick={() => setPath('/s/' + s.id)}><One t={s.title} /></button>
          ))}
        </div>
      </fieldset>
      <label className="qrfield">
        <span className="label"><One k="qr.path" /></span>
        <input className="field" type="text" value={path} onChange={(e) => setPath(e.target.value.trim())} spellCheck={false} autoCapitalize="off" aria-invalid={!ok} aria-describedby="qr-path-note" lang="en" />
        <span id="qr-path-note" className="sub">{ok ? <One k="qr.pathNote" /> : <span role="alert"><One k="qr.invalid" /></span>}</span>
      </label>
      {ok && svg && (
        <figure className="qrcard">
          <div className="qrcard__img" role="img" aria-label={line(ui('qr.imgLabel'), level) + '：' + url} dangerouslySetInnerHTML={{ __html: svg }} />
          <figcaption>
            <p className="qrcard__name" lang="ja">kurashi で開く：{name}</p>
            <p className="qrcard__url" lang="en">{url}</p>
          </figcaption>
        </figure>
      )}
      {ok && label && (
        <a className="k-answer k-answer--primary" href={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(label)} download={qrFileName(path) + '-label.svg'}><Bi k="qr.download" /></a>
      )}
      <div className="links"><Link to="/review" className="link"><Bi k="qr.back" /></Link></div>
    </>
  );
}
