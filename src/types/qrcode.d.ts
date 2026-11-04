/* qrcode（QR を作る。SPEC 9.8）の使う分だけの型。@types は足さない（足してよい依存は LOOP_PLAN 3章だけ） */
declare module 'qrcode' {
  interface Options { type?: 'svg' | 'utf8' | 'terminal'; errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'; margin?: number }
  const QRCode: { toString(text: string, opts?: Options): Promise<string> };
  export default QRCode;
}
