/* 公開の Worker の入口（wrangler.toml の main）。/api/read-document だけをコードで扱い、ほかは静的なファイル（dist/）。
   保存しない・ログに中身を書かない（SPEC 13.3）。 */
import { handleReadDocument, type Env as ReadEnv } from './readDocument';

interface Env extends ReadEnv { ASSETS: { fetch(req: Request): Promise<Response> } }

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/read-document') return handleReadDocument(req, env);
    if (url.pathname.startsWith('/api/')) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    return env.ASSETS.fetch(req);
  },
};
