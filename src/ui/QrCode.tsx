/* QR の画像（SVG）。端末の中で作り、外に送らない（qrcode）。QR を作る画面（/qr）と共有のシートで使う */
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function useQrSvg(url: string): string {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!url) { setSvg(''); return; }
    let live = true;
    void QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 4 }).then((s) => { if (live) setSvg(s); });
    return () => { live = false; };
  }, [url]);
  return svg;
}

/** label：読み上げの名前（「QR コード：URL」など） */
export function QrCode({ url, label, className = 'qrcard__img' }: { url: string; label: string; className?: string }) {
  const svg = useQrSvg(url);
  if (!svg) return null;
  return <div className={className} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
