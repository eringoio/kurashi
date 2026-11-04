/* QR を作る（SPEC 9.8）：QR に入れるのは、アプリの中のパスだけ。答え・日付・個人の情報・クエリ文字列は入れない（13.4）。
   画面（/qr）と scripts/make-qr.mjs で同じ決まりを使う。 */
export const QR_BASE = 'https://kurashi.eringo.io';

/** QR にしてよいパスか（/ から始まる英小文字・数字・ハイフン・下線・スラッシュだけ。? # :// は不可） */
export function validQrPath(path: string): boolean {
  return /^\/[a-z0-9/_-]*$/i.test(path) && !path.includes('//');
}

export function qrUrl(path: string, base = QR_BASE): string {
  if (!validQrPath(path)) throw new Error('QR にできないパス：' + path);
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base)) throw new Error('https の起点だけ：' + base);
  return base + path;
}

/** ファイル名（/c/bank-account-open → c-bank-account-open、/s/ward-office → ward-office） */
export function qrFileName(path: string): string {
  const s = /^\/s\/([a-z0-9-]+)$/.exec(path);
  if (s) return s[1];
  return path.replace(/^\//, '').replace(/\//g, '-') || 'home';
}
