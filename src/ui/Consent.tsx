/* 保存の同意（SPEC 9.9）：最初に進捗が生まれたとき、画面をふさがない形で一度だけ聞く */
import { useState } from 'react';
import { Bi } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';

export function Consent({ onLive }: { onLive: (s: string) => void }) {
  const { vault: v, level } = usePrefs();
  const [more, setMore] = useState(false);
  if (!v.shouldAskConsent()) return null;
  const L = (k: UiKey) => line(ui(k), level);
  return (
    <section className="consent" aria-labelledby="consent-q">
      <p className="consent__q" id="consent-q"><Bi k="consent.q" /></p>
      <p className="consent__note"><Bi k="consent.note" /></p>
      <div className="pair">
        <button type="button" className="k-answer k-answer--primary" onClick={async () => { await v.keep(); onLive(L('consent.keptNote')); }}><Bi phrase k="consent.keep" /></button>
        <button type="button" className="k-answer" onClick={async () => { await v.dontKeep(); onLive(L('consent.noNote')); }}><Bi phrase k="consent.no" /></button>
      </div>
      <button type="button" className="link" aria-expanded={more} onClick={() => setMore(!more)}><Bi k="consent.more" /></button>
      {more && (
        <>
          <p className="consent__note"><Bi k="consent.detail" /></p>
          <button type="button" className="link" onClick={async () => { await v.keepNothing(); onLive(L('consent.noNote')); }}><Bi k="consent.nothing" /></button>
        </>
      )}
    </section>
  );
}
