/* 報告ボタン（作者の指示 2026-11-06 A-9）。手続き・できごとのページの下に「案内とちがうところを知らせる」。
   シート：自由記述・送る・送ったら「ありがとうございます」。名前・連絡先は聞かない。
   送るのは { path, scene, text, level, at, steps } だけ（worker/report.ts）。steps はいまのできごとの手続きの状態と段階（B-5。答え・日付・場所の名前は入れない）。作者が /review で見て、データを直す。 */
import { useState } from 'react';
import { DATA } from '../core/data';
import { sharePath } from '../core/scene';
import type { PlanRecord } from '../core/entry';
import { currentOf, type Occurrence } from '../core/occurrence';
import { openCardOf, reportSteps } from '../core/reportSteps';
import { REPORT_KINDS, type ReportKind } from '../core/reportKinds';
import type { UiKey } from '../i18n/text';
import { Bi, One } from '../i18n/Ruby';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { Sheet } from './Sheet';
import { FlagIcon } from './icons';

const MAX = 2000;
const BUILD = (import.meta.env?.VITE_BUILD as string | undefined) ?? 'dev';

/** 場面の id（できごとの id か、場面の QR の id）。無ければ null */
function sceneOf(path: string): string | null {
  const s = sharePath(path, (id) => DATA().cards.find((c) => c.id === id)?.place);
  const m = /^\/(?:e|s)\/([A-Za-z0-9_-]+)$/.exec(s);
  return m ? m[1] : null;
}

/** いまのできごとの plan（/e/{id} はその出来事、/c/{id} は引っ越しの保存の plan） */
function planOf(v: ReturnType<typeof usePrefs>['vault'], scene: string | null): Record<string, PlanRecord> {
  if (scene && /^E-/.test(scene) && scene !== 'E-move') {
    const occ = currentOf(v.entries('occurrences').map(([, o]) => o as Occurrence), scene);
    return occ?.plan ?? {};
  }
  return Object.fromEntries(v.entries('plan')) as Record<string, PlanRecord>;
}

export function ReportButton({ path }: { path: string }) {
  const { level, vault } = usePrefs();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<ReportKind | null>(null);
  const [ref, setRef] = useState('');
  const card = openCardOf(path);
  const cardTitle = card ? DATA().cards.find((c) => c.id === card)?.title : undefined;
  // 種類を選べば、文は無くても送れる（「そのほか」は文が要る）
  const canSend = !!text.trim() || (!!kind && kind !== 'other');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'busy'>('idle');
  const send = async () => {
    setState('sending');
    try {
      const r = await fetch('/api/report', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, scene: sceneOf(path), text: text.trim(), level: level.id, at: new Date().toISOString(), ...(kind ? { kind } : {}), ...(card ? { card } : {}), build: BUILD, steps: reportSteps(planOf(vault, sceneOf(path)), openCardOf(path)) }),
      });
      // 成功は 201 ＋ JSON { ok: true } だけ。SPA の代わりの HTML（200）などは成功にしない（入力は残す）
      let ok = false;
      if (r.status === 201 && /^application\/json/i.test(r.headers.get('content-type') ?? '')) {
        try { const b = (await r.json()) as { ok?: unknown; ref?: unknown } | null; ok = b?.ok === true; if (ok && typeof b?.ref === 'string') setRef(b.ref); } catch { ok = false; }
      }
      setState(ok ? 'sent' : r.status === 429 ? 'busy' : 'error');
      if (ok) { setText(''); setKind(null); }
    } catch { setState('error'); }
  };
  return (
    <>
      <button type="button" className="pagenav__btn" onClick={() => { setOpen(true); setState('idle'); }}><FlagIcon /><One k="report.open" /></button>
      {open && (
        <Sheet title={<One k="report.title" />} onClose={() => setOpen(false)}>
          {state === 'sent' ? (
            <div role="status"><p><Bi k="report.thanks" /></p>{ref && <p className="sub"><One k="report.ref" /><span lang="en">{ref}</span></p>}</div>
          ) : (
            <>
              {cardTitle && <p><One k="report.about" /><strong><Bi t={cardTitle} /></strong></p>}
              <fieldset className="group">
                <legend><One k="report.kind" /></legend>
                <div className="chips">
                  {REPORT_KINDS.map((k) => (
                    <button key={k} type="button" className="seg" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}><One k={('report.kind.' + k) as UiKey} /></button>
                  ))}
                </div>
              </fieldset>
              <p className="sub"><Bi k="report.note" /> <Bi k="report.optional" /></p>
              <label className="qrfield">
                <span className="label"><One k="report.label" /></span>
                <textarea className="field report__text" rows={5} maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} aria-describedby="report-count" />
                <span id="report-count" className="sub">{text.length} / {MAX}</span>
              </label>
              {state === 'error' && <p role="alert"><Bi k="report.error" /></p>}
              {state === 'busy' && <p role="alert"><Bi k="report.busy" /></p>}
              <button type="button" className="k-answer k-answer--primary" disabled={!canSend || state === 'sending'} onClick={() => void send()}>
                {state === 'sending' ? line(ui('report.sending'), level) : <Bi k="report.send" />}
              </button>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
