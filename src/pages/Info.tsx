/* 文だけの画面：範囲外・準備中・免責・このアプリについて。仮の文は「仮の文です」の印を付ける（docs/TODO.md で確認） */
import { Bi, One } from '../i18n/Ruby';
import { ui, type UiKey } from '../i18n/text';
import type { Text } from '../core/schema';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';

export const INFO_PAGES: Record<string, { title: UiKey; body: UiKey[]; icon: string; link?: { k: UiKey; href: string }; dev?: boolean; more?: { k: UiKey; body: UiKey[] } }> = {
  'out-of-scope': {
    title: 'page.outOfScope.title', body: ['page.outOfScope.body'], icon: 'cross',
    // 範囲外は細かく列挙せず、名古屋市の公式サイトへ（作者 11/6 I-1）
    link: { k: 'page.outOfScope.link', href: 'https://www.city.nagoya.jp/' },
  },
  // 準備中の一覧は出さない。公式サイトへ（作者 11/6 I-2）
  'coming-soon': { title: 'page.comingSoon.title', body: ['page.comingSoon.body'], icon: 'clock', link: { k: 'page.outOfScope.link', href: 'https://www.city.nagoya.jp/' } },
  disclaimer: { title: 'page.disclaimer.title', body: ['page.disclaimer.p1', 'page.disclaimer.p3', 'page.disclaimer.p5', 'page.disclaimer.p2', 'page.disclaimer.p4'], icon: 'logo' },
  // 使いやすさの決まり（WCAG など）は、開いたときだけ（K-52）
  about: { title: 'page.about.title', body: ['page.about.p1', 'page.about.p2'], icon: 'bulb', more: { k: 'info.a11yMore', body: ['page.about.p3'] } },
};

/** reason：範囲外の理由（イベントの範囲のルールの reason_when_false）。あれば本文の代わりに出す（一般の文は、ほかの画面と食い違うことがあるため） */
export function Info({ id, reason }: { id: string; reason?: Text }) {
  const page = INFO_PAGES[id];
  useFocusTitle('info:' + id);
  const draft = [page.title, ...page.body, ...(page.more?.body ?? [])].some((k) => ui(k).status === 'draft');
  return (
    <>
      <div className="art" aria-hidden="true">{page.icon === 'logo' ? <img src="/icons/kurashi-logo.svg" alt="" className="art__logo" /> : <img src={art(page.icon)} alt="" />}</div>
      <div className="head">
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k={page.title} /></h1>
      </div>
      {draft && <p className="draftmark"><Bi k="page.draftMark" /></p>}
      {page.dev && <div className="k-notice"><Bi k="page.devNote" /></div>}
      <div className="prose">
        {reason ? <p><Bi t={reason} /></p> : page.body.map((k) => <p key={k}><Bi k={k} /></p>)}
      </div>
      {page.more && !reason && (
        <details className="group__more">
          <summary><Bi k={page.more.k} /></summary>
          <div className="prose">{page.more.body.map((k) => <p key={k}><Bi k={k} /></p>)}</div>
        </details>
      )}
      {page.link && (
        <p><a className="link" href={page.link.href} target="_blank" rel="noopener noreferrer"><Bi k={page.link.k} /><span aria-hidden="true"> ↗</span><span className="sr-only"><One k="here.newTab" /></span></a></p>
      )}
      <div className="links">
        <Link to="/" className="link"><Bi k="nav.home" /></Link>
      </div>
    </>
  );
}
