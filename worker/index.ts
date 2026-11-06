/* 公開の Worker の入口（wrangler.toml の main）。/api/read-document と /api/report・/api/reports（A-9）をコードで扱い、ほかは静的なファイル（dist/）。
   保存しない・ログに中身を書かない（SPEC 13.3）。 */
import { handleReadDocument, type Env as ReadEnv } from './readDocument';
import { handleReport, handleReports, type Env as ReportEnv } from './report';

interface Env extends ReadEnv, ReportEnv { ASSETS: { fetch(req: Request): Promise<Response> } }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/read-document') return handleReadDocument(req, env);
    // 報告（A-9）。本文は path・scene・text・level・at だけ
    if (url.pathname === '/api/report') return handleReport(req, env);
    if (url.pathname === '/api/reports') return handleReports(req, env);
    if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return env.ASSETS.fetch(req);
  },
};
