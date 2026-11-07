import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/** 使われ方の数・エラーに付けるビルドの印（日付と git の短い番号。13.4） */
function buildId(): string {
  let rev = 'local';
  try { rev = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* git が無いとき */ }
  return new Date().toISOString().slice(0, 10) + '.' + rev;
}

/** 手元（npm run dev・テスト）で /api/read-document と /api/report・/api/reports を動かす。公開の Worker と同じ handler を使う。
    手元ではキーを渡さない（いつも見本の結果。本物の読み取りは公開の Worker だけ。SPEC 6A.9） */
function devApi(): Plugin {
  return {
    name: 'kurashi-dev-api',
    configureServer(server) {
      // 報告（A-9）：手元はメモリに置く。一覧のトークンは環境変数 REPORTS_TOKEN（無ければ dev-token。手元だけ）
      for (const p of ['/api/report', '/api/reports', '/api/ev', '/api/usage']) server.middlewares.use(p, async (req, res, next) => {
        if (req.url && req.url !== '/' && req.url !== '') return next();
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const m = await server.ssrLoadModule(p.startsWith('/api/report') ? '/worker/report.ts' : '/worker/ev.ts');
        const r2 = new Request('http://localhost' + p, { method: req.method, headers: { 'content-type': String(req.headers['content-type'] ?? ''), authorization: String(req.headers.authorization ?? '') }, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
        const env = { REPORTS_TOKEN: process.env.REPORTS_TOKEN ?? 'dev-token' };
        const r: Response = p === '/api/report' ? await m.handleReport(r2, env) : p === '/api/reports' ? await m.handleReports(r2, env) : p === '/api/ev' ? await m.handleEv(r2, {}) : await m.handleUsage(r2, env);
        res.statusCode = r.status;
        r.headers.forEach((val, k) => res.setHeader(k, val));
        res.end(await r.text());
      });
      server.middlewares.use('/api/read-document', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const { handleReadDocument } = await server.ssrLoadModule('/worker/readDocument.ts');
        const r: Response = await handleReadDocument(new Request('http://localhost/api/read-document', {
          method: req.method, headers: { 'content-type': String(req.headers['content-type'] ?? '') },
          body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
        }), {});
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await r.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devApi()],
  define: { 'import.meta.env.VITE_BUILD': JSON.stringify(buildId()) },
  // 動画・試作・文書は見張らない（作者が開いているファイルで、見張りが止まることがあったため）
  server: { port: 5173, watch: { ignored: ['**/demo-video/**', '**/design/explorations/**', '**/docs/**', '**/test-results/**', '**/research/**'] } },
  test: { environment: 'node', include: ['tests/core/**/*.test.ts', 'tests/unit/**/*.test.ts'] },
} as never);
