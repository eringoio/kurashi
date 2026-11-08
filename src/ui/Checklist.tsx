/* 簡単な確認項目のチェックボックス（v0.5.35）。
   - 全体の画面の記録と、手続きの中の物（parts）に使う。案内も正式な手続きも同じ（v0.5.36：4つの状態の選択はやめた）
   - チェック = 済んだ（status done）、外す = まだ（todo）。保存は今までの PlanRecord の status・parts のまま（Vault を通る）
   - 前に「対応中」（preparing など）だった物はチェックなしで出し、値は押すまで変えない。「該当しない」（dismissed）は控えめな印だけ
   - 本物の input type=checkbox（読み上げ・キーボード）。見た目は k-check__box。押せる大きさは --target-min */
import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Text } from '../core/schema';
import { Bi, One } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { fill } from './guide';
import { Link } from './router';
import type { Track } from '../core/overview';

/** チェックボックスだけ（名前は隣のリンクや文。読み上げの名前は name） */
export function CheckBox({ id, name, checked, disabled, onChange, children }: { id?: string; name: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; children?: ReactNode }) {
  // 押した結果はすぐ出す（保存が戻ってくるまで、もとの表示に戻さない）
  const [local, setLocal] = useState<boolean | null>(null);
  useEffect(() => { if (local === checked) setLocal(null); }, [local, checked]);
  const on = local ?? checked;
  return (
    <label className="ck__hit">
      <input id={id} type="checkbox" className="ck__input" aria-label={name} checked={on} disabled={disabled} onChange={(e) => { setLocal(e.target.checked); onChange(e.target.checked); }} />
      <span className="k-check__box ck__box" aria-hidden="true">{on ? '✓' : ''}</span>
      {children && <span className="ck__text">{children}</span>}
    </label>
  );
}

/** 「該当しない」の控えめな印（前に選んだ人の記録を見せる） */
export const NaMark = () => <span className="ck__na"><One k="ov.track.na" /></span>;

export interface CheckItem { id: string; label: Text; track: Track; to?: string | null; extra?: ReactNode }

/** チェックリスト（入居・退去の parts など）。数はこの一覧の中だけ（手続きが済んだ割合ではない）。
    押した結果はすぐ画面に出し（pending）、保存が戻ってきたら消す。onToggle には、まだ戻ってきていない物も渡す */
export function Checklist({ items, onToggle, context }: { items: CheckItem[]; onToggle: (id: string, done: boolean, pending: Record<string, Track>) => void; context?: string }) {
  const { level } = usePrefs();
  const base = useId() + '-';
  const [pending, setPending] = useState<Record<string, Track>>({});
  const trackOf = (i: CheckItem) => pending[i.id] ?? i.track;
  // 保存の結果が画面に戻ってきた物は pending から外す
  useEffect(() => {
    const left = Object.fromEntries(Object.entries(pending).filter(([k, t]) => items.find((i) => i.id === k)?.track !== t));
    if (Object.keys(left).length !== Object.keys(pending).length) setPending(left);
  }, [items, pending]);
  const counted = items.filter((i) => trackOf(i) !== 'na');
  const done = counted.filter((i) => trackOf(i) === 'done').length;
  return (
    <>
      {counted.length > 1 && <p className="sub ck__count"><One t={fill(fill(ui('ck.count'), 'n', () => String(done)), 'm', () => String(counted.length))} /></p>}
      <ul className="ck-list" role="list">
        {items.map((i) => {
          const on = trackOf(i) === 'done';
          const id = base + i.id;
          const toggle = (v: boolean) => { onToggle(i.id, v, pending); setPending((p) => ({ ...p, [i.id]: v ? 'done' : 'todo' })); };
          return (
            <li key={i.id} className={'ck-item' + (on ? ' ck-item--done' : '')}>
              <CheckBox id={id} name={line(i.label, level) + (context ? '：' + context : '')}checked={on} onChange={toggle} />
              {/* くわしい案内があれば名前はリンク。無ければ名前を押してもチェックできる */}
              {i.to ? <span className="ck__name"><Link to={i.to} className="link"><Bi phrase t={i.label} /></Link></span> : <label htmlFor={id} className="ck__name"><Bi phrase t={i.label} /></label>}
              {trackOf(i) === 'na' && <NaMark />}
              {i.extra}
            </li>
          );
        })}
      </ul>
    </>
  );
}
