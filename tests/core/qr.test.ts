/* QR に入れるのはアプリの中のパスだけ（9.8・13.4） */
import { describe, expect, it } from 'vitest';
import { qrFileName, qrUrl, validQrPath } from '../../src/core/qr';

describe('QR のパス', () => {
  it('アプリの中のパスだけを受ける', () => {
    for (const p of ['/s/ward-office', '/c/bank-account-open', '/move', '/']) expect(validQrPath(p), p).toBe(true);
    for (const p of ['/move?x=1', '/move#a', 'https://example.com/', 'move', '//evil.example', '/a b']) expect(validQrPath(p), p).toBe(false);
  });
  it('URL は https の起点＋パス', () => {
    expect(qrUrl('/s/move')).toBe('https://kurashi.eringo.io/s/move');
    expect(() => qrUrl('/s/move', 'http://localhost')).toThrow();
    expect(() => qrUrl('/s/move?x')).toThrow();
  });
  it('ファイル名', () => {
    expect(qrFileName('/s/ward-office')).toBe('ward-office');
    expect(qrFileName('/c/bank-account-open')).toBe('c-bank-account-open');
  });
});
