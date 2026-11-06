/* 画面の下の道案内（作者 11/7：下のリンクが分かりにくい → 印つきのボタンを1列に）。
   「いまの手続き」「一覧」「まちがいを知らせる」。report に画面の path を渡すと、3つ目に ReportButton を出す。 */
import { Bi } from '../i18n/Ruby';
import { Link } from './router';
import { BackIcon, ListIcon } from './icons';
import { ReportButton } from './ReportSheet';

export function PageNav({ now, all, report }: { now: string; all: string; report?: string }) {
  return (
    <div className="pagenav">
      <Link to={now} className="pagenav__btn"><BackIcon /><Bi k="nav.nowShort" /></Link>
      <Link to={all} className="pagenav__btn"><ListIcon /><Bi k="nav.list" /></Link>
      {report && <ReportButton key={report} path={report} />}
    </div>
  );
}
