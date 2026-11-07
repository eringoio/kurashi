/* 作者用：使われ方の数（13.4）。報告と同じトークンで読む。トークンは保存しない（この画面の中だけ） */
import { useState } from 'react';
import { Bi, One } from '../i18n/Ruby';
import type { UiKey } from '../i18n/text';

type U = { views: [string, number][]; pairs: [string, number][]; errors: [string, number][]; helpful: [string, number, number][]; outcomes: [string, number][] };

function Top({ k, rows }: { k: UiKey; rows: (string | number)[][] }) {
  return (
    <details className="group__more">
      <summary><One k={k} />（{rows.length}）</summary>
      <ul className="list" role="list" lang="en">{rows.slice(0, 20).map((r) => <li key={String(r[0])} className="sub">{r.join('　')}</li>)}</ul>
    </details>
  );
}

export function ReviewUsage() {
  const [token, setToken] = useState('');
  const [u, setU] = useState<U | null>(null);
  const [err, setErr] = useState('');
  const load = async () => {
    setErr('');
    const r = await fetch('/api/usage', { headers: { authorization: 'Bearer ' + token } });
    if (!r.ok) { setErr(String(r.status)); setU(null); return; }
    setU((await r.json()) as U);
  };
  return (
    <section className="group" aria-labelledby="review-usage">
      <h2 id="review-usage"><One phrase k="review.usage" /></h2>
      <p className="sub"><Bi k="review.usageNote" /></p>
      <label className="qrfield">
        <span className="label"><One k="review.reportsToken" /></span>
        <input className="field" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
      </label>
      <button type="button" className="k-answer" disabled={!token} onClick={() => void load()}><Bi phrase k="review.reportsLoad" /></button>
      {err && <p role="alert"><One k="review.reportsError" />（{err}）</p>}
      {u && (
        <>
          <Top k="review.usageViews" rows={u.views} />
          <Top k="review.usagePairs" rows={u.pairs} />
          <Top k="review.usageErrors" rows={u.errors} />
          <Top k="review.usageHelpful" rows={u.helpful} />
          <Top k="review.usageOutcomes" rows={u.outcomes} />
        </>
      )}
    </section>
  );
}
