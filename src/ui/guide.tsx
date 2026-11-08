/* ガイドの部品：状態のラベル、答えのボタン、一覧の行、日を選ぶ、理由、出典のシート */
import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { DATA } from '../core/data';
import { briefText, cardLead } from '../core/brief';
import { DOCUMENTS } from '../core/documents';
import type { CardView, EngineOutput, Note, Section } from '../core/engine';
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
import { AddToCalendar } from './AddToCalendar';
import { dayInfo } from '../core/calendar';
import { HOLIDAYS, HOURS, type PlaceHours } from '../core/calendarData';
import { Rate } from './Rate';

/** 一覧での状態（SPEC 15.2：色＋形＋文字。形は印の文字と枠の線） */
export type StateKey = 'today' | 'check' | 'ask' | 'wait' | 'later' | 'info' | 'done' | 'excluded' | 'out';
export const stateKey = (c: CardView): StateKey =>
  c.state === 'excluded' ? 'excluded' : c.state === 'out_of_scope' ? 'out' : c.state === 'ask' ? 'ask' : (c.section ?? 'later');
const MARK: Record<StateKey, string> = { today: '●', check: '！', ask: '？', wait: '…', later: '→', info: 'i', done: '✓', excluded: '×', out: '−' };
const CLS: Record<StateKey, string> = { today: 'now', check: 'check', ask: 'ask', wait: 'wait', later: 'later', info: 'info', done: 'done', excluded: 'out', out: 'out' };

/** 「いま」の印の言葉は、義務の強さで分ける（AI レビューの指摘：すすめ・案内まで「必要」と言い切らない）。
    legal・local_rule：必要／practical：したほうがよい／check・optional・none：案内 */
export const todayWord = (ob: CardView['card']['obligation']): UiKey =>
  (ob === 'legal' || ob === 'local_rule' ? 'st.today' : ob === 'practical' ? 'st.todayAdvised' : 'st.todayInfo') as UiKey;
/** A-6 の見本（作者が決めるまでの一時の形）：おすすめの形（札「窓口で確認」）。VITE_KAKUNIN_ALT=on、
    または開発のときだけ sessionStorage の kurashi:kakunin_alt=on（見本のフロー用。本番のビルドでは読まない）。決まったら片方を消す */
export const KAKUNIN_ALT = import.meta.env.VITE_KAKUNIN_ALT === 'on'
  || (import.meta.env.DEV && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('kurashi:kakunin_alt') === 'on');
/** 状態の言葉のキー（印の文字と一緒に出す。変わったことの1行にも使う） */
export const stateWord = (k: StateKey, ob?: CardView['card']['obligation']): UiKey =>
  (k === 'today' && ob ? todayWord(ob) : k === 'check' && KAKUNIN_ALT ? 'st.check_alt' : 'st.' + k) as UiKey;
