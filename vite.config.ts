import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 動画・試作・文書は見張らない（作者が開いているファイルで、見張りが止まることがあったため）
  server: { port: 5173, watch: { ignored: ['**/demo-video/**', '**/design/explorations/**', '**/docs/**', '**/test-results/**', '**/research/**'] } },
  test: { environment: 'node', include: ['tests/core/**/*.test.ts', 'tests/unit/**/*.test.ts'] },
} as never);
