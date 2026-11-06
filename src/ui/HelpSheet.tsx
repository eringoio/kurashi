/* 相談窓口のシート（上の帯の「相談」。作者の指示 2026-11-06 I-4）。押すと電話がかかる。公式ページは新しいタブ */
import { HELP, telHref } from '../core/help';
import { Bi, One } from '../i18n/Ruby';
import { PhoneIcon } from './icons';
import { Sheet } from './Sheet';

export function HelpSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title={<One k="help.title" />} onClose={onClose}>
      <p><Bi k="help.body" /></p>
      <ul className="list help" role="list">
        {HELP().map((c) => (
          <li key={c.id} className="help__item">
            <p className="help__name"><Bi t={c.name} /></p>
            <p className="sub"><Bi t={c.what} /></p>
            <a className="k-answer help__tel" href={telHref(c.phone)}>
              <PhoneIcon />
              <span className="sr-only"><One k="clinic.call" /></span>
              <strong lang="en">{c.phone}</strong>
              <span className="sub"><One t={c.hours} /></span>
            </a>
            <a className="link" href={c.url} target="_blank" rel="noopener noreferrer"><One k="help.site" /><span className="sr-only"><One k="clinic.newTab" /></span></a>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
