/* 在留期間の更新の流れ（SPEC 6A.18 v0.5.29）。開いた項目（CardPage）の「できること」の所に出す。
   1画面に1つの判断（15.2）：いまの段だけを出し、答えた段は上に短く並べる（［変える］付き）。
   判定は src/core/stayRenew.ts、制度の事実と出典は data/stay-renew.json。保存は plan.stay（SPEC 9.9。同意の前はメモリだけ） */
import { useState, type FormEvent } from 'react';
import type { CardView } from '../core/engine';
import type { PlanRecord } from '../core/entry';
import { DATA } from '../core/data';
import { HOLIDAYS, HOURS } from '../core/calendarData';
import type { Hours } from '../core/calendar';
import {
  KIND_FROM_PROFILE, PROFILE_OF, TRACK, advisedUntil, currentStep, methodOpen, openFrom, planOutside, planRange, urgency,
  type AfterExpiry, type Method, type PeriodBand, type StayKind, type StayRecord, type Step,
} from '../core/stayRenew';
import { STAY, TRACK_SOURCE } from '../core/stayRenewData';
import type { Text } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type LocalizedText, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from './art';
import { CalendarGrid } from './CalendarGrid';
import { fill, fmtDay, HoursLine } from './guide';

export interface StayGuide {
  today: string;
  answer(qid: string, v: string): Promise<void>;
  setPlan(cardId: string, patch: Partial<PlanRecord>): Promise<void>;
}
/** オンラインは毎日受け付ける（online-QA Q4-9。保守の時間は除く） */
const EVERY_DAY: Hours = { weekdays: [0, 1, 2, 3, 4, 5, 6], closed: [] };
const ExtMark = () => <><span aria-hidden="true" className="clinic__extmark">↗</span><span className="sr-only"><One k="clinic.newTab" /></span></>;
const srcUrl = (id: string) => DATA().sources.find((s) => s.source_id === id)?.url ?? undefined;

function Ext({ src, k, hint }: { src: string; k: UiKey; hint?: UiKey }) {
  const url = srcUrl(src);
  if (!url) return null;
  return (
    <a className="k-answer k-official" href={url} target="_blank" rel="noopener noreferrer">
      <span className="pt-grow"><Bi phrase k={k} />{hint && <span className="pt-hint"><One k={hint} /></span>}</span>
      <ExtMark />
    </a>
  );
}
const Fact = ({ t, warn }: { t: Text; warn?: boolean }) => <p className={'k-notice' + (warn ? ' k-notice--warn' : '')} role="note"><Bi t={t} /></p>;

