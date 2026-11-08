/* 日を選ぶカレンダー（作者の指示 2026-11-05）：日曜始まりの5週。選べない日（休み・前の手続きより前）は押せない。
   期限を過ぎた日は「過ぎています」と示しつつ選べる。状態は色だけにせず、印と文字で示す（15.2）。
   行く日を決めた日は ● と「行く日」の文字で示す（K-34）。readOnly は見るだけ（/calendar）。 */
import { dayInfo, monthGrid, plannedMarks, uniquePlans, type DayInfo, type DayTag, type Hours } from '../core/calendar';
import { openEventPlans, type Occurrence } from '../core/occurrence';
import { useGuide } from '../guide/useGuide';
import { One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import '../styles/calendar.css';
import { fmtDay } from './guide';

// 祝日は見える印を付けない（作者 11/6 A-3）。日曜・祝日は赤い数字にし、読み上げには祝日の名前を残す
const MARK: Partial<Record<DayTag, string>> = { closed: '休', past_deadline: '！', blocked: '×', unknown_hours: '？' };
const ORDER: DayTag[] = ['past_deadline', 'closed', 'blocked', 'unknown_hours'];

export function CalendarGrid({ today, current, min, max, deadline, hours, holidays, onPick, marks, readOnly }: {
  today: string; current?: string; min?: string | null; max?: string | null; deadline?: string | null; hours?: Hours; holidays: Record<string, string>; onPick?: (d: string) => void;
  /** 行く日を決めた日ごとの件数。省略すると、保存してある手続きの日（引っ越しと生活イベントの両方）から作る */
  marks?: Record<string, number>;
  /** 見るだけ（押せない）。休み・開いている時間の印は出さない */
  readOnly?: boolean;
}) {
  const { level, vault } = usePrefs();
  const g = useGuide();
  const eventPlans = openEventPlans(vault.entries('occurrences').map(([, o]) => o as Occurrence)).map((x) => x.plan);
  const mk = marks ?? plannedMarks(uniquePlans([...Object.values(g.plan), ...eventPlans]), today);
  const weeks = monthGrid(today, 5, min);
  const used = new Set<DayTag>();
  let anyPlanned = false;
  const info = (d: string): DayInfo => {
    const x = dayInfo({ day: d, today, min, max, deadline, hours, holidays });
    if (readOnly) x.tags = x.tags.filter((t) => t === 'today' || t === 'holiday');
    x.tags.forEach((t) => used.add(t));
    if (mk[d]) anyPlanned = true;
    return x;
  };
  const cells = weeks.map((w) => w.map((d) => (d ? info(d) : null)));
  const planned = (d: string) => (mk[d] ? line(ui('cal.tag.planned' as UiKey), level) + (mk[d] > 1 ? ' ' + mk[d] : '') : '');
  const label = (x: DayInfo) => [fmtDay(x.day, level), ...x.tags.filter((t) => t !== 'today').map((t) => line(ui(('cal.tag.' + t) as UiKey), level)), planned(x.day), x.holiday ?? ''].filter(Boolean).join('、');
  return (
    <div className={'cal' + (readOnly ? ' cal--readonly' : '')}>
      <table className="cal__table">
        <caption className="label"><One k="cal.title" /></caption>
        <thead>
          <tr>{[0, 1, 2, 3, 4, 5, 6].map((i) => <th key={i} scope="col" className={i === 0 ? 'cal__red' : undefined} abbr={line(ui(('cal.wdLong.' + i) as UiKey), level)}><One k={('cal.wd.' + i) as UiKey} /></th>)}</tr>
        </thead>
        <tbody>
          {cells.map((w, wi) => (
            <tr key={wi}>
              {w.map((x, i) => {
                if (!x) return <td key={i} />;
                const cls = 'cal__day' + (readOnly ? ' cal__day--static' : '') + (mk[x.day] ? ' cal__day--planned' : '') + (x.tags.includes('past_deadline') ? ' cal__day--late' : '') + (x.tags.includes('today') ? ' cal__day--today' : '') + (i === 0 || x.holiday ? ' cal__day--red' : '');
                // 見える数字と読み上げの名前を合わせるため、aria-label ではなく見えない文で日付全体を読ませる（2.5.3）
                const inner = (
                  <>
                    <span aria-hidden="true">{Number(x.day.slice(8))}</span>
                    <span className="sr-only">{label(x)}</span>
                    <span className="cal__mark" aria-hidden="true">{mk[x.day] ? '●' : ''}{ORDER.filter((t) => x.tags.includes(t)).map((t) => MARK[t]).join('')}</span>
                  </>
                );
                return (
                  <td key={i}>
                    {readOnly
                      ? <div className={cls}>{inner}</div>
                      : <button type="button" className={cls} aria-pressed={current === x.day} disabled={!x.selectable} onClick={() => onPick?.(x.day)}>{inner}</button>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {(anyPlanned || ORDER.some((t) => used.has(t))) && (
        <ul className="cal__legend" aria-label={line(ui('cal.legend'), level)}>
          {anyPlanned && <li><span aria-hidden="true" className="cal__mark cal__plan">●</span> <One k={'cal.tag.planned' as UiKey} /></li>}
          {ORDER.filter((t) => used.has(t)).map((t) => <li key={t}><span aria-hidden="true" className="cal__mark">{MARK[t]}</span> <One k={('cal.tag.' + t) as UiKey} /></li>)}
        </ul>
      )}
    </div>
  );
}
