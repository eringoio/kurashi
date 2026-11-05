/* 画面の外枠：上の帯（名前・相談窓口・設定）、見るだけの帯、本文、読み上げの知らせ（aria-live）、シート */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DRAFTS_LOADED } from './core/data';
import { chooseEntry, type Resume } from './core/entry';
import { useGuide, type Guide } from './guide/useGuide';
import { Bi, One } from './i18n/Ruby';
import { usePrefs } from './storage/prefs';
import { Consent } from './ui/Consent';
import { Link, usePath } from './ui/router';
import { Settings } from './ui/Settings';
import { GlobeIcon, HelpIcon } from './ui/icons';
import { Sheet } from './ui/Sheet';
import { Home } from './pages/Home';
import { Info, INFO_PAGES } from './pages/Info';
import { Move } from './pages/Move';
import { All, Now } from './pages/Plan';
import { CardPage, EventCardPage } from './pages/CardPage';
import { EventEntry } from './pages/EventEntry';
import { PromisePage, ResumePage } from './pages/Entry';
import { Review } from './pages/Review';
import { Search } from './pages/Search';
import { Gomi } from './pages/Gomi';
import { SidePanel, useWide } from './ui/SidePanel';
import { VisitPage } from './pages/Visit';
import { parseVisitPath } from './core/accompany';
import { parseScenePath } from './core/scene';
import { ScenePage } from './pages/Scene';
import { QrMaker } from './pages/QrMaker';
import { Here } from './pages/Here';
import { Letter } from './pages/Letter';
import { CalendarPage } from './pages/Calendar';
import { ClinicPage } from './pages/Clinic';

/** 部品の見本ページ。開発のときだけ（本番ビルドには入らない） */
const DevPatterns = import.meta.env.DEV ? lazy(() => import('./pages/DevPatterns')) : null;

/** 入口の出し分けの入力（6A.1）。保存した進捗から作る */
function entryOf(g: Guide, resume: Resume | null, hasProgress: boolean) {
  const open = g.out.cards.filter((c) => c.section && c.section !== 'later');
  return chooseEntry({
    today: g.today, url: null, resume, hasProgress,
    plan: Object.values(g.plan),
    waiting: g.out.cards.some((c) => c.section === 'wait'),
    allDone: open.length > 0 && open.every((c) => c.section === 'done'),
  });
}
/** 出し分けの結果の行き先。入口のメニュー・すべて済んだは、そのまま入口 */
const ENTRY_PATH: Record<string, string> = { resume_confirm: '/resume', promise_today: '/today', promise_past: '/past', waiting: '/now', now: '/now' };

function Route({ path, onLive }: { path: string; onLive: (s: string) => void }) {
  const g = useGuide();
  const { vault: v } = usePrefs();
  const info = /^\/info\/([a-z-]+)$/.exec(path);
  if (info && INFO_PAGES[info[1]]) return <Info id={info[1]} />;
  const move = /^\/move(?:\/(from|objects|basis|check|q|nochange|unsure))?$/.exec(path);
  if (move) return <Move step={move[1] ?? ''} />;
  const evCard = /^\/e\/(E-[a-z0-9-]+)\/c\/([a-z0-9-]+)$/.exec(path);
  if (evCard) return <EventCardPage key={evCard[1] + evCard[2]} eventId={evCard[1]} id={evCard[2]} onLive={onLive} />;
  const ev = /^\/e\/(E-[a-z0-9-]+)(\/all)?$/.exec(path);
  if (ev) return <EventEntry key={ev[1] + (ev[2] ?? '')} eventId={ev[1]} view={ev[2] ? 'all' : 'now'} onLive={onLive} />;
  const card = /^\/c\/([a-z0-9-]+)$/.exec(path);
  if (card) return <CardPage key={card[1]} id={card[1]} onLive={onLive} />;
  const scene = parseScenePath(path);
  if (scene) return <ScenePage key={scene} id={scene} />;
  const visit = parseVisitPath(path);
  if (visit) return <VisitPage key={path} place={visit.place} stage={visit.stage} onLive={onLive} />;
  if (path === '/now') return <Now />;
  if (path === '/all') return <All />;
  if (path === '/resume') return <ResumePage />;
  if (path === '/review') return <Review />;
  if (path === '/qr') return <QrMaker />;
  if (path === '/here') return <Here />;
  if (path === '/letter') return <Letter />;
  if (path === '/calendar') return <CalendarPage />;
  const clinic = /^\/clinic(?:\/(departments|before))?$/.exec(path);
  if (clinic) return <ClinicPage step={(clinic[1] ?? '') as '' | 'departments' | 'before'} />;
  if (path === '/search') return <Search />;
  if (path === '/gomi') return <Gomi />;
  if (DevPatterns && path === '/dev/patterns') return <Suspense fallback={null}><DevPatterns /></Suspense>;
  if (path === '/today' || path === '/past') {
    const e = entryOf(g, null, true);
    const ids = e.kind === 'promise_today' || e.kind === 'promise_past' ? e.card_ids : [];
    return <PromisePage past={path === '/past'} cardIds={ids} />;
  }
  return <Home hasProgress={v.hasProgress()} />;
}

