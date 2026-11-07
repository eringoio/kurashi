/* 使われ方の数（SPEC 13.4。作者の指示 2026-11-07）。自分のサーバー（/api/ev）にだけ、数として送る。
   ID・クッキー・IP・答え・日付は送らない。道は id だけ（答えは道に入らない。13.4）。
   送らないとき：設定で「送らない」／ブラウザの Global Privacy Control・Do Not Track／見るだけ／テスト（vitest）・開発のサーバー（npm run dev）。 */

export type EvKind = 'view' | 'error' | 'outcome' | 'helpful';
export interface EvFields { p?: string; f?: string; x?: string; y?: string }

/** 送ってよいか（App が設定と保存の状態から決める） */
let allowed: () => boolean = () => false;
let levelOf: () => string = () => '';
export function initTelemetry(o: { allowed: () => boolean; level: () => string }) { allowed = o.allowed; levelOf = o.level; }

/** ブラウザが「追跡しない」を求めているか */
export function browserOptOut(nav: Partial<Navigator> & { globalPrivacyControl?: boolean } = typeof navigator === 'undefined' ? {} : navigator): boolean {
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

/** 道を、送ってよい形にする：英小文字・数字・/・- だけ、80字まで。形が違えば「/?」 */
export function routeOf(path: string): string {
  const p = path.split(/[?#]/)[0].toLowerCase();
  return /^\/[a-z0-9/_-]{0,80}$/.test(p) ? p : '/?';
}

const width = () => (typeof innerWidth !== 'number' ? '' : innerWidth < 640 ? 's' : innerWidth < 1024 ? 'm' : 'l');
const BUILD = (import.meta.env?.VITE_BUILD as string | undefined) ?? 'dev';

/** 送る先（テストで差しかえる） */
export let send = (body: string) => {
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon?.('/api/ev', new Blob([body], { type: 'application/json' }))) return;
    void fetch('/api/ev', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
  } catch { /* 送れなくても何もしない */ }
};
export function setSender(f: (body: string) => void) { send = f; }

/** 開発のサーバー・テストでは送らない（手元で試すときは VITE_EV=1） */
const ON = import.meta.env?.PROD === true || import.meta.env?.VITE_EV === '1';

export function track(k: EvKind, fields: EvFields = {}, force = false) {
  if (!(ON || force) || browserOptOut() || !allowed()) return;
  send(JSON.stringify({ k, p: fields.p ?? routeOf(location.pathname), f: fields.f, l: levelOf(), w: width(), b: BUILD, x: fields.x, y: fields.y }));
}

/** 前の画面（いまの道の1つ前）。画面が変わるたびに view を1つ */
let last = '';
export function trackView(path: string) {
  const p = routeOf(path);
  if (p === last) return;
  track('view', { p, f: last || undefined });
  last = p;
}

/** エラー：種類（x）と文（y。Worker で数字を消す）。同じものは1回の起動で5回まで */
const seen = new Map<string, number>();
export function trackError(kind: string, message: string) {
  const key = kind + message;
  const n = seen.get(key) ?? 0;
  if (n >= 5) return;
  seen.set(key, n + 1);
  track('error', { x: kind.replace(/[^a-z0-9_.:-]/gi, '').slice(0, 40), y: message.slice(0, 300) });
}

/** window のエラーを拾う（main.tsx で1回） */
export function listenErrors() {
  addEventListener('error', (e) => trackError('window', String(e.message ?? '')));
  addEventListener('unhandledrejection', (e) => trackError('promise', String((e.reason as Error)?.message ?? e.reason ?? '')));
}
