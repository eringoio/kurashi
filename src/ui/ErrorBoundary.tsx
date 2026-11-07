/* 画面が壊れたとき：短い知らせと「開き直す」。エラーの種類だけを数える（13.4。送ってよいときだけ） */
import { Component, type ReactNode } from 'react';
import { Bi } from '../i18n/Ruby';
import { trackError } from './telemetry';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: Error) { trackError('render', e.message); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="col" id="main">
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="error.title" /></h1>
        <p><button type="button" className="k-answer k-answer--primary" onClick={() => location.assign('/')}><Bi phrase k="error.reload" /></button></p>
      </main>
    );
  }
}