export function StateLabel({ k, ob }: { k: StateKey; ob?: CardView['card']['obligation'] }) {
  const key = stateWord(k, ob);
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
      <button type="button" className="link link--why" aria-expanded={why} onClick={() => setWhy(!why)}><One k="move.why" /></button>
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
/** compact：見出しが状態を示す一覧では、絵と状態の札を出さない（日付は残す。K-43）。状態の言葉は読み上げ用に残す */
/** note：名前の下に出す短い文（関係なかったものの理由など。K-28） */
export function CardRow({ c, extra, current, base = '/c/', check, compact, note }: { c: CardView; extra?: ReactNode; current?: boolean; base?: string; check?: { done: boolean; onToggle: () => void }; compact?: boolean; note?: ReactNode }) {
  const k = stateKey(c);
  const dim = k === 'ask' || k === 'excluded' || k === 'out' || k === 'later' || k === 'info';
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
      <Link to={base + c.card.id} className={'row row--' + CLS[k] + (compact ? ' row--compact' : '')} aria-current={current ? 'page' : undefined}>
        {!compact && <img src={artDim(c.card.illustration, dim)} alt="" />}
        <span className="row__name"><Bi phrase t={c.card.title} /></span>
        {compact ? (
          <>
            <span className="sr-only">（<One k={stateWord(k, c.card.obligation)} />）</span>
            {extra && <span className="row__extra">{extra}</span>}
            {note && <span className="row__note">{note}</span>}
          </>
        ) : (
          <span className="row__side">
            <StateLabel k={k} ob={c.card.obligation} />
            {extra && <span className="row__extra">{extra}</span>}
          </span>
        )}
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
const SECTION_WHY = { moved_in_not_yet: 'why.movedNotYet', moved_in_unknown: 'why.movedUnknown', moved_in_unanswered: 'why.movedUnanswered', after_prereq: 'why.afterPrereq', visit_need_document: 'why.visitNeedDocument', visit_wrong_place: 'why.visitWrongPlace', deferred: 'why.deferred', answer_later: 'why.answerLater' } as const;
/** 「〇〇のあとで」の文（段の after。v0.5.30）。手続きの名前を入れる */
export function afterText(c: CardView): Text | null {
  const from = c.afterFrom ? DATA().cards.find((x) => x.id === c.afterFrom) : undefined;
  return from ? fill(ui('why.afterCard'), 'card', (_lv, k) => String(from.title[k] ?? from.title.ja)) : null;
}
export function SectionWhy({ c }: { c: CardView }) {
  if (!c.sectionWhy || c.sectionWhy === 'answer' || c.sectionWhy === 'waits') return null;
  if (c.sectionWhy === 'after_card') { const t = afterText(c); return t ? <p className="sub"><Bi t={t} /></p> : null; }
  return <p className="sub"><Bi k={SECTION_WHY[c.sectionWhy]} /></p>;
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
    // 文の頭（20文字）が同じ注記も1回だけ（種類の違う関係が同じ説明を持つことがある。U14）
    const key = n.kind === 'maybe_done' ? n.kind : n.kind + JSON.stringify(n.relation.explain);
    const head = n.kind === 'maybe_done' ? '' : 'head:' + String(n.relation.explain.ja ?? '').slice(0, 20);
    if (seen.has(key) || (head && seen.has(head))) return false;
    seen.add(key);
    if (head) seen.add(head);
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
export function HoursLine({ h }: { h: PlaceHours }) {
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
  const [blockedPressed, setBlockedPressed] = useState(false);
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
      <div className="list list--days">
        {daySuggestions(today).map((s) => {
          // 休みの日（開いている時間のデータ）は押せない。前の手続きより前の日は、押すと理由を出す（K-42）
          const info = dayInfo({ day: s.day, today, min, hours, holidays: hol });
          const why = info.tags.find((t) => t === 'closed' || t === 'blocked');
          const blocked = !info.selectable && why === 'blocked';
          return (
            <button key={s.key} type="button" className="k-answer" disabled={!info.selectable && !blocked} aria-disabled={blocked || undefined}
              onClick={() => (blocked ? setBlockedPressed(true) : pick(s.day))}>
              <img src={art('calendar')} alt="" />
              <span className="bi"><span className="bi__main"><One k={('day.sug.' + s.key) as UiKey} />　{fmtDay(s.day, level)}{why && <>　<One k={('cal.tag.' + why) as UiKey} /></>}</span></span>
            </button>
          );
        })}
      </div>
      <p role="status" className="sub k-blocked">
        {blockedPressed && min && minFrom?.kind === 'min' && (
          <One t={fill(fill(ui('day.blockedWhy'), 'card', (_lv, id) => pickText(DATA().cards.find((x) => x.id === minFrom.from)!.title, id)), 'date', (lv) => fmtDay(min, lv))} />
        )}
      </p>
      {hours?.open && <HoursLine h={hours} />}
      {/* カレンダーは最初から出す（作者の指示 11/7：日を選ぶときすぐ見える） */}
      <CalendarGrid today={today} current={c.plan?.planned_on} min={min} hours={hours} holidays={hol} onPick={pick} />
      <button type="button" className="k-answer k-answer--small" onClick={onLater}><Bi k="day.later" /></button>
    </>
  );
}

/** 文の中の、その言語の文（無ければやさしい日本語、ふつうの日本語） */
const pickText = (t: Text | LocalizedText, id: string): string => String((t as Record<string, unknown>)[id] ?? t.ja_easy ?? t.ja);

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

/** 全体の絵（試作 D の「ここまでで、わかったこと」。作者 11/7 K-43：スマホでも残す）：真ん中にあなた、まわりの輪に項目。
    輪の項目は押して開ける（道案内）。状態は下の一覧が受け持つ。どの項目も輪の箱の中に置く（角度で置き、半径は箱の半分から項目の半分を引く）。
    狭い輪（400px 未満）は6つの場所、広い輪は8つまで。それより多いときは最後に「ほかに◯件」（一覧へ移る） */
export function WorldMap({ cards, base = '/c/', listId }: { cards: CardView[]; base?: string; listId?: string }) {
  // 輪の箱は項目が無いと出ない。箱ができたときに見張りを付けるため、ref ではなく state で持つ
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(true);
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= 400));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  const all = cards.filter((c) => c.state !== 'excluded' && c.state !== 'out_of_scope');
  if (!all.length) return null;
  // 広い輪：8つまで、多いときは9つ目に「ほかに」。狭い輪：6つの場所（多いときは5つと「ほかに」）
  const list = wide ? all.slice(0, 8) : all.slice(0, all.length > 6 ? 5 : 6);
  const rest = all.length - list.length;
  const n = list.length + (rest > 0 ? 1 : 0);
  // 角度で置く。上から時計回り。left/top は輪の箱に対する割合（箱は正方形）
  const at = (i: number): CSSProperties => {
    const a = (2 * Math.PI * i) / Math.max(n, 1);
    const sx = Math.sin(a).toFixed(4), cy = (-Math.cos(a)).toFixed(4);
    return { left: `calc(50% + ${sx} * (50% - var(--world-half)))`, top: `calc(50% + ${cy} * (50% - var(--world-half)))` };
  };
  const toList = () => {
    const el = listId ? document.getElementById(listId) : null;
    el?.scrollIntoView({ block: 'start' });
    el?.focus({ preventScroll: true });
  };
  return (
    <div className="world world--ring" ref={setEl}>
      <img className="world__you" src={art('you')} alt="" aria-hidden="true" />
      <ul className="world__ring" role="list">
        {list.map((c, i) => {
          const k = stateKey(c);
          const dim = k === 'check' || k === 'later';
          return (
            <li key={c.card.id} className={'world__item world__item--' + CLS[k]} style={at(i)}>
              <Link to={base + c.card.id} className="world__link">
                <span className="world__pic">
                  <img src={(k === 'ask' ? art('ask') : artDim(c.card.illustration, dim))} alt="" />
                  {k === 'done' && <img className="world__badge" src={art('badge')} alt="" />}
                  {k === 'wait' && <img className="world__badge" src={art('clock')} alt="" />}
                </span>
                <span className="world__label"><span aria-hidden="true">{MARK[k]}</span> <One t={c.card.title} /></span>
                <span className="sr-only">（<One k={stateWord(k, c.card.obligation)} />）</span>
              </Link>
            </li>
          );
        })}
        {rest > 0 && (
          <li className="world__item world__item--more" style={at(list.length)}>
            <button type="button" className="world__link" onClick={toList}>
              <span className="world__more" aria-hidden="true">+{rest}</span>
              <span className="world__label"><One t={fill(ui('all.more'), 'n', () => String(rest))} /></span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

/** 公式のページ：カードの links の最初、無ければ根拠（カード・期限・窓口・方法）の出典のうち、国・自治体・公的な法人で URL のあるもの */
export function officialLink(c: CardView): { url: string; label?: Text; owner?: string } | null {
  const l = c.card.links?.[0];
  if (l) return { url: l.url, label: l.label };
  const ev = [c.card.evidence, c.card.deadline?.evidence, c.card.where.evidence, ...(c.card.methods ?? []).map((m) => m.evidence)].filter(Boolean);
  for (const id of ev.flatMap((e) => e!.source_ids)) {
    const s = DATA().sources.find((x) => x.source_id === id);
    if (s?.url && (s.owner_type === 'government' || s.owner_type === 'public_corp')) return { url: s.url, owner: s.owner };
  }
  return null;
}

/** 確認した日（日付だけ。曜日なし） */
const fmtDate = (ymd: string, lv: Level) =>
  new Intl.DateTimeFormat(lv.kind === 'foreign' ? lv.lang : 'ja', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(ymd + 'T00:00:00Z'));

/** 項目の大事な事実（11/8 作者：くわしくのシートをやめ、ページの中に短く）。いつまで・お金・どこで・もらう書類・正式な名前。
    ページのほかの所（理由の一文・方法の一覧）に出ている内容は出さない */
export function CardFacts({ c, where }: { c: CardView; where: boolean }) {
  const docs = DOCUMENTS().filter((x) => (x.issued_by_card ?? []).includes(c.card.id));
  const n = c.card.official_name;
  return (
    <dl className="k-facts">
      {c.card.deadline && <div><dt><One k="card.deadline" /> <TrustMark e={c.card.deadline.evidence} /></dt><dd><Bi t={c.card.deadline.text} /></dd></div>}
      {c.card.fee && <div><dt><One k="card.fee" /> <TrustMark e={c.card.fee.evidence} /></dt><dd><Bi t={c.card.fee.text} /></dd></div>}
      {where && <div><dt><One k="card.where" /></dt><dd><Bi t={c.card.where.text} /></dd></div>}
      {docs.length > 0 && <div><dt><One k="card.issued" /></dt><dd>{docs.map((x, i) => <span key={x.id}>{i > 0 && '・'}<Link to={'/doc/' + x.id} className="link"><Bi t={x.title} /></Link></span>)}</dd></div>}
      <div><dt><One k="card.official" /></dt><dd className="k-facts__name"><span lang="ja">{n.ja.length > 12
        // 長い正式名は、名前全体のふりがなが折り返せないので、読みを下の行に出す（320px）
        ? <>{n.ja}<span className="k-facts__reading">{n.reading}</span></>
        : <Ruby s={`{${n.ja}|${n.reading}}`} />}</span><Speak ja={`{${n.ja}|${n.reading}}`} /></dd></div>
    </dl>
  );
}

/** 出典の一覧（11/8：シートの代わりに、ページの下に）。カード・ルール・期限・お金・場所・方法・代わりの書類の出典を1回ずつ。
    確認日と確認状態はまとめて1行 */
export function CardSources({ c }: { c: CardView }) {
  const { level } = usePrefs();
  const d = DATA();
  const evs: (Pick<Evidence, 'source_ids'> | undefined)[] = [c.card.evidence, ...c.reasonRules.map((r) => r.evidence), c.card.deadline?.evidence, c.card.fee?.evidence, c.card.where.evidence, ...(c.card.methods ?? []).map((m) => m.evidence), ...(c.card.alternatives ?? []).map((a) => a.evidence)];
  const ids = [...new Set(evs.flatMap((e) => e?.source_ids ?? []))];
  const srcs = ids.map((id) => d.sources.find((x) => x.source_id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  if (!srcs.length) return null;
  return (
    <section className="k-sources" aria-labelledby={'src-' + c.card.id}>
      <h2 className="label" id={'src-' + c.card.id}><One k="src.source" /></h2>
      <ul role="list">
        {srcs.map((x) => (
          <li key={x.source_id} lang="ja">
            {x.url
              ? <a className="link" href={x.url} target="_blank" rel="noopener noreferrer">{x.owner}「{x.title}」<span aria-hidden="true"> ↗</span><span className="sr-only"><One k="clinic.newTab" /></span></a>
              : <>{x.owner}「{x.title}」</>}
            {x.owner_type === 'product' && <span className="sub"> <One k="src.product" /></span>}
          </li>
        ))}
      </ul>
      <p className="sub"><One k="src.checked" />：{fmtDate(c.card.evidence.checked_at, level)}・<One k={('src.status.' + c.card.evidence.status) as UiKey} /></p>
    </section>
  );
}

/** 答えた・日を決めたあとの1行（SPEC 6A.5 v0.5.14）：結果の画面を出さず、次の1つの上に出す */
export type Last =
  | { kind: 'answered'; cardId: string; q: Question }
  | { kind: 'planned'; cardId: string; day: string; ids: string[] };
export type Redo = { kind: 'q'; cardId: string; q: Question } | { kind: 'day'; cardId: string };

export function changedText(c: CardView): Text {
  const k = stateKey(c);
  return fill(fill(ui('res.changed.line'), 'card', (_lv, id) => pickText(c.card.title, id)), 'state', (_lv, id) => pickText(ui(stateWord(k, c.card.obligation)), id));
}

/** 変わったことの1行。読み上げは role=status で知らせる（いつも置いておき、中身だけ変える） */
export function ChangeLine({ last, cards, onUndo, onChangeDay }: { last: Last | null; cards: CardView[]; onUndo?: (q: Question) => void; onChangeDay?: (cardId: string) => void }) {
  const c = last ? cards.find((x) => x.card.id === last.cardId) : undefined;
  const show = !!(last && c);
  return (
    <div className={'k-change' + (show ? ' k-change--on' : '')}>
      <p role="status" className="k-change__line">
        {show && last!.kind === 'answered' && <><span aria-hidden="true">✓ </span><Bi phrase t={changedText(c!)} /></>}
        {show && last!.kind === 'planned' && <><span aria-hidden="true">✓ </span><Bi t={fillDate(ui('res.planned.line'), last!.day)} /></>}
      </p>
      {show && (
        <div className="links k-change__acts">
          {last!.kind === 'answered' && onUndo && <button type="button" className="link" onClick={() => onUndo(last!.q)}><Bi k="res.changed.undo" /></button>}
          {last!.kind === 'planned' && <AddToCalendar small day={last!.day} place={c!.card.place} cardIds={last!.ids} />}
          {last!.kind === 'planned' && onChangeDay && <button type="button" className="link" onClick={() => onChangeDay(last!.cardId)}><Bi k="day.change" /></button>}
        </div>
      )}
    </div>
  );
}

/** いまの1つ（Now・EventNow）で使う：答える・日を決める・聞き直す。結果の画面は出さない */
export function useChange(g: { out: EngineOutput; answer(qid: string, v: Value): Promise<void>; setPlans(ids: string[], p: { planned_on: string; deferred?: boolean }): Promise<void> }) {
  const [last, setLast] = useState<Last | null>(null);
  const [redo, setRedo] = useState<Redo | null>(null);
  const answer = async (cardId: string, q: Question, v: Value) => { await g.answer(q.id, v); setRedo(null); setLast({ kind: 'answered', cardId, q }); };
  const plan = async (cardId: string, d: string, ids: string[]) => { await g.setPlans(ids, { planned_on: d, deferred: false }); setRedo(null); setLast({ kind: 'planned', cardId, day: d, ids }); };
  const line = redo ? null : <ChangeLine last={last} cards={g.out.cards} onUndo={(q) => last && setRedo({ kind: 'q', cardId: last.cardId, q })} onChangeDay={(id) => setRedo({ kind: 'day', cardId: id })} />;
  return { last, redo, setRedo, setLast, answer, plan, line };
}

/** 聞き直す（答えを変える）・日を変える の画面。見出しは h1 */
export function RedoStep({ redo, cards, today, onAnswer, onPlan, onCancel }: { redo: Redo; cards: CardView[]; today: string; onAnswer: (cardId: string, q: Question, v: Value) => void; onPlan: (cardId: string, d: string, ids: string[]) => void; onCancel: () => void }) {
  const c = cards.find((x) => x.card.id === redo.cardId);
  if (!c) return null;
  if (redo.kind === 'q') {
    return (
      <>
        <FocusCard c={c} />
        <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi t={redo.q.text} /></h1></div>
        <Answers q={redo.q} onPick={(v) => onAnswer(c.card.id, redo.q, v)} />
        <WhyAsked t={redo.q.why_asked} />
        <button type="button" className="link" onClick={onCancel}><Bi k="nav.backPrev" /></button>
      </>
    );
  }
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One t={c.card.title} /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase t={dayTitle(c)} /></h1>
      </div>
      <DayChoice group={[c]} today={today} onPick={(d, ids) => onPlan(c.card.id, d, ids)} onLater={onCancel} />
    </>
  );
}

/** 操作の結果（D の「この答えで変わったこと」「決めました」）。つぎへ で、いまの1つへ */
/** rate：役に立ったかを聞く（カードか行く所の id。済んだ・行ってきたのときだけ） */
export function ResultView({ eyebrow, title, sub, onNext, children, rate }: { eyebrow: UiKey; title: ReactNode; sub?: ReactNode; onNext: () => void; children?: ReactNode; rate?: string }) {
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k={eyebrow} /></p>
        <h1 id="screen-title" tabIndex={-1}>{title}</h1>
      </div>
      {sub && <div className="sub">{sub}</div>}
      <button type="button" className="k-answer k-answer--primary" onClick={onNext}><Bi phrase k="nav.next" /></button>
      {children}
      {rate && <Rate id={rate} />}
    </>
  );
}

export const SECTION_ORDER: Section[] = ['today', 'check', 'wait', 'later', 'info', 'done'];

/** 質問の画面の残りの数（v0.5.31：手続きの質問は最初にまとめて聞く）。1問なら「最後の質問」 */
export function QLeft({ n }: { n: number }) {
  if (n < 1) return null;
  return <p className="sub k-qleft"><One t={n === 1 ? ui('now.qLeftOne') : fill(ui('now.qLeft'), 'n', () => String(n))} /></p>;
}
