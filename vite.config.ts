import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** 使われ方の数・エラーに付けるビルドの印（日付と git の短い番号。13.4） */
function buildId(): string {
  // 公開用に書き出した木には release.json がある（scripts/release/export-public.mjs）。その版の印をそのまま使う
  try { const id = JSON.parse(readFileSync('release.json', 'utf8')).release_id; if (typeof id === 'string' && id) return id; } catch { /* 開発用の木には無い */ }
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
      // 起動のときに worker/*.ts を先に読む。最初の ssrLoadModule は変換に4〜6秒かかり、機械が忙しいと e2e が「送っています」のまま
      // 5秒で落ちた（11/16。letter・report）。ごみの収集日の表（1.8MB の JSON。遅れて読む）も最初の変換が遅く、町名の欄が5秒で出なかった（gomi-town。D-5）。
      // /__dev/ready は両方を読み終わってから 200（playwright.config.ts の webServer はこれを待つ）。手元のサーバーだけ
      const WORKER_MODULES = ['/worker/report.ts', '/worker/ev.ts', '/worker/readDocument.ts'];
      const CLIENT_FILES = ['/data/gomi/schedule.json', '/data/gomi/banchi-names.json'];
      let warmed: Promise<void> | null = null;
      const warm = () => (warmed ??= Promise.all([...WORKER_MODULES.map((m) => server.ssrLoadModule(m)), ...CLIENT_FILES.map((f) => server.transformRequest(f))]).then(
        () => undefined,
        (e) => { server.config.logger.error('kurashi-dev-api: worker の読み込みに失敗 ' + String(e)); },
      ));
      server.httpServer?.once('listening', () => { void warm(); });
      server.middlewares.use('/__dev/ready', (_req, res) => { void warm().then(() => { res.statusCode = 200; res.setHeader('cache-control', 'no-store'); res.end('ok'); }); });
      // 報告（A-9）：手元はメモリに置く。一覧のトークンは環境変数 REPORTS_TOKEN（無ければ dev-token。手元だけ）
      for (const p of ['/api/report', '/api/reports', '/api/ev', '/api/usage']) server.middlewares.use(p, async (req, res, next) => {
        if (req.url && req.url !== '/' && req.url !== '') return next();
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const m = await server.ssrLoadModule(p.startsWith('/api/report') ? '/worker/report.ts' : '/worker/ev.ts');
        // 守り（Origin・Sec-Fetch-Site）と一覧の続き（x-reports-*）も本番と同じに渡す。出所は、ブラウザが開いている出所（Host）にそろえる
        const headers: Record<string, string> = { 'content-type': String(req.headers['content-type'] ?? ''), authorization: String(req.headers.authorization ?? '') };
        for (const h of ['origin', 'sec-fetch-site', 'x-reports-cursor', 'x-reports-limit']) if (req.headers[h]) headers[h] = String(req.headers[h]);
        const r2 = new Request('http://' + (req.headers.host ?? 'localhost') + p, { method: req.method, headers, body: req.method === 'POST' || req.method === 'PATCH' ? Buffer.concat(chunks) : undefined });
        const env = { REPORTS_TOKEN: process.env.REPORTS_TOKEN ?? 'dev-token', ADMIN_AUTH: 'token' }; // 手元だけトークンの1つ（本番は Access の JWT も要る。worker/admin.ts）
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
