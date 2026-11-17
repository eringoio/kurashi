/* 作者用：報告の受信箱（A-9。2026-11-14 に直した）。トークンを入れて読む。トークンは保存しない（この画面の中だけ）。
   新しい順に1ページずつ（続きはヘッダーで送る。URL にクエリ文字列を使わない）。種類・状態・その画面へのリンク。状態は作者が変える。 */
import { useState } from 'react';
import { REPORT_STATUSES, type ReportStatus } from '../core/reportKinds';
import { Bi, One } from '../i18n/Ruby';
import type { UiKey } from '../i18n/text';
import { Link } from '../ui/router';

type R = { id: string; path: string; scene: string | null; text: string; level: string; at: string; received_at: string; kind?: string; card?: string; build?: string; status: ReportStatus; steps?: { card_id: string; status: string; stage: string }[] };

export function ReviewReports() {
  const [token, setToken] = useState('');
  const [list, setList] = useState<R[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReportStatus | 'all'>('all');
  const [err, setErr] = useState('');
  const load = async (cursor: string | null) => {
    setErr('');
    try {
      const r = await fetch('/api/reports', { headers: { authorization: 'Bearer ' + token, ...(cursor ? { 'x-reports-cursor': cursor } : {}) } });
      if (!r.ok) { setErr(String(r.status)); if (!cursor) setList(null); return; }
      const b = (await r.json()) as { reports: R[]; next: string | null };
      setList((old) => (cursor && old ? [...old, ...b.reports] : b.reports));
      setNext(b.next);
    } catch { setErr('network'); }
  };
  const mark = async (id: string, status: ReportStatus) => {
    setErr('');
    try {
      const r = await fetch('/api/reports', { method: 'PATCH', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) });
      if (!r.ok) { setErr(String(r.status)); return; }
      setList((old) => old?.map((x) => (x.id === id ? { ...x, status } : x)) ?? null);
    } catch { setErr('network'); }
  };
  const shown = list?.filter((x) => filter === 'all' || x.status === filter) ?? [];
  return (
    <section className="group" aria-labelledby="review-reports">
      <h2 id="review-reports"><One phrase k="review.reports" /></h2>
      <p className="sub"><Bi k="review.reportsNote" /></p>
      <label className="qrfield">
        <span className="label"><One k="review.reportsToken" /></span>
        <input className="field" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
      </label>
      <button type="button" className="k-answer" disabled={!token} onClick={() => void load(null)}><Bi phrase k="review.reportsLoad" /></button>
      {err && <p role="alert"><One k="review.reportsError" />（{err}）</p>}
      {list && (
        <>
          <p role="status"><One k="review.reportsNew" />{list.filter((x) => x.status === 'new').length}{next ? '+' : ''}</p>
          <fieldset className="group">
            <legend><One k="review.reportsFilter" /></legend>
            <div className="chips">
              {(['all', ...REPORT_STATUSES] as const).map((s) => (
                <button key={s} type="button" className="seg" aria-pressed={filter === s} onClick={() => setFilter(s)}><One k={(s === 'all' ? 'review.reportsAll' : 'review.reportsStatus.' + s) as UiKey} /></button>
              ))}
            </div>
          </fieldset>
          {shown.length === 0 ? <p><One k="review.reportsNone" /></p> : (
            <ul className="list" role="list">
              {shown.map((x) => (
                <li key={x.id} className="report__item">
                  <span className="sub" lang="en">{x.received_at}・{x.level}{x.build ? '・' + x.build : ''}</span>
                  <p>
                    {x.kind && <><span className="k-state k-state--now"><One k={('report.kind.' + x.kind) as UiKey} /></span>　</>}
                    <Link to={x.path} className="link"><span lang="en">{x.path}</span><span className="sr-only"> <One k="review.reportsOpen" /></span></Link>{x.scene ? '・' + x.scene : ''}
                  </p>
                  {x.text && <p>{x.text}</p>}
                  {/* 手続きと段階（B-5） */}
                  {x.steps && x.steps.length > 0 && <p className="sub" lang="en"><One k="review.reportsSteps" />：{x.steps.map((s) => s.card_id + '（' + s.status + '・' + s.stage + '）').join('、')}</p>}
                  <div className="chips" role="group" aria-label={x.id}>
                    {REPORT_STATUSES.map((s) => (
                      <button key={s} type="button" className="seg" aria-pressed={x.status === s} onClick={() => void mark(x.id, s)}><One k={('review.reportsStatus.' + s) as UiKey} /></button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {next && <button type="button" className="k-answer" onClick={() => void load(next)}><Bi phrase k="review.reportsMore" /></button>}
        </>
      )}
    </section>
  );
}
