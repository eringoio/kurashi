/* ガイドの部品：状態のラベル、答えのボタン、一覧の行、日を選ぶ、理由、出典のシート */
import { useState, type ReactNode } from 'react';
import { DATA } from '../core/data';
import { briefText, cardLead } from '../core/brief';
import { DOCUMENTS } from '../core/documents';
import type { CardView, Note, Section } from '../core/engine';
import type { Evidence, Question, Text, Value } from '../core/schema';
import { trustMark } from '../core/trust';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { LEVELS, line, ui, type Level, type LocalizedText, type UiKey } from '../i18n/text';
import { daySuggestions } from '../core/date';
import { earliestDay } from '../core/visit';
import { usePrefs } from '../storage/prefs';
import { art, artDim } from './art';
import { Link } from './router';
import { Sheet } from './Sheet';
import { Speak } from './Speak';
import { CalendarGrid } from './CalendarGrid';
import { dayInfo } from '../core/calendar';
import { HOLIDAYS, HOURS, type PlaceHours } from '../core/calendarData';

/** 一覧での状態（SPEC 15.2：色＋形＋文字。形は印の文字と枠の線） */
export type StateKey = 'today' | 'check' | 'ask' | 'wait' | 'later' | 'done' | 'excluded' | 'out';
export const stateKey = (c: CardView): StateKey =>
  c.state === 'excluded' ? 'excluded' : c.state === 'out_of_scope' ? 'out' : c.state === 'ask' ? 'ask' : (c.section ?? 'later');
const MARK: Record<StateKey, string> = { today: '●', check: '！', ask: '？', wait: '…', later: '→', done: '✓', excluded: '×', out: '−' };
const CLS: Record<StateKey, string> = { today: 'now', check: 'check', ask: 'ask', wait: 'wait', later: 'later', done: 'done', excluded: 'out', out: 'out' };

/** 「いま」の印の言葉は、義務の強さで分ける（AI レビューの指摘：すすめ・案内まで「必要」と言い切らない）。
    legal・local_rule：必要／practical：したほうがよい／check・optional・none：案内 */
export const todayWord = (ob: CardView['card']['obligation']): UiKey =>
  (ob === 'legal' || ob === 'local_rule' ? 'st.today' : ob === 'practical' ? 'st.todayAdvised' : 'st.todayInfo') as UiKey;
/** A-6 の見本（作者が決めるまでの一時の形）：おすすめの形（札「窓口で確認」）。VITE_KAKUNIN_ALT=on、
    または開発のときだけ sessionStorage の kurashi:kakunin_alt=on（見本のフロー用。本番のビルドでは読まない）。決まったら片方を消す */
export const KAKUNIN_ALT = import.meta.env.VITE_KAKUNIN_ALT === 'on'
  || (import.meta.env.DEV && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('kurashi:kakunin_alt') === 'on');
export function StateLabel({ k, ob }: { k: StateKey; ob?: CardView['card']['obligation'] }) {
  const key = (k === 'today' && ob ? todayWord(ob) : k === 'check' && KAKUNIN_ALT ? 'st.check_alt' : 'st.' + k) as UiKey;
  return (
    <span className={'k-state k-state--' + CLS[k]}>
      <span aria-hidden="true">{MARK[k]}</span>
      <One k={key} />
    </span>
  );
}

/** AI チェック・確認済みのアイコン（A-8）。期限・費用・義務の欄だけに付ける。読み上げの名前を付ける。要確認には付けない */
export function TrustMark({ e }: { e?: Pick<Evidence, 'status'> | null }) {
  const { level } = usePrefs();
  const m = trustMark(e);
  if (!m) return null;
  const name = line(ui(m === 'ai' ? 'pat.aiChecked' : 'trust.human'), level);
  return <img className="trust" src={art(m === 'ai' ? 'check-ai' : 'check-human')} alt={name} title={name} />;
}

