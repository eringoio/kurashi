/* 「役に立ちましたか？」（作者の指示 2026-11-07。SPEC 13.4）：済んだ・行ってきたの結果の画面だけ。数だけを送る（文は送らない）。
   「いいえ」なら理由を1つ選べる。使われ方の数を送らないときは出さない */
import { useState } from 'react';
import { Bi, One } from '../i18n/Ruby';
import type { UiKey } from '../i18n/text';
import { countsAllowed, track } from './telemetry';

const WHY: [string, UiKey][] = [['wrong_info', 'rate.why.wrongInfo'], ['unclear', 'rate.why.unclear'], ['counter', 'rate.why.counter'], ['documents', 'rate.why.documents']];

export function Rate({ id }: { id: string }) {
  const [st, setSt] = useState<'ask' | 'why' | 'thanks'>('ask');
  if (!countsAllowed()) return null;
  const x = id.replace(/[^a-z0-9_-]/gi, '').slice(0, 40);
  return (
    <section className="rate" aria-labelledby={'rate-' + x}>
      <p id={'rate-' + x} className="label"><One k="rate.q" /></p>
      {st === 'ask' && (
        <div className="chips">
          <button type="button" className="seg" onClick={() => { track('helpful', { x, y: 'yes' }); setSt('thanks'); }}><One k="rate.yes" /></button>
          <button type="button" className="seg" onClick={() => { track('helpful', { x, y: 'no' }); setSt('why'); }}><One k="rate.no" /></button>
        </div>
      )}
      {st === 'why' && (
        <div className="chips">
          {WHY.map(([y, k]) => <button key={y} type="button" className="seg" onClick={() => { track('outcome', { x, y: 'why:' + y }); setSt('thanks'); }}><One k={k} /></button>)}
        </div>
      )}
      <p role="status" className="sub">{st === 'thanks' && <Bi k="rate.thanks" />}</p>
    </section>
  );
}
