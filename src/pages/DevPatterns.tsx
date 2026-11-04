/* 手続きの共通部品の見本ページ（/dev/patterns）。開発のときだけ。App.tsx が import.meta.env.DEV のときだけ読み込む。
   見本データは src/ui/patterns/fixtures.ts。引っ越し・財布の紛失・結婚を、同じ部品で並べる。 */
import { useState, type ReactNode } from 'react';
import { Bi } from '../i18n/Ruby';
import { BelongingStatus, LifeGuide, MethodChooser, MultiPick, StepRelations, UnknownNotice, UrgentAction, WaitingProgress } from '../ui/patterns';
import * as F from '../ui/patterns/fixtures';
import type { HoldStatus, T } from '../ui/patterns/types';
import { ResultView } from '../ui/guide';
import { useFocusTitle } from '../ui/router';

const Case = ({ title, children }: { title: T; children: ReactNode }) => (
  <section className="pt-case"><h2><Bi t={title} /></h2>{children}</section>
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
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi t={F.pageText.title} /></h1></div>
      <p className="pt-sample"><Bi t={F.pageText.intro} /></p>

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
          <button type="button" className="k-answer" onClick={() => setFound(true)}><Bi t={F.pageText.found} /></button>
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