export function StayRenewFlow({ c, g, onPermit, onLive }: { c: CardView; g: StayGuide; onPermit: () => void; onLive: (s: string) => void }) {
  const { level, vault } = usePrefs();
  const D = STAY();
  const today = g.today;
  const s: StayRecord = c.plan?.stay ?? {};
  const status = c.plan?.status;
  const planned = c.plan?.planned_on;
  const L = (k: UiKey) => line(ui(k), level);
  // 「あなたについて」の答え：1つに決まるときは選んだ形で出す。永住者・特別永住者なら満了日を聞かない
  const profile = vault.get<string>('profile', 'Q-zairyu-status');
  const profileKind: StayKind | undefined = profile ? KIND_FROM_PROFILE[profile] ?? (profile === 'permanent' ? 'permanent' : undefined) : undefined;
  const [edit, setEdit] = useState<Step | null>(null);
  const [draft, setDraft] = useState(s.expires_on && s.expires_on !== 'none' ? s.expires_on : '');
  const [err, setErr] = useState(false);
  const save = async (patch: Partial<StayRecord>, extra: Partial<PlanRecord> = {}) => { await g.setPlan(c.card.id, { ...extra, stay: { ...s, ...patch } }); setEdit(null); };
  const step = edit ?? currentStep(s, today, { planned, status, profileKind });
  const exp = s.expires_on && s.expires_on !== 'none' ? s.expires_on : null;
  const u = exp ? urgency(exp, today) : null;
  const track = s.kind ? TRACK[s.kind] : null;
  const applied = status === 'submitted' || status === 'waiting' || status === 'done';
  const kindLabel = s.kind ? D.statuses.find((x) => x.id === s.kind)!.label : null;
  const fd = (d: string) => fmtDay(d, level);

  // 警告は必要なときだけ（申請したあと・更新でない人には出さない）
  const warnKey: UiKey | null = !u || applied || (track && track !== 'renew') ? null
    : u.kind === 'expired' ? 'sr.warn.expired' : u.kind === 'today' ? 'sr.warn.today' : u.kind === 'week' ? 'sr.warn.week' : u.kind === 'soon' ? 'sr.warn.soon' : null;
  const warn = warnKey && (
    <div className={'k-notice' + (u!.kind === 'soon' ? '' : ' k-notice--warn')} role="note">
      {/* 期限が過ぎたときは見出しを付けて、いちばん上に（作者の依頼 11/8） */}
      {u!.kind === 'expired' && <p className="label"><Bi k="sr.exp.title" /></p>}
      <Bi t={fill(ui(warnKey), 'n', () => String(u!.daysLeft))} />
    </div>
  );

  // 答えた段の短い一覧（いま開いている段は出さない）
  const rows: { key: UiKey; val: Text | LocalizedText | string; step: Step }[] = [];
  if (s.expires_on && step !== 'expiry') rows.push({ key: 'sr.sum.expiry', val: exp ? fd(exp) : ui('sr.sum.none'), step: 'expiry' });
  if (s.period && step !== 'period') rows.push({ key: 'sr.sum.period', val: ui(('sr.period.' + s.period) as UiKey), step: 'period' });
  if (kindLabel && step !== 'status') rows.push({ key: 'sr.sum.status', val: kindLabel, step: 'status' });
  if (s.docs_seen && track === 'renew' && step !== 'docs') rows.push({ key: 'sr.sum.docs', val: fill(ui('sr.sum.docsCount'), 'n', () => String(s.docs?.length ?? 0)), step: 'docs' });
  if (s.method && track === 'renew' && step !== 'method') rows.push({ key: 'sr.sum.method', val: ui(('sr.method.' + s.method) as UiKey), step: 'method' });
  const summary = rows.length > 0 && (
    <dl className="sr-sum">
      {rows.map((r) => (
        <div key={r.key} className="sr-sum__row">
          <dt><One k={r.key} /></dt>
          <dd>{typeof r.val === 'string' ? <span lang={level.lang}>{r.val}</span> : <One t={r.val} />}</dd>
          {!applied && <dd><button type="button" className="link" onClick={() => { setEdit(r.step); setErr(false); }}><One k="sr.change" /><span className="sr-only">：<One k={r.key} /></span></button></dd>}
        </div>
      ))}
    </dl>
  );

  const body = (() => {
    switch (step) {
      case 'expiry': {
        const submit = (e: FormEvent) => {
          e.preventDefault();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(draft)) { setErr(true); return; }
          setErr(false);
          void save({ expires_on: draft, after: undefined });
        };
        return (
          <section className="qblock" aria-labelledby="sr-q">
            <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.expiry.q" /></h2>
            <p className="sub"><Bi t={D.facts.expiry_hint.text} /></p>
            <form className="list" onSubmit={submit} noValidate>
              <label htmlFor="sr-exp" className="label"><One k="sr.expiry.label" /></label>
              <input id="sr-exp" className="field" type="date" value={draft} aria-invalid={err || undefined} aria-describedby={err ? 'sr-exp-err' : undefined}
                onChange={(e) => setDraft(e.target.value)} />
              {err && <p id="sr-exp-err" className="sub k-blocked" role="alert"><One k="sr.expiry.empty" /></p>}
              <button type="submit" className="k-answer k-answer--primary"><img src={art('calendar')} alt="" /><Bi phrase k="sr.expiry.save" /></button>
            </form>
            <button type="button" className="k-answer k-answer--small" onClick={() => void save({ expires_on: 'none' })}><Bi phrase k="sr.expiry.none" /></button>
          </section>
        );
      }
      case 'period':
        return (
          <section className="qblock" aria-labelledby="sr-q">
            <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.period.q" /></h2>
            <div className="list">
              {(['long', 'short', 'unknown'] as PeriodBand[]).map((p) => (
                <button key={p} type="button" className={'k-answer' + (p === 'unknown' ? ' k-answer--small' : '')} aria-pressed={s.period === p || undefined} onClick={() => void save({ period: p })}>
                  <Bi phrase k={('sr.period.' + p) as UiKey} />
                </button>
              ))}
            </div>
            <p className="sub"><Bi k="sr.period.why" /></p>
          </section>
        );
      case 'status': {
        const pick = async (k: StayKind) => {
          // 共通の答え（あなたについて）も同じ値にする。短期滞在・わからないは書かない
          const pv = PROFILE_OF[k];
          if (pv && pv !== profile) { await g.answer('Q-nationality', 'foreign'); await g.answer('Q-zairyu-status', pv); }
          await save({ kind: k });
        };
        const cur = s.kind ?? profileKind;
        return (
          <section className="qblock" aria-labelledby="sr-q">
            <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.status.q" /></h2>
            <p className="sub"><Bi k="sr.status.why" /></p>
            <div className="list">
              {D.statuses.map((x) => (
                <button key={x.id} type="button" className={'k-answer' + (x.id === 'unknown' ? ' k-answer--small' : '')} aria-pressed={cur === x.id || undefined} onClick={() => void pick(x.id)}>
                  <img src={art(x.icon)} alt="" /><Bi phrase t={x.label} />
                </button>
              ))}
            </div>
          </section>
        );
      }
      case 'stop': {
        const t = track === 'card' ? D.facts.card : track === 'spc' ? D.facts.spc : track === 'short' ? D.facts.short : D.facts.unknown;
        const link = track === 'card' ? <Ext src={TRACK_SOURCE.card} k="sr.link.card" /> : track === 'spc' ? <Ext src={TRACK_SOURCE.spc} k="sr.link.spc" />
          : track === 'short' ? <Ext src={TRACK_SOURCE.short} k="sr.link.general" /> : <Ext src={TRACK_SOURCE.unknown} k="sr.link.status" />;
        return (
          <section className="qblock" aria-labelledby="sr-q">
            {track !== 'unknown' && <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.notThis" /></h2>}
            <p className="sub"><Bi t={t.text} /></p>
            <div className="list">{link}</div>
            {track === 'unknown' && <button type="button" className="k-answer" onClick={() => setEdit('status')}><Bi phrase k="sr.status.q" /></button>}
          </section>
        );
      }
      case 'expired': {
        // 期限が過ぎた（v0.5.29。作者の依頼 11/8）：予定日を決めない。質問は1つ。在留の可否・不法滞在かどうかは判定しない。オンラインの更新へ誘導しない
        const a = s.after;
        const region = <Ext src={TRACK_SOURCE.region} k="sr.link.region" />;
        if (!a) {
          return (
            <section className="qblock" aria-labelledby="sr-q">
              <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.exp.q" /></h2>
              <div className="list">
                {(['applied', 'not', 'permitted', 'unknown'] as AfterExpiry[]).map((x) => (
                  <button key={x} type="button" className={'k-answer' + (x === 'unknown' ? ' k-answer--small' : '')} onClick={() => void save({ after: x })}>
                    <Bi phrase k={('sr.exp.' + x) as UiKey} />
                  </button>
                ))}
              </div>
              <div className="list">{region}</div>
            </section>
          );
        }
        const again = <button type="button" className="link" onClick={() => void save({ after: undefined })}><One k="sr.exp.answer" /></button>;
        const head = <p className="sub"><One k={('sr.exp.' + a) as UiKey} />　{again}</p>;
        if (a === 'applied') {
          return (
            <section className="qblock" aria-labelledby="sr-q">
              {head}
              <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.exp.appliedTitle" /></h2>
              <p className="sub"><Bi t={D.facts.expired_applied.text} /></p>
              <div className="list"><Ext src={TRACK_SOURCE.tokurei} k="sr.link.tokurei" />{region}</div>
            </section>
          );
        }
        if (a === 'permitted') {
          return (
            <section className="qblock" aria-labelledby="sr-q">
              {head}
              <p id="sr-q" className="sub"><Bi t={D.facts.expired_permitted.text} /></p>
              <button type="button" className="k-answer k-answer--primary" onClick={() => { setDraft(''); setEdit('expiry'); }}><img src={art('calendar')} alt="" /><Bi phrase k="sr.exp.permittedBtn" /></button>
            </section>
          );
        }
        const n = D.nagoya;
        return (
          <section className="qblock" aria-labelledby="sr-q">
            {head}
            <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.exp.consultTitle" /></h2>
            <p className="sub"><Bi t={D.facts.expired_consult.text} /></p>
            {/* 住んでいる所はわからないので、名古屋と言い切らない（愛知県に住んでいる場合）。全国の一覧も必ず出す */}
            <div className="k-notice" role="note">
              <p className="label"><One t={n.scope} /></p>
              <p><strong><Bi t={n.name} /></strong></p>
              <p><One k="sr.exp.address" />：<One t={n.address} /></p>
            </div>
            <div className="list k-actions">
              {n.phones.map((p) => (
                <a key={p.value} className="k-answer" href={'tel:' + p.value.replace(/[^0-9]/g, '')}>
                  <span className="pt-grow"><Bi phrase k="card.call" /><span className="pt-hint"><One t={p.label} />　<span lang="en">{p.value}</span></span></span>
                </a>
              ))}
              <Ext src={TRACK_SOURCE.nagoya} k="sr.link.nagoya" />
              {region}
            </div>
          </section>
        );
      }
      case 'docs': {
        const have = new Set(s.docs ?? []);
        const st = D.statuses.find((x) => x.id === s.kind);
        const toggle = (id: string) => { const n = new Set(have); if (n.has(id)) n.delete(id); else n.add(id); void g.setPlan(c.card.id, { stay: { ...s, docs: [...n] } }); };
        return (
          <section className="qblock" aria-labelledby="sr-q">
            <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.docs.title" /></h2>
            <ul className="list sr-docs" role="list">
              {D.docs.map((d) => (
                <li key={d.id}>
                  <button type="button" className="k-check" aria-pressed={have.has(d.id)} onClick={() => toggle(d.id)}>
                    <span className="k-check__box" aria-hidden="true">{have.has(d.id) ? '✓' : ''}</span>
                    <Bi phrase t={d.text} />
                  </button>
                  {d.note && <p className="sub sr-docs__note"><Bi t={d.note} /></p>}
                </li>
              ))}
            </ul>
            {s.kind === 'designated' && <Fact t={D.facts.designated.text} />}
            <div className="list">
              {st?.docs_source ? <Ext src={st.docs_source} k="sr.docs.more" hint="sr.docs.moreHint" /> : <Ext src={TRACK_SOURCE.general} k="sr.docs.more" hint="sr.docs.generalHint" />}
              <button type="button" className="k-answer k-answer--primary" onClick={() => void save({ docs_seen: true })}><Bi phrase k="sr.docs.next" /></button>
            </div>
            <p className="sub"><Bi t={D.facts.change.text} /></p>
            <div className="list"><Ext src={TRACK_SOURCE.change} k="sr.link.change" /></div>
          </section>
        );
      }
      case 'method': {
        const onlineOk = !exp || methodOpen('online', exp, today);
        return (
          <section className="qblock" aria-labelledby="sr-q">
            <h2 id="sr-q" className="qblock__title"><Bi phrase k="sr.method.q" /></h2>
            <p className="sub"><Bi t={D.facts.where.text} /></p>
            <div className="list">
              {(['counter', 'online'] as Method[]).map((m) => (
                <button key={m} type="button" className="k-answer" aria-pressed={s.method === m || undefined}
                  disabled={m === 'online' && !onlineOk} aria-describedby={m === 'online' && !onlineOk ? 'sr-online-closed' : undefined}
                  onClick={() => void save({ method: m })}>
                  {m === 'counter' && <img src={art('hall')} alt="" />}<Bi phrase k={('sr.method.' + m) as UiKey} />
                </button>
              ))}
            </div>
            {!onlineOk && <p id="sr-online-closed" className="k-notice k-notice--warn" role="note"><Bi k="sr.method.onlineClosed" /></p>}
            <p className="sub"><Bi t={D.facts.online.text} /></p>
            <div className="list"><Ext src={TRACK_SOURCE.online} k="sr.link.online" /></div>
          </section>
        );
      }
      case 'day': {
        if (!exp) {
          return (
            <>
              <p className="k-notice" role="note"><Bi k="sr.expiry.noneNote" /></p>
              <button type="button" className="k-answer" onClick={() => setEdit('expiry')}><Bi phrase k="sr.expiry.q" /></button>
            </>
          );
        }
        const method = s.method ?? 'counter';
        const r = planRange({ expires: exp, period: s.period, method, today });
        const from = openFrom(exp, s.period);
        const adv = advisedUntil(exp);
        const hours = method === 'counter' ? HOURS().immigration : undefined;
        return (
          <section className="qblock" aria-labelledby="sr-q">
            <h2 id="sr-q" className="qblock__title"><Bi phrase k={method === 'counter' ? 'sr.day.counter' : 'sr.day.online'} /></h2>
            {!r ? <p className="k-notice k-notice--warn" role="note"><Bi k="sr.day.none" /></p> : (
              <>
                <p className="sub"><One t={fill(fill(ui('sr.day.range'), 'from', (lv) => fmtDay(r.min, lv)), 'to', (lv) => fmtDay(r.max, lv))} /></p>
                {from && from > today && <p className="sub"><One t={fill(ui('sr.open'), 'date', (lv) => fmtDay(from, lv))} /> <Bi t={D.facts.open_long.text} /></p>}
                {!from && s.period !== undefined && <p className="sub"><Bi t={D.facts.open_short.text} /></p>}
                {adv >= today && <p className="sub"><One t={fill(ui('sr.advisedBy'), 'date', (lv) => fmtDay(adv, lv))} /> <Bi t={D.facts.advised.text} /></p>}
                {hours && <HoursLine h={hours} />}
                <CalendarGrid today={today} current={planned} min={r.min} max={r.max} hours={hours ?? EVERY_DAY} holidays={HOLIDAYS()}
                  onPick={(d) => { void save({}, { planned_on: d }); onLive(L('day.set') + fd(d)); }} />
              </>
            )}
          </section>
        );
      }
      case 'progress': {
        if (status === 'done') return null;
        if (applied) {
          return (
            <>
              <p className="k-notice" role="status"><One t={fill(ui('sr.applied.state'), 'date', (lv) => fmtDay(s.applied_on ?? today, lv))} /></p>
              <p className="sub"><Bi t={D.facts.special_period.text} /></p>
              <div className="list k-actions">
                <Ext src={TRACK_SOURCE.tokurei} k="sr.link.tokurei" />
                <button type="button" className="k-answer k-answer--primary" onClick={onPermit}><img src={art('badge')} alt="" /><Bi phrase k="sr.permit.btn" /></button>
                <button type="button" className="k-answer k-answer--small" onClick={() => { void g.setPlan(c.card.id, { status: 'todo', stay: { ...s, applied_on: undefined } }); onLive(L('card.recordedUndone')); }}><Bi phrase k="sr.applied.undo" /></button>
              </div>
            </>
          );
        }
        const r = exp ? planRange({ expires: exp, period: s.period, method: s.method ?? 'counter', today }) : null;
        const outside = planOutside(planned, r);
        return (
          <div className="list k-actions">
            {planned && <p className="planned"><One k="sr.planned" />：<strong>{fd(planned)}</strong></p>}
            {outside && planned && <p className="k-notice k-notice--warn" role="note"><One t={fill(ui('sr.day.outside'), 'date', (lv) => fmtDay(planned, lv))} /></p>}
            <button type="button" className={'k-answer' + (outside ? ' k-answer--primary' : '')} onClick={() => setEdit('day')}><Bi phrase k="day.change" /></button>
            <button type="button" className={'k-answer' + (outside ? '' : ' k-answer--primary')} onClick={() => { void save({ applied_on: today }, { status: 'submitted' }); onLive(L('sr.applied.btn')); }}>
              <img src={art('badge')} alt="" /><Bi phrase k="sr.applied.btn" />
            </button>
          </div>
        );
      }
    }
  })();

  return (
    <div className="sr-flow">
      {warn}
      {summary}
      {body}
    </div>
  );
}
