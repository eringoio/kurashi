/* 公開の Worker の入口（wrangler.toml の main）。/api/read-document と /api/report・/api/reports（A-9）をコードで扱い、ほかは静的なファイル（dist/）。
   保存しない・ログに中身を書かない（SPEC 13.3）。 */
import { handleReadDocument, type Env as ReadEnv } from './readDocument';
import { handleReport, handleReports, type Env as ReportEnv } from './report';
import { handleEv, handleUsage, type Env as EvEnv } from './ev';

interface Env extends ReadEnv, ReportEnv, EvEnv { ASSETS: { fetch(req: Request): Promise<Response> } }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/read-document') return handleReadDocument(req, env);
    // 報告（A-9）。本文は path・scene・text・level・at だけ
    // 本番で KV が未設定なら必ず失敗させる。メモリに保存して成功表示しない。
    if (url.pathname === '/api/report' || url.pathname === '/api/reports') {
      if (!env.REPORTS) return new Response(JSON.stringify({ error: 'storage_unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
      return url.pathname === '/api/report' ? handleReport(req, env) : handleReports(req, env);
    }
    // 使われ方の数（13.4）。数だけ。ID・IP・答えは受け取らない
    if (url.pathname === '/api/ev') return handleEv(req, env);
    if (url.pathname === '/api/usage') return handleUsage(req, env);
    if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return env.ASSETS.fetch(req);
  },
};
