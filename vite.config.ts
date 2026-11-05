import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** 手元（npm run dev・テスト）で /api/read-document を動かす。公開の Worker と同じ handler を使う。
    手元ではキーを渡さない（いつも見本の結果。本物の読み取りは公開の Worker だけ。SPEC 6A.9） */
function devApi(): Plugin {
  return {
    name: 'kurashi-dev-api',
    configureServer(server) {
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
  // 動画・試作・文書は見張らない（作者が開いているファイルで、見張りが止まることがあったため）
  server: { port: 5173, watch: { ignored: ['**/demo-video/**', '**/design/explorations/**', '**/docs/**', '**/test-results/**', '**/research/**'] } },
  test: { environment: 'node', include: ['tests/core/**/*.test.ts', 'tests/unit/**/*.test.ts'] },
} as never);
