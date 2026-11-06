/* 作者用：報告の一覧（A-9）。トークンを入れて読む。トークンは保存しない（この画面の中だけ） */
import { useState } from 'react';
import { Bi, One } from '../i18n/Ruby';

type R = { id: string; path: string; scene: string | null; text: string; level: string; at: string; received_at: string; steps?: { card_id: string; status: string; stage: string }[] };

export function ReviewReports() {
  const [token, setToken] = useState('');
  const [list, setList] = useState<R[] | null>(null);
  const [err, setErr] = useState('');
  const load = async () => {
    setErr('');
    const r = await fetch('/api/reports', { headers: { authorization: 'Bearer ' + token } });
    if (!r.ok) { setErr(String(r.status)); setList(null); return; }
    setList(((await r.json()) as { reports: R[] }).reports);
  };
  return (
    <section className="group" aria-labelledby="review-reports">
      <h2 id="review-reports"><One k="review.reports" /></h2>
      <p className="sub"><Bi k="review.reportsNote" /></p>
      <label className="qrfield">
        <span className="label"><One k="review.reportsToken" /></span>
        <input className="field" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
      </label>
      <button type="button" className="k-answer" disabled={!token} onClick={() => void load()}><Bi k="review.reportsLoad" /></button>
      {err && <p role="alert"><One k="review.reportsError" />（{err}）</p>}
      {list && (list.length === 0 ? <p><One k="review.reportsNone" /></p> : (
        <ul className="list" role="list">
          {list.map((x) => (
            <li key={x.id} className="report__item">
              <span className="sub" lang="en">{x.received_at}・{x.path}{x.scene ? '・' + x.scene : ''}・{x.level}</span>
              <p>{x.text}</p>
              {/* 手続きと段階（B-5） */}
              {x.steps && x.steps.length > 0 && <p className="sub" lang="en"><One k="review.reportsSteps" />：{x.steps.map((s) => s.card_id + '（' + s.status + '・' + s.stage + '）').join('、')}</p>}
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
