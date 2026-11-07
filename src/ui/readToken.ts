/* 写真の読み取りのテストのトークン（SPEC v0.5.23。作者だけ）。
   作者が /review で入れた値を、そのタブの sessionStorage にだけ残す（URL・IndexedDB・ソースに入れない。タブを閉じると消える）。
   値そのものはサーバー（Worker のシークレット）と照らし合わせるだけで、画面には出さない。 */
const KEY = 'kurashi:read_token';
export const READ_TOKEN_HEADER = 'x-kurashi-read-token';

export function getReadToken(): string | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(KEY) || null; } catch { return null; }
}
export function setReadToken(v: string | null): void {
  try { if (v) sessionStorage.setItem(KEY, v); else sessionStorage.removeItem(KEY); } catch { /* 使えないときは何もしない */ }
}
