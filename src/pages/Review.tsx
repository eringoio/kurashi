/* データの確認（作者用。D2・D3）：カード・ルール・関係・持ち物と、その確認状態を並べる。
   「確認済みとして見る」に切り替えると、確認済みデータの fixture（SPEC 18）と同じ扱いで画面を確かめられる。 */
import { DATA } from '../core/data';
import { authorQueue, collectEvidence, type EvidenceAt } from '../core/quotes';
import { AI_CHECK_COUNTS, FIELD_KINDS } from '../core/trust';
import { CLINIC, departmentsFor } from '../core/clinic';
import type { Evidence, Text } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { Link, useFocusTitle } from '../ui/router';
import { ReviewReports } from './ReviewReports';
import { ReviewUsage } from './ReviewUsage';
import { ReviewRead } from './ReviewRead';

function Status({ e }: { e: Evidence }) {
  const d = DATA();
  const product = e.source_ids.every((s) => d.sources.find((x) => x.source_id === s)?.owner_type === 'product');
  return (
    <span className={'k-state k-state--' + (e.status === 'verified' ? 'done' : 'check')}>
      <span aria-hidden="true">{e.status === 'verified' ? '✓' : '！'}</span>
      <One k={('src.status.' + e.status) as UiKey} />
      {product && <>・<One k="src.product" /></>}
    </span>
  );
}
function Item({ id, title, e, children }: { id: string; title?: Text; e: Evidence; children?: React.ReactNode }) {
  const d = DATA();
  return (
    <li className="review__item">
      <code>{id}</code>
      {title && <Bi t={title} />}
      {children}
      <Status e={e} />
      <span className="sheet__sub">{e.checked_at}・{e.source_ids.map((s) => d.sources.find((x) => x.source_id === s)?.title ?? s).join('、')}{e.note ? '・' + e.note : ''}</span>
    </li>
  );
}

export function Review() {
  const { vault: v } = usePrefs();
  useFocusTitle('review');
  const d = DATA();
  const mode = v.get<string>('settings', 'review_mode') === 'verified' ? 'verified' : 'public';
  const expr = (e: unknown): string => (typeof e === 'string' ? e : 'all' in (e as object) ? 'all(' + (e as { all: unknown[] }).all.map(expr).join(', ') + ')' : 'any(' + (e as { any: unknown[] }).any.map(expr).join(', ') + ')');
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="review.title" /></h1></div>
      <p className="sub"><Bi k="review.sub" /></p>
      {/* 報告の一覧（A-9）。作者のトークンで読む */}
      <ReviewReports />
      <ReviewUsage />
      <ReviewRead />
      {/* 本番では見本（確認済み）の切り替えを出さない（DATA_CONTRACT 5章） */}
      {!import.meta.env.PROD && <fieldset>
        <legend className="label"><One k="review.mode" /></legend>
        <div className="chips">
          <button type="button" className="seg" aria-pressed={mode === 'public'} onClick={() => void v.put('settings', 'review_mode', 'public')}><One k="review.public" /></button>
          <button type="button" className="seg" aria-pressed={mode === 'verified'} onClick={() => void v.put('settings', 'review_mode', 'verified')}><One k="review.verified" /></button>
        </div>
      </fieldset>}
      <AuthorQueue />
      <ClinicReview />
      <section className="group"><h2><Bi phrase k="review.cards" />（{d.cards.length}）</h2>
        <ul className="list review" role="list">
          {d.flow.card_order.map((id) => d.cards.find((c) => c.id === id)!).map((c) => (
            <Item key={c.id} id={c.id} title={c.title} e={c.evidence}><code className="review__expr">{expr(c.eligibility)}{c.coverage_rule_ids.length ? ' ／ coverage: ' + c.coverage_rule_ids.join(', ') : ''}</code></Item>
          ))}
        </ul>
      </section>
      <section className="group"><h2><Bi phrase k="review.rules" />（{d.rules.size}）</h2>
        <ul className="list review" role="list">{[...d.rules.values()].map((r) => <Item key={r.id} id={r.id + '（' + r.kind + '）'} title={r.statement} e={r.evidence} />)}</ul>
      </section>
      <section className="group"><h2><Bi phrase k="review.relations" />（{d.relations.length}）</h2>
        <ul className="list review" role="list">{d.relations.map((r) => <Item key={r.id} id={r.id + '（' + r.type + '）'} title={r.explain} e={r.evidence} />)}</ul>
      </section>
      <section className="group"><h2><Bi phrase k="review.objects" />（{d.objects.length}）</h2>
        <ul className="list review" role="list">{d.objects.map((o) => <Item key={o.id} id={o.id} title={o.title} e={o.evidence}><span className="sub"><One t={o.purpose} /></span></Item>)}</ul>
      </section>
      <div className="links"><Link to="/qr" className="link"><Bi k="qr.title" /></Link><Link to="/" className="link"><Bi k="nav.home" /></Link></div>
    </>
  );
}

/** 作者が確認する一覧（v0.4.9 の4）と、AI 照合を確認済みと同じに扱う欄の表 */
function AuthorQueue() {
  const q = authorQueue(collectEvidence(DATA()));
  const list = (xs: EvidenceAt[]) => xs.length === 0
    ? <p className="sub"><One k="review.none" /></p>
    : <ul className="list review" role="list">{xs.map((x) => <Item key={x.where} id={x.where + '（' + x.kind + '）'} e={x.e} />)}</ul>;
  return (
    <section className="group">
      <h2><Bi phrase k="review.queue" /></h2>
      <p className="sub"><Bi k="review.queueSub" /></p>
      <h3 className="label"><One k="review.staysU" /></h3>
      {list(q.stays_u)}
      <h3 className="label"><One k="review.disagree" /></h3>
      {list(q.disagree)}
      <table className="review__table">
        <caption className="label"><One k="review.table" /></caption>
        <tbody>
          {FIELD_KINDS.map((k) => (
            <tr key={k}><th scope="row"><One k={('review.kind.' + k) as UiKey} /></th><td><span aria-hidden="true">{AI_CHECK_COUNTS[k] ? '✓ ' : '！ '}</span><One k={AI_CHECK_COUNTS[k] ? 'review.counts' : 'review.staysUShort'} /></td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** 病院の案内（6A.13）：場所ごとの診療科の順番と確認状態（作者が確かめる） */
function ClinicReview() {
  const d = CLINIC();
  return (
    <section className="group">
      <h2><Bi phrase k="clinic.review" />（{d.parts.length}）</h2>
      <ul className="list review" role="list">
        {d.parts.map((p) => (
          <Item key={p.id} id={p.id} title={p.name} e={p.evidence}>
            <span className="sub">{departmentsFor(d, p).map((x, i) => (i + 1) + '. ' + x.name.ja.replace(/\{([^|]+)\|[^}]+\}/g, '$1')).join('　')}{p.note ? '・' + p.note : ''}</span>
          </Item>
        ))}
      </ul>
    </section>
  );
}
