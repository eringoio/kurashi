/* 保存の同意（SPEC 9.9）：最初に進捗が生まれたとき、本文の上の細い帯で一度だけ聞く。画面はふさがない */
import { Bi } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { Link } from './router';

export function Consent({ onLive }: { onLive: (s: string) => void }) {
  const { vault: v, level } = usePrefs();
  if (!v.shouldAskConsent()) return null;
  const L = (k: UiKey) => line(ui(k), level);
  return (
    <section className="consent" aria-labelledby="consent-q">
      <p className="consent__q" id="consent-q"><Bi k="consent.q" /></p>
      <div className="pair">
        <button type="button" className="k-answer k-answer--primary" onClick={async () => { await v.keep(); onLive(L('consent.keptNote')); }}><Bi phrase k="consent.keep" /></button>
        <button type="button" className="k-answer" onClick={async () => { await v.dontKeep(); onLive(L('consent.noNote')); }}><Bi phrase k="consent.no" /></button>
      </div>
      <p className="consent__note"><Bi k="consent.note" /> <Link to="/info/privacy" className="link"><Bi k="consent.privacy" /></Link></p>
    </section>
  );
}
