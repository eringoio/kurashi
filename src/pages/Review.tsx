/* データの確認（作者用。D2・D3）：カード・ルール・関係・持ち物と、その確認状態を並べる。
   「確認済みとして見る」に切り替えると、確認済みデータの fixture（SPEC 18）と同じ扱いで画面を確かめられる。 */
import { DATA } from '../core/data';
import type { Evidence, Text } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { Link, useFocusTitle } from '../ui/router';

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
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="review.title" /></h1></div>
      <p className="sub"><Bi k="review.sub" /></p>
      {/* 本番では見本（確認済み）の切り替えを出さない（DATA_CONTRACT 5章） */}
      {!import.meta.env.PROD && <fieldset>
        <legend className="label"><One k="review.mode" /></legend>
        <div className="chips">
          <button type="button" className="seg" aria-pressed={mode === 'public'} onClick={() => void v.put('settings', 'review_mode', 'public')}><One k="review.public" /></button>
          <button type="button" className="seg" aria-pressed={mode === 'verified'} onClick={() => void v.put('settings', 'review_mode', 'verified')}><One k="review.verified" /></button>
        </div>
      </fieldset>}
      <section className="group"><h2><Bi k="review.cards" />（{d.cards.length}）</h2>
        <ul className="list review" role="list">
          {d.flow.card_order.map((id) => d.cards.find((c) => c.id === id)!).map((c) => (
            <Item key={c.id} id={c.id} title={c.title} e={c.evidence}><code className="review__expr">{expr(c.eligibility)}{c.coverage_rule_ids.length ? ' ／ coverage: ' + c.coverage_rule_ids.join(', ') : ''}</code></Item>
          ))}
        </ul>
      </section>
      <section className="group"><h2><Bi k="review.rules" />（{d.rules.size}）</h2>
        <ul className="list review" role="list">{[...d.rules.values()].map((r) => <Item key={r.id} id={r.id + '（' + r.kind + '）'} title={r.statement} e={r.evidence} />)}</ul>
      </section>
      <section className="group"><h2><Bi k="review.relations" />（{d.relations.length}）</h2>
        <ul className="list review" role="list">{d.relations.map((r) => <Item key={r.id} id={r.id + '（' + r.type + '）'} title={r.explain} e={r.evidence} />)}</ul>
      </section>
      <section className="group"><h2><Bi k="review.objects" />（{d.objects.length}）</h2>
        <ul className="list review" role="list">{d.objects.map((o) => <Item key={o.id} id={o.id} title={o.title} e={o.evidence}><span className="sub"><One t={o.purpose} /></span></Item>)}</ul>
      </section>
      <div className="links"><Link to="/" className="link"><Bi k="nav.home" /></Link></div>
    </>
  );
}
