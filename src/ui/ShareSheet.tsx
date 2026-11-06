/* 共有（作者の指示 2026-11-06 A-5）。上の帯の共有のアイコン（文字なし。読み上げの名前は「共有」）から開く。
   いまの場面の入口の URL をコピーするか、QR を見せる。手続きのページなら親の場面（src/core/scene.ts の sharePath）。
   URL に答え・日付・個人の情報は入れない（13.4）。QR は端末の中で作る。 */
import { useState } from 'react';
import { DATA } from '../core/data';
import { qrUrl } from '../core/qr';
import { sharePath } from '../core/scene';
import { Bi, One } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { QrCode } from './QrCode';
import { Sheet } from './Sheet';

export function ShareSheet({ path, onClose, onLive }: { path: string; onClose: () => void; onLive: (s: string) => void }) {
  const { level } = usePrefs();
  const [copied, setCopied] = useState(false);
  const url = qrUrl(sharePath(path, (id) => DATA().cards.find((c) => c.id === id)?.place));
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); onLive(line(ui('share.copied'), level)); } catch { setCopied(false); }
  };
  return (
    <Sheet title={<One k="share.title" />} onClose={onClose}>
      <p className="sub"><Bi k="share.note" /></p>
      <p className="share__url" lang="en">{url}</p>
      <button type="button" className="k-answer k-answer--primary" onClick={() => void copy()}><Bi k={copied ? 'share.copied' : 'share.copy'} /></button>
      <QrCode url={url} label={line(ui('qr.imgLabel'), level) + '：' + url} className="share__qr" />
    </Sheet>
  );
}
