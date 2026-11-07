/* 画面の下の道案内（作者 11/7・11/8：どの手続きの画面でも同じ形のボタンを1列に）。
   「いまの手続き」「一覧」「入口にもどる」「まちがいを知らせる」。関係のないボタンだけ省く（形と種類は同じ）。
   文は表示レベルの言語だけ（英語のときも英語だけ。2段にしない）。App の外枠が、どの画面にも1つ出す（pageNavOf）。 */
import { One } from '../i18n/Ruby';
import { Link } from './router';
import { BackIcon, HomeIcon, ListIcon } from './icons';
import { ReportButton } from './ReportSheet';

export interface NavSpec { now?: string; all?: string; home: boolean; report?: string }

export function PageNav({ now, all, home, report }: NavSpec) {
  return (
    <nav className="pagenav" aria-labelledby="pagenav-label">
      <span id="pagenav-label" className="sr-only"><One k="nav.label" /></span>
      {now && <Link to={now} className="pagenav__btn"><BackIcon /><One k="nav.nowShort" /></Link>}
      {all && <Link to={all} className="pagenav__btn"><ListIcon /><One k="nav.list" /></Link>}
      {home && <Link to="/" className="pagenav__btn"><HomeIcon /><One k="nav.home" /></Link>}
      {report && <ReportButton key={report} path={report} />}
    </nav>
  );
}
