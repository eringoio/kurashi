import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 字体は自分のサーバーから配る（Google などの第三者に接続しない。OFL-1.1）
import '@fontsource/zen-maru-gothic/500.css';
import '@fontsource/zen-maru-gothic/700.css';
import './styles/tokens.css';
import './styles/components.css';
import './styles/app.css';
import { App } from './App';
import { PrefsProvider } from './storage/prefs';
import { Vault } from './storage/vault';

// 古い Safari でも動くように、トップレベルの await を使わない
void Vault.open().then((vault) => {
  // 開発のときだけ、自動の検査から保存の状態を作れるようにする（公開のビルドには入らない）
  if (import.meta.env.DEV) (window as unknown as { __kurashi: unknown }).__kurashi = { vault };
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PrefsProvider vault={vault}>
        <App />
      </PrefsProvider>
    </StrictMode>,
  );
});