/** いくつかの根拠をまとめた印：1つでも要確認なら無し、1つでも AI なら AI、全部確認済みなら人 */
export const worstEvidence = (es: Pick<Evidence, 'status'>[]): Pick<Evidence, 'status'> | null =>
  !es.length || es.some((e) => !trustMark(e)) ? null : es.find((e) => e.status === 'ai_checked') ?? es[0];

export function fmtDay(ymd: string, level: Level): string {
  const d = new Date(ymd + 'T00:00:00Z');
  if (level.kind === 'foreign') return new Intl.DateTimeFormat(level.lang, { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  const w = new Intl.DateTimeFormat('ja', { timeZone: 'UTC', weekday: 'short' }).format(d);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${w}）`;
}

/** 質問の答えのボタン。1画面に1つの判断（15.2） */
export function Answers({ q, onPick }: { q: Question; onPick: (v: Value) => void }) {
  return (
    <div className="list">
      {q.options.map((o) => (
        <button key={String(o.value)} type="button" className={'k-answer' + (o.small ? ' k-answer--small' : '')} onClick={() => onPick(o.value)}>
          {o.icon && <img src={art(o.icon)} alt="" />}
          <Bi phrase t={o.label} />
        </button>
      ))}
    </div>
  );
}

/** なぜ聞くのか（8.1：なぜ聞くのかを一言で）。押すと開く */
export function WhyAsked({ t }: { t: Text }) {
  const [why, setWhy] = useState(false);
  return (
    <>
      <button type="button" className="link" aria-expanded={why} onClick={() => setWhy(!why)}><One k="move.why" /></button>
      {why && <p className="sub"><Bi t={t} /></p>}
    </>
  );
}

/** カードの中の質問（見出し＋答え＋なぜ聞くの） */
export function QuestionBlock({ q, onPick }: { q: Question; onPick: (v: Value) => void }) {
  return (
    <section className="qblock" aria-labelledby={'q-' + q.id}>
      <h2 id={'q-' + q.id} className="qblock__title"><Bi phrase t={q.text} /></h2>
      <Answers q={q} onPick={onPick} />
      <WhyAsked t={q.why_asked} />
    </section>
  );
}

/** 一覧の行。どの項目もここから開ける（6A.4） */
export function CardRow({ c, extra, current, base = '/c/', check }: { c: CardView; extra?: ReactNode; current?: boolean; base?: string; check?: { done: boolean; onToggle: () => void } }) {
  const k = stateKey(c);
  const dim = k === 'ask' || k === 'excluded' || k === 'out' || k === 'later';
  const { level } = usePrefs();
  return (
    <li className={check ? 'row-check' : undefined}>
      {/* すぐにやることの一覧（K-15）：「済んだ」の印。押すと済んだ⇔まだ */}
      {check && (
        <button type="button" className="row-check__box" aria-pressed={check.done} onClick={check.onToggle}
          aria-label={line(ui('check.done'), level) + '：' + line(c.card.title, level)}>
          <span aria-hidden="true">{check.done ? '✓' : ''}</span>
        </button>
      )}
      <Link to={base + c.card.id} className={'row row--' + CLS[k]} aria-current={current ? 'page' : undefined}>
        <img src={artDim(c.card.illustration, dim)} alt="" />
        <span className="row__name"><Bi phrase t={c.card.title} /></span>
        <span className="row__side">
          <StateLabel k={k} ob={c.card.obligation} />
          {extra && <span className="row__extra">{extra}</span>}
        </span>
      </Link>
    </li>
  );
}

/** 答えの表示名（理由に出す。10.5）。持ち物から決まった事実は、物の名前で示す */
export function factLabel(fact: string, value: Value, objects: Record<string, boolean>): Text | null {
  const d = DATA();
  const obj = d.objects.find((o) => objects[o.id] && o.yields_when_held.some((y) => y.fact === fact && y.value === value));
  if (obj) {
    const held = ui('objects.held');
    const t: Text = { ja: obj.title.ja + '：' + held.ja };
    for (const k of Object.keys(obj.title)) if (k !== 'ja' && held[k]) t[k] = obj.title[k] + (k.startsWith('ja') ? '：' : ': ') + held[k];
    return t;
  }
  const q = d.questions.find((x) => x.fact === fact);
  const o = q?.options.find((x) => x.value === value);
  return o ? o.label : null;
}

/** 理由の主な一文（10.5）。開いた項目には、これだけを出す。くわしくはシート */
export function whyText(c: CardView): LocalizedText {
  if (c.state === 'excluded') {
    // カード固有の文 → 入口のルールの文（制度の対象ではないと読める文にしない）→ 既定の文
    const f = c.falseRule;
    return c.card.reasons.excluded ?? (f?.kind === 'entry' && f.reason_when_false ? f.reason_when_false : ui('why.excluded'));
  }
  if (c.state === 'out_of_scope') return ui('why.out');
  if (c.state === 'ask') return ui('why.ask');
  if (c.section === 'done' && c.sectionWhy === 'answer') {
    // 済んだとした答えのルールの文を入れる（A1 の「在留カードの裏」の文を B1 に流用していた。AI レビューの指摘）
    const n = c.notes.find((x) => x.kind === 'satisfied_by_answer');
    const ids = n && 'satisfied_when_rule_ids' in n.relation ? n.relation.satisfied_when_rule_ids ?? [] : [];
    const r = ids.map((id) => DATA().rules.get(id)).find((x) => !!x);
    if (!r) return ui('why.byAnswerPlain');
    return fill(ui('why.byAnswer'), 'rule', (_lv, k) => String(r.statement[k] ?? r.statement.ja).replace(/[。.]$/, '')) as LocalizedText;
  }
  if (c.state === 'check_at_office') {
    if (c.cause === 'coverage' && c.card.reasons.check_at_office_coverage) return c.card.reasons.check_at_office_coverage;
    if (c.cause === 'unknown') return c.card.reasons.check_at_office ?? ui('why.unknown');
    return ui(c.cause === 'no_question' ? 'why.noQuestion' : c.cause === 'answer_changed' ? 'why.changed' : 'why.unverified');
  }
  return c.reasonRules[0]?.statement ? briefText(c.reasonRules[0].statement) as LocalizedText : cardLead(c.card) as LocalizedText;
}
const SECTION_WHY = { moved_in_not_yet: 'why.movedNotYet', moved_in_unknown: 'why.movedUnknown', moved_in_unanswered: 'why.movedUnanswered', after_prereq: 'why.afterPrereq', visit_need_document: 'why.visitNeedDocument', visit_wrong_place: 'why.visitWrongPlace' } as const;
export function SectionWhy({ c }: { c: CardView }) {
  if (!c.sectionWhy || c.sectionWhy === 'answer' || c.sectionWhy === 'waits') return null;
  return <p className="sub"><Bi k={SECTION_WHY[c.sectionWhy]} /></p>;
}

/** 理由の全部（シートの中）：あなたの答え・理由・ルールの文 */
export function Reason({ c, objects, facts }: { c: CardView; objects: Record<string, boolean>; facts: Map<string, Value> }) {
  const answers = c.reasonFacts.map((f) => factLabel(f, facts.get(f)!, objects)).filter((x): x is Text => !!x);
  const f = c.falseRule;
  return (
    <div className="sheet__row reason">
      <span className="sheet__k"><One k="card.why" /></span>
      {answers.length > 0 && (
        <p className="answers">
          <span className="sr-only"><One k="card.yourAnswers" />：</span>
          {answers.map((a, i) => <span key={i} className="chip chip--static"><One t={a} /></span>)}
        </p>
      )}
      <p><Bi phrase t={whyText(c)} /></p>
      {c.state === 'excluded' && !c.card.reasons.excluded && f?.kind !== 'entry' && f?.reason_when_false && <p className="sub"><Bi t={f.reason_when_false} /></p>}
      <SectionWhy c={c} />
      {c.state === 'shown' && c.reasonRules.slice(1).map((r) => <p key={r.id} className="sub"><Bi t={r.statement} /></p>)}
    </div>
  );
}

/** 関係の注記。where：page＝開いた項目に出すもの（する事に関わる）／day＝日を選ぶとき／all＝シート */
const NOTE_WHERE: Record<Note['kind'], ('page' | 'day' | 'all')[]> = {
  maybe_done: ['page', 'all'], prereq_unknown: ['page', 'day', 'all'], waits_for: ['page', 'all'],
  legal_prereq: ['day', 'all'], practical_prereq: ['day', 'all'], same_visit: ['day', 'all'], satisfied_by_answer: [],
  parallel: ['page', 'all'], related: ['all'],
};
export function Notes({ c, where }: { c: CardView; where: 'page' | 'day' | 'all' }) {
  // 同じ文の注記は1回だけ（同時に進められる関係が2つあると、同じ文が2回出ていた。AI レビューの指摘）
  const seen = new Set<string>();
  const list = c.notes.filter((n) => NOTE_WHERE[n.kind].includes(where)).filter((n) => {
    const key = n.kind === 'maybe_done' ? n.kind : n.kind + JSON.stringify(n.relation.explain);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!list.length) return null;
  return (
    <>
      {list.map((n) => (
        <div key={n.relation.id + n.kind} className="k-notice" role="note">
          {n.kind === 'maybe_done' ? <Bi k="why.maybeDone" /> : <Bi t={n.relation.explain} />}
          {n.kind === 'legal_prereq' && !n.verified && <Bi k="note.orderCheck" />}
          {n.kind === 'prereq_unknown' && <Bi k="note.prereqUnknown" />}
        </div>
      ))}
    </>
  );
}

/** 文の中の {name} を、言語ごとの文に置き換える */
export function fill(t: Text | LocalizedText, name: string, by: (lv: Level, id: string) => string): Text {
  const out: Text = { ja: '' };
  for (const [k, v] of Object.entries(t)) {
    if (typeof v !== 'string' || k === 'status') continue;
    const lv = LEVELS.find((l) => l.id === k) ?? LEVELS[0];
    out[k] = v.replace('{' + name + '}', by(lv, k));
  }
  return out;
}
/** 日付を入れた文（{date} を、それぞれの言語の書き方の日付に置き換える） */
export const fillDate = (t: Text | LocalizedText, ymd: string): Text => fill(t, 'date', (lv) => fmtDay(ymd, lv));

/** 開いている時間の1行（A-4）：「平日 8:45〜17:15（要確認）」。平日でない場所は曜日を並べる */
export function hoursLine(h: PlaceHours): Text {
  const t = (x?: string) => (x ?? '').replace(/^0/, '');
  const weekdays = [...h.weekdays].sort().join() === '1,2,3,4,5';
  const pick = (k: UiKey, id: string) => { const u = ui(k); return u[id] ?? u.ja_easy ?? u.ja; };
  const days = fill(ui('cal.hours'), 'days', (_lv, id) => (weekdays ? pick('cal.weekdays', id) : h.weekdays.map((d) => pick(('cal.wd.' + d) as UiKey, id)).join('・')));
  return fill(fill(days, 'open', () => t(h.open)), 'close', () => t(h.close));
}

/** 開いている時間の1行。年末年始・日曜窓口などはシートへ（A-4） */
function HoursLine({ h }: { h: PlaceHours }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sub">
      <One t={hoursLine(h)} />
      {h.note && <>　<button type="button" className="link" onClick={() => setOpen(true)}><One k="cal.hoursMore" /></button></>}
      {open && h.note && <Sheet title={<One k="cal.hoursTitle" />} onClose={() => setOpen(false)}><p><Bi t={h.note} /></p></Sheet>}
    </div>
  );
}

const UI_HAS_PLACE = (place: string): LocalizedText | undefined => (ui(('place.' + place) as UiKey) as LocalizedText | undefined);

/** 日を聞く見出し：行く所があれば「いつ、区役所に行きますか？」 */
export function dayTitle(c: CardView): LocalizedText {
  const place = c.card.place;
  if (!place) return ui('day.title');
  const p = UI_HAS_PLACE(place);
  if (!p) return ui('day.title');
  return fill(ui('day.titlePlace'), 'place', (_lv, id) => p[id] ?? p.ja_easy ?? p.ja) as LocalizedText;
}

/** いつ行く？（6A.5）：今日／今週のうちに／次の休みの日。ほかの日も選べる。制度上の前提（確認済み）より前の日は選べない。
    同じ所でする項目（group）は、一度に聞く。一緒にしない項目は外せる */
export function DayChoice({ group, today, onPick, onLater }: { group: CardView[]; today: string; onPick: (d: string, ids: string[]) => void; onLater: () => void }) {
  const { level } = usePrefs();
  const [off, setOff] = useState<Set<string>>(new Set());
  const c = group[0];
  const sel = group.filter((x) => !off.has(x.card.id));
  const ids = new Set(sel.map((x) => x.card.id));
  const rule = c.dayRule;
  if (rule.kind === 'need_first' && !ids.has(rule.from)) {
    const from = DATA().cards.find((x) => x.id === rule.from)!;
    return (
      <div className="k-notice" role="note">
        <Bi k="day.needFirst" />
        <Link to={'/c/' + from.id} className="link"><Bi t={from.title} /></Link>
      </div>
    );
  }
  const min = earliestDay(sel);
  const minFrom = sel.find((x) => x.dayRule.kind === 'min' && x.dayRule.day === min)?.dayRule;
  const hours = c.card.place ? HOURS()[c.card.place] : undefined;
  const hol = HOLIDAYS();
  const pick = (d: string) => onPick(d, sel.map((x) => x.card.id));
  return (
    <>
      {group.length > 1 && (
        <fieldset className="together">
          <legend className="label"><One k="day.together" /></legend>
          <div className="list">
            {group.map((x, i) => {
              const inner = (
                <>
                  <span className="k-check__box" aria-hidden="true">{ids.has(x.card.id) ? '✓' : ''}</span>
                  <img src={art(x.card.illustration)} alt="" />
                  <Bi phrase t={x.card.title} />
                </>
              );
              // 最初の1つ（いま開いている項目）は、いつも入る。外せるのは、ほかの項目だけ
              return i === 0 ? (
                <div key={x.card.id} className="k-check k-check--fixed">{inner}</div>
              ) : (
                <button key={x.card.id} type="button" className="k-check" aria-pressed={ids.has(x.card.id)}
                  onClick={() => setOff((s) => { const n = new Set(s); if (n.has(x.card.id)) n.delete(x.card.id); else n.add(x.card.id); return n; })}>
                  {inner}
                </button>
              );
            })}
          </div>
          <p className="sub"><Bi k="day.togetherNote" /></p>
        </fieldset>
      )}
      <Notes c={c} where="day" />
      {min && minFrom?.kind === 'min' && <p className="sub"><One k="day.minNote" /><One t={DATA().cards.find((x) => x.id === minFrom.from)!.title} />　{fmtDay(min, level)}</p>}
      <div className="list list--days">
        {daySuggestions(today).map((s) => {
          // 休みの日（開いている時間のデータ）・前の手続きより前の日は押せない。理由を文字で出す
          const info = dayInfo({ day: s.day, today, min, hours, holidays: hol });
          const why = info.tags.find((t) => t === 'closed' || t === 'blocked');
          return (
            <button key={s.key} type="button" className="k-answer" disabled={!info.selectable} onClick={() => pick(s.day)}>
              <img src={art('calendar')} alt="" />
              <span className="bi"><span className="bi__main"><One k={('day.sug.' + s.key) as UiKey} />　{fmtDay(s.day, level)}{why && <>　<One k={('cal.tag.' + why) as UiKey} /></>}</span></span>
            </button>
          );
        })}
      </div>
      {hours?.open && <HoursLine h={hours} />}
      <CalendarGrid today={today} current={c.plan?.planned_on} min={min} hours={hours} holidays={hol} onPick={pick} />
      <button type="button" className="link" onClick={onLater}><Bi k="day.later" /></button>
    </>
  );
}

/** いま見ている1つ（試作 D の重ねたカード）：絵・名前・状態 */
export function FocusCard({ c, title }: { c: CardView; title?: boolean }) {
  const k = stateKey(c);
  const dim = k === 'check' || k === 'later' || k === 'excluded' || k === 'out';
  return (
    <div className={'focus focus--' + CLS[k]}>
      <span className="focus__art" aria-hidden="true">
        <img src={(k === 'ask' ? art('ask') : artDim(c.card.illustration, dim))} alt="" />
        {(k === 'excluded' || k === 'out') && <img className="focus__over" src={art('cross')} alt="" />}
        {k === 'done' && <img className="focus__badge" src={art('badge')} alt="" />}
        {(k === 'wait' || k === 'later') && <img className="focus__badge" src={art('clock')} alt="" />}
      </span>
      {/* 開いた項目では、名前がその画面の見出し（h1） */}
      {title ? <h1 id="screen-title" tabIndex={-1} className="focus__name"><Bi phrase t={c.card.title} /></h1> : <span className="focus__name"><Bi phrase t={c.card.title} /></span>}
      <StateLabel k={k} ob={c.card.obligation} />
      {/* 義務（しないといけないか）の印。開いた項目でだけ、要確認でないとき（A-8） */}
      {title && k !== 'check' && k !== 'ask' && <TrustMark e={worstEvidence(c.reasonRules.map((r) => r.evidence))} />}
    </div>
  );
}

/** 全体の絵（試作 D の「ここまでで、わかったこと」）：真ん中にあなた、まわりに項目と状態。
    同じことは下の一覧にあるので、読み上げでは読ませない（二度聞かせない） */
export function WorldMap({ cards }: { cards: CardView[] }) {
  const list = cards.filter((c) => c.state !== 'excluded' && c.state !== 'out_of_scope').slice(0, 8);
  return (
    <div className="world" aria-hidden="true">
      <img className="world__you" src={art('you')} alt="" />
      {list.map((c, i) => {
        const k = stateKey(c);
        const dim = k === 'check' || k === 'later';
        return (
          <span key={c.card.id} className={'world__item world__item--' + i + ' world__item--' + CLS[k]}>
            <span className="world__pic">
              <img src={(k === 'ask' ? art('ask') : artDim(c.card.illustration, dim))} alt="" />
              {k === 'done' && <img className="world__badge" src={art('badge')} alt="" />}
              {k === 'wait' && <img className="world__badge" src={art('clock')} alt="" />}
            </span>
            <span className="world__label"><span aria-hidden="true">{MARK[k]}</span> <One t={c.card.title} /></span>
          </span>
        );
      })}
    </div>
  );
}

/** 操作の結果（D の「この答えで変わったこと」「決めました」）。つぎへ で、いまの1つへ */
export function ResultView({ eyebrow, title, sub, onNext, children }: { eyebrow: UiKey; title: ReactNode; sub?: ReactNode; onNext: () => void; children?: ReactNode }) {
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k={eyebrow} /></p>
        <h1 id="screen-title" tabIndex={-1}>{title}</h1>
      </div>
      {sub && <div className="sub">{sub}</div>}
      <button type="button" className="k-answer k-answer--primary" onClick={onNext}><Bi phrase k="nav.next" /></button>
      {children}
    </>
  );
}

/** 理由・出典・確認日・確認状態（5.3：触れば必ず見られる） */
export function SourcesSheet({ c, objects, facts, onClose }: { c: CardView; objects: Record<string, boolean>; facts: Map<string, Value>; onClose: () => void }) {
  const d = DATA();
  const ev = [c.card.evidence, c.card.deadline?.evidence, c.card.fee?.evidence, c.card.where.evidence].filter(Boolean);
  const srcIds = [...new Set(ev.flatMap((e) => e!.source_ids).concat(c.reasonRules.flatMap((r) => r.evidence.source_ids)))];
  return (
    <Sheet title={<One t={c.card.title} />} onClose={onClose}>
      <Reason c={c} objects={objects} facts={facts} />
      <Notes c={c} where="all" />
      <div className="sheet__row"><span className="sheet__k"><One k="card.what" /></span><Bi t={c.card.summary} /></div>
      {c.card.deadline && <div className="sheet__row"><span className="sheet__k"><One k="card.deadline" /> <TrustMark e={c.card.deadline.evidence} /></span><Bi t={c.card.deadline.text} /></div>}
      {c.card.fee && <div className="sheet__row"><span className="sheet__k"><One k="card.fee" /> <TrustMark e={c.card.fee.evidence} /></span><Bi t={c.card.fee.text} /></div>}
      <div className="sheet__row"><span className="sheet__k"><One k="card.where" /></span><Bi t={c.card.where.text} /></div>
      {/* この手続きでもらう書類（B-12）。data/documents.json の issued_by_card */}
      {DOCUMENTS().some((x) => (x.issued_by_card ?? []).includes(c.card.id)) && (
        <div className="sheet__row"><span className="sheet__k"><One k="card.issued" /></span>
          <span>{DOCUMENTS().filter((x) => (x.issued_by_card ?? []).includes(c.card.id)).map((x, i) => <span key={x.id}>{i > 0 && '・'}<Bi t={x.title} /></span>)}</span>
        </div>
      )}
      <div className="sheet__row">
        <span className="sheet__k"><One k="card.official" /></span>
        <span lang="ja"><Ruby s={`{${c.card.official_name.ja}|${c.card.official_name.reading}}`} /></span>
        <Speak ja={`{${c.card.official_name.ja}|${c.card.official_name.reading}}`} />
      </div>
      {c.reasonRules.map((r) => (
        <div className="sheet__row" key={r.id}>
          <span className="sheet__k"><One k="card.rule" /> <TrustMark e={r.evidence} /></span>
          <Bi t={r.statement} />
          <span className="sheet__sub"><One k="src.status" />：<One k={('src.status.' + r.evidence.status) as UiKey} />・<One k="src.checked" />：{r.evidence.checked_at}</span>
        </div>
      ))}
      <div className="sheet__row">
        <span className="sheet__k"><One k="src.status" /></span>
        <span><TrustMark e={c.card.evidence} /> <One k={('src.status.' + c.card.evidence.status) as UiKey} /></span>
        <span className="sheet__sub"><One k="src.checked" />：{c.card.evidence.checked_at}</span>
      </div>
      {srcIds.map((id) => {
        const s = d.sources.find((x) => x.source_id === id)!;
        return (
          <div className="sheet__row" key={id}>
            <span className="sheet__k"><One k="src.source" /></span>
            <span lang="ja">{s.owner}「{s.title}」</span>
            {s.owner_type === 'product' && <span className="sheet__sub"><One k="src.product" /></span>}
            {s.url && <a className="link" href={s.url} target="_blank" rel="noopener noreferrer"><One k="src.open" /></a>}
          </div>
        );
      })}
    </Sheet>
  );
}

export const SECTION_ORDER: Section[] = ['today', 'check', 'wait', 'later', 'done'];
