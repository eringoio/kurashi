/* 手続きの共通部品の見本ページ（/dev/patterns）。開発のときだけ。App.tsx が import.meta.env.DEV のときだけ読み込む。
   見本データは src/ui/patterns/fixtures.ts。引っ越し・財布の紛失・結婚を、同じ部品で並べる。 */
import { useState, type ReactNode } from 'react';
import { Bi } from '../i18n/Ruby';
import { BelongingStatus, LifeGuide, MethodChooser, MultiPick, StepRelations, UnknownNotice, UrgentAction, WaitingProgress } from '../ui/patterns';
import * as F from '../ui/patterns/fixtures';
import type { HoldStatus, T } from '../ui/patterns/types';
import { ResultView, StateLabel, TrustMark, type StateKey } from '../ui/guide';
import { One } from '../i18n/Ruby';
import { useFocusTitle } from '../ui/router';

const COLORS = ['paper', 'sand', 'white', 'ink', 'ink-subtle', 'line-dim', 'blue', 'blue-tint', 'orange', 'orange-tint', 'red', 'art-pink', 'art-mint', 'art-sky', 'art-butter'];
const STATES: StateKey[] = ['today', 'check', 'ask', 'wait', 'later', 'info', 'done', 'excluded'];

const Case = ({ title, children }: { title: T; children: ReactNode }) => (
  <section className="pt-case"><h2><Bi phrase t={title} /></h2>{children}</section>
);

export default function DevPatterns() {
  useFocusTitle('dev-patterns');
  const [picked, setPicked] = useState<string[]>(['cash', 'zairyu']);
  const [status, setStatus] = useState<HoldStatus>(F.walletBelonging.status);
  const [police, setPolice] = useState<string | null>('koban');
  const [inMethod, setInMethod] = useState<string | null>(null);
  const [marriageMethod, setMarriageMethod] = useState<string | null>(null);
  const [found, setFound] = useState(false);
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase t={F.pageText.title} /></h1></div>
      <p className="pt-sample"><Bi t={F.pageText.intro} /></p>

      {/* 基本の部品（作者 11/6 H-4：いまの実装をデザインシステムにする。色の名前は tokens.css の変数） */}
      <Case title={F.pageText.basics}>
        <h3><Bi t={F.pageText.colors} /></h3>
        <ul className="dp-swatches">
          {COLORS.map((c) => <li key={c}><span className="dp-swatch" style={{ background: 'var(--' + c + ')' }} /><code>--{c}</code></li>)}
        </ul>
        <h3><Bi t={F.pageText.buttons} /></h3>
        <div className="list">
          <button type="button" className="k-answer"><Bi phrase t={F.pageText.answer} /></button>
          <button type="button" className="k-answer k-answer--primary"><Bi phrase t={F.pageText.primary} /></button>
        </div>
        <div className="chips">
          <button type="button" className="seg" aria-pressed="true"><Bi t={F.pageText.seg} /></button>
          <button type="button" className="seg" aria-pressed="false"><Bi t={F.pageText.seg} /></button>
        </div>
        <h3><Bi t={F.pageText.states} /></h3>
        <div className="chips">{STATES.map((k) => <StateLabel key={k} k={k} ob="legal" />)}</div>
        <h3><Bi t={F.pageText.marks} /></h3>
        <p><TrustMark e={{ status: 'ai_checked' }} /> <One k="pat.aiChecked" />　<TrustMark e={{ status: 'verified' }} /> <One k="trust.human" />　<One k="src.status.needs_check" /></p>
        <div className="k-notice" role="note"><Bi t={F.pageText.notice} /></div>
      </Case>

      <Case title={F.pageText.wallet}>
        <UrgentAction a={F.walletUrgent} />
        <MultiPick legend={F.walletPick.legend} options={F.walletPick.options} selected={picked} onChange={setPicked} mergeNote />
        <BelongingStatus item={{ ...F.walletBelonging, status }} onChange={setStatus} />
        <h3><Bi t={F.pageText.police} /></h3>
        <MethodChooser methods={F.policeMethods} value={police} onChange={setPolice} />
        <WaitingProgress w={F.walletWait} />
        <UnknownNotice u={F.walletUnknown} />
        <h3><Bi t={F.pageText.result} /></h3>
        {found ? (
          <ResultView eyebrow="res.answer.eyebrow" title={<Bi t={F.pageText.found} />} sub={<Bi t={F.pageText.foundSub} />} onNext={() => setFound(false)} />
        ) : (
          <button type="button" className="k-answer" onClick={() => setFound(true)}><Bi phrase t={F.pageText.found} /></button>
        )}
      </Case>

      <Case title={F.pageText.move}>
        <LifeGuide g={F.moveGuide} />
        <h3><Bi t={F.pageText.order} /></h3>
        <StepRelations steps={F.moveSteps} />
        <h3><Bi t={F.pageText.nhiMethod} /></h3>
        <MethodChooser methods={F.moveMethods} value={inMethod} onChange={setInMethod} />
      </Case>

      <Case title={F.pageText.marriage}>
        <LifeGuide g={F.marriageGuide} />
        <MethodChooser methods={F.marriageMethods} value={marriageMethod} onChange={setMarriageMethod} />
        <StepRelations steps={F.marriageSteps} />
        <UnknownNotice u={F.marriageUnknown} />
      </Case>
    </>
  );
}
