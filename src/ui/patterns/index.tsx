/* 手続きの共通部品（表示だけ）。実行計画 6 章のパターンを、素の props（types.ts）で受け取って出す。
   状態は「印の文字＋文字＋枠の形」で示す（色だけにしない）。色・余白は tokens.css の変数だけ。
   開いた項目は短く、くわしくはシート、操作のあとは結果と「つぎへ」（試作 D の形）。 */
import { useId, type ReactNode } from 'react';
import { Bi, One } from '../../i18n/Ruby';
import type { UiKey } from '../../i18n/text';
import { art } from '../art';
import type {
  BelongingVM, ContactVM, HoldStatus, LifeGuideVM, MethodKind, MethodVM, PickOptionVM, RelationKind, StepVM,
  T, UnknownVM, UrgentActionVM, WaitingVM,
} from './types';

const safeUrl = (u: string) => u.startsWith('https://');
/** tel: の番号。数字と + と # だけ残す（# は %23 に） */
const tel = (n: string) => n.replace(/[^0-9+#]/g, '').replace(/#/g, '%23');

/** 小さな線の印（文字の代わりにしない：いつも名前と一緒に出す） */
const IP = { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;
const PhoneIcon = () => <svg {...IP}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" /></svg>;
const WebIcon = () => <svg {...IP}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
const HallIcon = () => <svg {...IP}><path d="M3 10l9-6 9 6M5 10v9M19 10v9M9 19v-6h6v6M3 19h18" /></svg>;
const MailIcon = () => <svg {...IP}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 8l9 6 9-6" /></svg>;
const METHOD_ICON: Record<MethodKind, ReactNode> = { window: <HallIcon />, phone: <PhoneIcon />, online: <WebIcon />, mail: <MailIcon /> };

/** 連絡先の一覧：電話は tel:、web は https の公式ページだけ（新しいタブ）。番号は文字でも出す */
export function Contacts({ list }: { list: ContactVM[] }) {
  if (!list.length) return null;
  return (
    <ul className="pt-contacts" role="list">
      {list.map((c, i) => (
        <li key={i}>
          {c.kind === 'phone' ? (
            <a className="k-answer pt-contact" href={'tel:' + tel(c.value)}>
              <PhoneIcon />
              <span className="pt-contact__text">
                <span className="pt-contact__act"><One k="pat.urgent.call" />　<One t={c.label} /></span>
                <span className="pt-contact__num" lang="en">{c.value}</span>
                {c.hours && <span className="pt-contact__hours"><One k="pat.urgent.hours" />：<One t={c.hours} /></span>}
              </span>
            </a>
          ) : safeUrl(c.value) ? (
            <a className="k-answer pt-contact" href={c.value} target="_blank" rel="noopener noreferrer">
              <WebIcon />
              <span className="pt-contact__text">
                <span className="pt-contact__act"><One k="pat.urgent.open" />　<One t={c.label} /></span>
                {c.hours && <span className="pt-contact__hours"><One k="pat.urgent.hours" />：<One t={c.hours} /></span>}
              </span>
            </a>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** 1. すぐ行う行動：質問や日の選択より先に出す。太い枠と「!」の印 */
export function UrgentAction({ a }: { a: UrgentActionVM }) {
  const id = useId();
  return (
    <section className="pt-urgent" aria-labelledby={id}>
      <p className="pt-badge pt-badge--urgent"><span aria-hidden="true">!</span> <One k="pat.urgent.badge" /></p>
      <h2 id={id}><Bi t={a.title} /></h2>
      <p className="sub"><Bi t={a.why} /></p>
      <Contacts list={a.contacts} />
      {a.note && <div className="k-notice" role="note"><Bi t={a.note} /></div>}
      <p className="sub pt-small"><Bi k="pat.urgent.first" /></p>
      {a.onDone && (
        <button type="button" className="k-answer" onClick={a.onDone}>
          <img src={art('badge')} alt="" />{a.doneLabel ? <Bi t={a.doneLabel} /> : <Bi k="card.done" />}
        </button>
      )}
    </section>
  );
}

/** 2. 複数対象の選択（財布の中のカードなど）。選んだ数は読み上げでも知らせる */
export function MultiPick({ legend, options, selected, onChange, mergeNote }: { legend: T; options: PickOptionVM[]; selected: string[]; onChange: (ids: string[]) => void; mergeNote?: boolean }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <fieldset className="pt-fieldset">
      <legend className="label"><Bi t={legend} /></legend>
      <div className="list">
        {options.map((o) => {
          const on = selected.includes(o.id);
          return (
            <button key={o.id} type="button" className="k-check" aria-pressed={on} onClick={() => toggle(o.id)}>
              <span className="k-check__box" aria-hidden="true">{on ? '✓' : ''}</span>
              {o.art && <img src={art(o.art)} alt="" />}
              <span className="pt-grow"><Bi t={o.label} />{o.hint && <span className="pt-hint"><One t={o.hint} /></span>}</span>
            </button>
          );
        })}
      </div>
      <p className="sub" role="status" aria-live="polite">
        <One k="pat.pick.count" />：{selected.length ? <strong>{selected.length}</strong> : <One k="pat.pick.none" />}
      </p>
      {mergeNote && <p className="sub pt-small"><Bi k="pat.pick.merge" /></p>}
    </fieldset>
  );
}

const HOLD: HoldStatus[] = ['have', 'lost', 'stopped', 'reissue_wait', 'unknown'];
const HOLD_MARK: Record<HoldStatus, string> = { have: '✓', lost: '！', stopped: '■', reissue_wait: '…', unknown: '？' };

/** 3. 持ち物の状態：ある／なくした／停止した／再発行を待っている／わからない。状態ごとに、代わりに使えるものと相談先 */
export function BelongingStatus({ item, onChange }: { item: BelongingVM; onChange: (s: HoldStatus) => void }) {
  const alt = item.alternatives?.[item.status];
  return (
    <fieldset className={'pt-fieldset pt-belong pt-belong--' + item.status}>
      <legend className="pt-belong__name">
        {item.art && <img src={art(item.art + (item.status === 'have' ? '' : '-dim'))} alt="" />}
        <Bi t={item.label} />
      </legend>
      <p className="label"><One k="pat.status.label" /></p>
      <div className="pt-seg">
        {HOLD.map((s) => (
          <button key={s} type="button" className={'seg pt-st pt-st--' + s} aria-pressed={item.status === s} onClick={() => onChange(s)}>
            <span aria-hidden="true">{HOLD_MARK[s]}</span> <One k={('pat.status.' + s) as UiKey} />
          </button>
        ))}
      </div>
      {alt && (
        <div className="k-notice" role="note">
          <p className="label"><One k="pat.status.alt" /></p>
          <Bi t={alt} />
        </div>
      )}
    </fieldset>
  );
}

/** 4. 手続きの方法：窓口・電話・オンライン・郵送。選ぶと、その方法の必要なものを下に出す */
export function MethodChooser({ methods, value, onChange }: { methods: MethodVM[]; value: string | null; onChange: (id: string) => void }) {
  const cur = methods.find((m) => m.id === value);
  const name = (m: MethodVM) => (m.label ? <Bi t={m.label} /> : <One k={('pat.method.' + m.kind) as UiKey} />);
  return (
    <fieldset className="pt-fieldset">
      <legend className="label"><One k="pat.method.label" /></legend>
      <div className="list">
        {methods.map((m) => (
          <button key={m.id} type="button" className="k-check pt-method" aria-pressed={m.id === value} onClick={() => onChange(m.id)}>
            <span className="pt-method__icon" aria-hidden="true">{METHOD_ICON[m.kind]}</span>
            <span className="pt-grow">
              <strong>{name(m)}</strong>
              {m.when && <span className="pt-hint"><One t={m.when} /></span>}
              {m.unverified && <span className="pt-tag"><One k="pat.confirm" /></span>}
            </span>
            <span className="pt-method__mark" aria-hidden="true">{m.id === value ? '✓' : ''}</span>
          </button>
        ))}
      </div>
      {cur && cur.needs.length > 0 && (
        <div className="pt-needs" role="status" aria-live="polite">
          <p className="label"><One k="pat.method.chosen" />：{name(cur)}　<One k="pat.method.needs" /></p>
          <ul>{cur.needs.map((n, i) => <li key={i}><Bi t={n} /></li>)}</ul>
        </div>
      )}
    </fieldset>
  );
}

const REL: { kind: RelationKind; mark: string }[] = [
  { kind: 'required_first', mark: '①' }, { kind: 'recommended', mark: '→' }, { kind: 'parallel', mark: '＝' },
];
const REL_KEY: Record<RelationKind, UiKey> = { required_first: 'pat.rel.required', recommended: 'pat.rel.recommended', parallel: 'pat.rel.parallel' };

/** 5. 依存と並行：必須の前提／おすすめの順／同時にできる、を分けて並べる（枠の形も違う） */
export function StepRelations({ steps }: { steps: StepVM[] }) {
  return (
    <div className="pt-rel">
      {REL.map(({ kind, mark }) => {
        const list = steps.filter((s) => s.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className={'pt-rel__group pt-rel__group--' + kind}>
            <h3 className="pt-rel__h"><span aria-hidden="true">{mark}</span> <One k={REL_KEY[kind]} /></h3>
            <ul className="list" role="list">
              {list.map((s) => (
                <li key={s.id} className="pt-step">
                  {s.art && <img src={art(s.art)} alt="" />}
                  <span className="pt-grow">
                    <strong><Bi t={s.title} /></strong>
                    {s.after && <span className="pt-hint"><One k="pat.rel.after" />：<One t={s.after} /></span>}
                    {s.unverified && <span className="pt-tag"><One k="pat.rel.unverified" /></span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

const STAGE_MARK = { done: '✓', current: '●', todo: '○' } as const;

/** 6. 申請後の待ち：申請済み≠完了。いまの段階・目安・連絡が来ないとき・再開の入口 */
export function WaitingProgress({ w }: { w: WaitingVM }) {
  const id = useId();
  return (
    <section className="pt-wait" aria-labelledby={id}>
      <p className="pt-badge pt-badge--wait"><span aria-hidden="true">…</span> <One k="pat.wait.notDone" /></p>
      <h2 id={id}><Bi t={w.title} /></h2>
      <ol className="pt-stages">
        {w.stages.map((s) => (
          <li key={s.id} className={'pt-stage pt-stage--' + s.state} aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="pt-stage__mark" aria-hidden="true">{STAGE_MARK[s.state]}</span>
            <span className="pt-grow"><Bi t={s.label} /></span>
            <span className="pt-stage__state"><One k={('pat.stage.' + s.state) as UiKey} /></span>
          </li>
        ))}
      </ol>
      {w.expect && <p className="sub"><strong><One k="pat.wait.expect" />：</strong><One t={w.expect} /></p>}
      {w.noNews && <div className="k-notice" role="note"><p className="label"><One k="pat.wait.noNews" /></p><Bi t={w.noNews} /></div>}
      {w.contacts && <Contacts list={w.contacts} />}
      {w.onResume && <button type="button" className="link" onClick={w.onResume}><Bi k="pat.wait.resume" /></button>}
    </section>
  );
}

const GUIDE_MARK = { consult: '？', compare: '≒', prepare: '☐' } as const;

/** 7. 相談・比較・準備のガイド：日付も「いつ窓口へ」も求めない */
export function LifeGuide({ g }: { g: LifeGuideVM }) {
  const id = useId();
  return (
    <section className={'pt-guide pt-guide--' + g.kind} aria-labelledby={id}>
      <p className="pt-badge"><span aria-hidden="true">{GUIDE_MARK[g.kind]}</span> <One k={('pat.guide.' + g.kind) as UiKey} /></p>
      <h2 id={id}><Bi t={g.title} /></h2>
      <ul className="pt-points">{g.points.map((p, i) => <li key={i}><Bi t={p} /></li>)}</ul>
      {g.prep && (
        <div className="pt-needs">
          <p className="label"><One k="pat.guide.prep" /></p>
          <ul>{g.prep.map((p, i) => <li key={i}><Bi t={p} /></li>)}</ul>
        </div>
      )}
      {g.contacts && <Contacts list={g.contacts} />}
      <p className="sub pt-small"><Bi k="pat.guide.noDate" /></p>
    </section>
  );
}

/** 8. 例外・不明：言い切らず「窓口で確認（要確認）」。理由と相談先 */
export function UnknownNotice({ u }: { u: UnknownVM }) {
  const id = useId();
  return (
    <section className="pt-unknown" aria-labelledby={id}>
      <h2 id={id}><span aria-hidden="true">？</span> <Bi k="pat.unknown.title" /></h2>
      <p className="label"><One k="pat.unknown.reason" /></p>
      <p><Bi t={u.reason} /></p>
      {u.where && (<><p className="label"><One k="pat.unknown.where" /></p><p><Bi t={u.where} /></p></>)}
      {u.contacts && <Contacts list={u.contacts} />}
    </section>
  );
}
