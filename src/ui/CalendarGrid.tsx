/* 日を選ぶカレンダー（作者の指示 2026-11-05）：日曜始まりの5週。選べない日（休み・前の手続きより前）は押せない。
   期限を過ぎた日は「過ぎています」と示しつつ選べる。状態は色だけにせず、印と文字で示す（15.2）。 */
import { dayInfo, monthGrid, type DayInfo, type DayTag, type Hours } from '../core/calendar';
import { One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { fmtDay } from './guide';

const MARK: Partial<Record<DayTag, string>> = { closed: '休', holiday: '祝', past_deadline: '！', blocked: '×', unknown_hours: '？' };
const ORDER: DayTag[] = ['past_deadline', 'closed', 'holiday', 'blocked', 'unknown_hours'];

export function CalendarGrid({ today, current, min, deadline, hours, holidays, onPick }: {
  today: string; current?: string; min?: string | null; deadline?: string | null; hours?: Hours; holidays: Record<string, string>; onPick: (d: string) => void;
}) {
  const { level } = usePrefs();
  const weeks = monthGrid(today, 5);
  const used = new Set<DayTag>();
  const info = (d: string): DayInfo => { const x = dayInfo({ day: d, today, min, deadline, hours, holidays }); x.tags.forEach((t) => used.add(t)); return x; };
  const cells = weeks.map((w) => w.map((d) => (d ? info(d) : null)));
  const label = (x: DayInfo) => [fmtDay(x.day, level), ...x.tags.filter((t) => t !== 'today').map((t) => line(ui(('cal.tag.' + t) as UiKey), level)), x.holiday ?? ''].filter(Boolean).join('、');
  return (
    <div className="cal">
      <table className="cal__table">
        <caption className="label"><One k="cal.title" /></caption>
        <thead>
          <tr>{[0, 1, 2, 3, 4, 5, 6].map((i) => <th key={i} scope="col" abbr={line(ui(('cal.wdLong.' + i) as UiKey), level)}><One k={('cal.wd.' + i) as UiKey} /></th>)}</tr>
        </thead>
        <tbody>
          {cells.map((w, wi) => (
            <tr key={wi}>
              {w.map((x, i) => (
                <td key={i}>
                  {x && (
                    <button type="button" className={'cal__day' + (x.tags.includes('past_deadline') ? ' cal__day--late' : '') + (x.tags.includes('today') ? ' cal__day--today' : '')}
                      aria-pressed={current === x.day} disabled={!x.selectable} onClick={() => onPick(x.day)}>
                      {/* 見える数字と読み上げの名前を合わせるため、aria-label ではなく見えない文で日付全体を読ませる（2.5.3） */}
                      <span aria-hidden="true">{Number(x.day.slice(8))}</span>
                      <span className="sr-only">{label(x)}</span>
                      <span className="cal__mark" aria-hidden="true">{ORDER.filter((t) => x.tags.includes(t)).map((t) => MARK[t]).join('')}</span>
                    </button>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {used.size > 0 && (
        <ul className="cal__legend" aria-label={line(ui('cal.legend'), level)}>
          {ORDER.filter((t) => used.has(t)).map((t) => <li key={t}><span aria-hidden="true" className="cal__mark">{MARK[t]}</span> <One k={('cal.tag.' + t) as UiKey} /></li>)}
        </ul>
      )}
    </div>
  );
}