export function App() {
  const { vault: v } = usePrefs();
  const path = usePath();
  const g = useGuide();
  const [sheet, setSheet] = useState<null | 'settings' | 'help'>(null);
  const [live, setLive] = useState('');
  const close = useCallback(() => setSheet(null), []);
  // 同じ文を続けて知らせるときも読まれるように、いったん空にする
  const onLive = useCallback((s: string) => { setLive(''); setTimeout(() => setLive(s), 50); }, []);

  // 開いたときに一度だけ、入口を出し分ける（6A.1）。URL で開いた画面（カード・QR など）はそのまま
  // 広い画面（デスクトップ）では、右に「全体」を並べる。いま・開いた項目のときだけ（全体の画面と、最初の道のりでは出さない）
  const wide = useWide();
  const side = wide && g.objectsDone && (path === '/now' || path.startsWith('/c/') || path === '/today' || path === '/past' || path.startsWith('/visit/'));
  const routed = useRef(false);
  useEffect(() => {
    if (routed.current) return;
    routed.current = true;
    if (location.pathname !== '/') return;
    const e = entryOf(g, v.get<Resume>('resume', 'value') ?? null, v.hasProgress());
    const to = e.kind === 'resume' ? e.resume.step : ENTRY_PATH[e.kind];
    if (to) { history.replaceState(null, '', to); dispatchEvent(new PopStateEvent('popstate')); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="k-root" style={{ display: 'contents' }}>
      <a className="skip" href="#main"><One k="app.skip" /></a>
      <header className="bar">
        <Link to="/" className="brand">
          <img src="/icons/logo.svg" alt="" />
          <span lang="en">kurashi</span>
          <span className="brand__tag"><One k="app.tag" /></span>
        </Link>
        <div className="bar__btns">
          <button type="button" className="pill pill--icon" onClick={() => setSheet('help')}><HelpIcon /><One k="nav.help" /></button>
          <button type="button" className="pill pill--icon" onClick={() => setSheet('settings')}><GlobeIcon /><One k="nav.settings" /></button>
        </div>
      </header>
      {DRAFTS_LOADED && <div className="draftband" role="note"><Bi k="draft.banner" /></div>}
      {v.mode === 'view_only' && (
        <div className="viewonly" role="status">
          <Bi k="viewonly.banner" />
          <button type="button" className="pill" onClick={() => { v.endViewOnly(); onLive(''); }}><One k="viewonly.end" /></button>
        </div>
      )}
      <div className={'shell' + (side ? ' shell--two' : '')}>
        <main className="col" id="main" tabIndex={-1}>
          {v.mode === 'unavailable' && <div className="k-notice" role="note"><Bi k="storage.unavailable" /></div>}
          {g.mode === 'verified' && <div className="k-notice" role="note"><Bi k="review.banner" /></div>}
          <Consent onLive={onLive} />
          <Route path={path} onLive={onLive} />
        </main>
        {side && <SidePanel current={path} />}
      </div>
      <div className="sr-only" aria-live="polite" role="status">{live}</div>
      {sheet === 'settings' && <Settings onClose={close} onLive={onLive} />}
      {sheet === 'help' && (
        <Sheet title={<One k="help.title" />} onClose={close}>
          <p className="draftmark"><Bi k="page.draftMark" /></p>
          <p><Bi k="help.body" /></p>
        </Sheet>
      )}
    </div>
  );
}
