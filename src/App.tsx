/* 画面の外枠：上の帯（名前・相談窓口・設定）、見るだけの帯、本文、読み上げの知らせ（aria-live）、シート */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DATA, DRAFTS_LOADED } from './core/data';
import STRINGS from '../data/ui/strings.json';
import { chooseEntry, continuePath, type Resume } from './core/entry';
import { legacyOccurrence, openEventPlans, type Occurrence } from './core/occurrence';
import type { Vault } from './storage/vault';
import { useGuide, type Guide } from './guide/useGuide';
import { Bi, One } from './i18n/Ruby';
import { usePrefs } from './storage/prefs';
import { Consent } from './ui/Consent';
import { Link, useFocusTitle, usePath } from './ui/router';
import { Settings } from './ui/Settings';
import { line, ui } from './i18n/text';
import { GlobeIcon, HelpIcon, ShareIcon } from './ui/icons';
import { HelpSheet } from './ui/HelpSheet';
import { ShareSheet } from './ui/ShareSheet';
import { useSeen, WordsButton, WordsPage } from './ui/Words';
import { pageWordIds } from './core/words';
import { GroupPage, Home } from './pages/Home';
import { Info, INFO_PAGES } from './pages/Info';
import { Move } from './pages/Move';
import { All, Now } from './pages/Plan';
import { CardPage, EventCardPage } from './pages/CardPage';
import { EventEntry } from './pages/EventEntry';
import { PromisePage, ResumePage } from './pages/Entry';
import { Review } from './pages/Review';
import { Search } from './pages/Search';
import { Gomi } from './pages/Gomi';
import { SidePanel, useSide } from './ui/SidePanel';
import { cardHome } from './guide/catalogue';
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

/** 手続きの進み具合があるか（入口の出し分けと「続きから」に使う）。「ことば」の記録（phrases）だけでは進み具合にしない
    （カード・病院を見ただけで、開いたときに引っ越しの質問へ送らないため。K-39） */
const guideProgress = (v: Pick<Vault, 'entries'>) => (['profile', 'plan', 'objects', 'items', 'occurrences'] as const).some((s) => v.entries(s).length > 0);

/** 入口の出し分けの入力（6A.1）。保存した進捗から作る */
function entryOf(g: Guide, resume: Resume | null, hasProgress: boolean, v: Pick<Vault, 'entries'>) {
  const open = g.out.cards.filter((c) => c.section && c.section !== 'later');
  return chooseEntry({
    today: g.today, url: null, resume, hasProgress,
    // 生活イベント（/e/...）で決めた行く日も入れる（引っ越しの plan と同じに扱う）
    plan: [...Object.values(g.plan), ...openEventPlans(v.entries('occurrences').map(([, o]) => o as Occurrence)).map((x) => x.plan)],
    waiting: g.out.cards.some((c) => c.section === 'wait'),
    allDone: open.length > 0 && open.every((c) => c.section === 'done'),
  });
}
/** 出し分けの結果の行き先。入口のメニュー・すべて済んだは、そのまま入口。now は続きの行き先（continueOf） */
const ENTRY_PATH: Record<string, string> = { resume_confirm: '/resume', promise_today: '/today', promise_past: '/past', waiting: '/now' };

/** 続きの行き先（K-39）：いちばん新しく始めた、閉じていないできごと。引っ越しは /now、ほかは /e/{id} */
function continueOf(g: Guide, v: Pick<Vault, 'entries' | 'get'>): string {
  const legacy = legacyOccurrence(g.answers, g.plan, DATA().questions, v.get<string>('dates', 'created_on') ?? null);
  return continuePath(v.entries('occurrences').map(([, o]) => o as Occurrence), legacy);
}

/** まとめた項目（/g/{group}）が無いとき（U12）。見出しと入口へのリンク */
function NotFound() {
  useFocusTitle('notfound');
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="ev.notFound" /></h1></div>
      <div className="links"><Link to="/" className="link"><Bi k="nav.home" /></Link></div>
    </>
  );
}

/** 古い道（/c/{id}）から、正しい道へ置きかえる（履歴を増やさない） */
function Redirect({ to }: { to: string }) {
  useEffect(() => { history.replaceState(null, '', to); dispatchEvent(new PopStateEvent('popstate')); }, [to]);
  return null;
}

function Route({ path, onLive }: { path: string; onLive: (s: string) => void }) {
  const g = useGuide();
  const { vault: v } = usePrefs();
  const info = /^\/info\/([a-z-]+)$/.exec(path);
  if (info && INFO_PAGES[info[1]]) return <Info id={info[1]} />;
  const move = /^\/move(?:\/(from|objects|basis|check|q|nochange|unsure))?$/.exec(path);
  if (move) return <Move step={move[1] ?? ''} />;
  const evCard = /^\/e\/(E-[a-z0-9-]+)\/c\/([a-z0-9-]+)$/.exec(path);
  if (evCard) return <EventCardPage key={evCard[1] + evCard[2]} eventId={evCard[1]} id={evCard[2]} onLive={onLive} />;
  const grp = /^\/g\/([a-z0-9-]+)$/.exec(path);
  if (grp) {
    // まとめた項目：2つ以上ならその一覧、1つならそのできごと、無ければ「ありません」（U12）
    const evs = DATA().events.filter((e) => e.status === 'built' && e.menu !== undefined && e.group === grp[1]);
    if (evs.length === 1) return <Redirect to={'/e/' + evs[0].id} />;
    return evs.length > 1 && ('home.group.' + grp[1]) in STRINGS ? <GroupPage key={grp[1]} group={grp[1]} /> : <NotFound />;
  }
  const ev = /^\/e\/(E-[a-z0-9-]+)(\/all)?$/.exec(path);
  if (ev) return <EventEntry key={ev[1] + (ev[2] ?? '')} eventId={ev[1]} view={ev[2] ? 'all' : 'now'} onLive={onLive} />;
  const card = /^\/c\/([a-z0-9-]+)$/.exec(path);
  if (card) {
    // 引っ越しに無いカードは、そのカードのあるできごとの画面で開く（U16）
    const home = cardHome(card[1]);
    if (home && home !== path) return <Redirect to={home} />;
    return <CardPage key={card[1]} id={card[1]} onLive={onLive} />;
  }
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
  if (path === '/words') return <WordsPage />;
  const clinic = /^\/clinic(?:\/(departments|before))?$/.exec(path);
  if (clinic) return <ClinicPage step={(clinic[1] ?? '') as '' | 'departments' | 'before'} />;
  if (path === '/search') return <Search />;
  if (path === '/gomi') return <Gomi />;
  if (DevPatterns && path === '/dev/patterns') return <Suspense fallback={null}><DevPatterns /></Suspense>;
  if (path === '/today' || path === '/past') {
    const e = entryOf(g, null, true, v);
    const ids = e.kind === 'promise_today' || e.kind === 'promise_past' ? e.card_ids : [];
    return <PromisePage past={path === '/past'} cardIds={ids} />;
  }
  return <Home hasProgress={guideProgress(v)} continueTo={continueOf(g, v)} />;
}

export function App() {
  const { vault: v, level } = usePrefs();
  const path = usePath();
  const g = useGuide();
  const [sheet, setSheet] = useState<null | 'settings' | 'help' | 'share'>(null);
  // 画面の大事な言葉を「ことば」に残す（道から決める。core/words.ts の pageWordIds）
  useSeen(pageWordIds(path));
  const [live, setLive] = useState('');
  const close = useCallback(() => setSheet(null), []);
  // 同じ文を続けて知らせるときも読まれるように、いったん空にする
  const onLive = useCallback((s: string) => { setLive(''); setTimeout(() => setLive(s), 50); }, []);

  // 開いたときに一度だけ、入口を出し分ける（6A.1）。URL で開いた画面（カード・QR など）はそのまま
  // 広い画面（デスクトップ）では、右に「全体」を並べる。いま・開いた項目のときだけ（全体の画面と、最初の道のりでは出さない）
  // 右に出すのは、いま（/now）・開いた項目（/c/*）・生活イベント（/e/*。全体を除く）。今日の予定・付き添いには出さない（K-36）
  const side = useSide(path);
  const routed = useRef(false);
  useEffect(() => {
    if (routed.current) return;
    routed.current = true;
    if (location.pathname !== '/') return;
    const e = entryOf(g, v.get<Resume>('resume', 'value') ?? null, guideProgress(v), v);
    const to = e.kind === 'resume' ? e.resume.step : e.kind === 'now' ? continueOf(g, v) : ENTRY_PATH[e.kind];
    if (to) { history.replaceState(null, '', to); dispatchEvent(new PopStateEvent('popstate')); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="k-root" style={{ display: 'contents' }}>
      <a className="skip" href="#main"><One k="app.skip" /></a>
      <header className="bar">
        {/* ロゴは帯だけ（A-4）：480px〜 ロゴ、〜479px マーク（280px 未満は文字だけ）。見えない方は display:none なので、読み上げの名前は「Kurashi」1つ */}
        <Link to="/" className="brand">
          <img src="/icons/kurashi-logo.svg" alt="Kurashi" className="brand__logo brand__logo--full" />
          <img src="/icons/kurashi-mark.svg" alt="Kurashi" className="brand__logo brand__logo--mark" />
          <span className="brand__tag"><One k="app.tag" /></span>
        </Link>
        <div className="bar__btns">
          {/* ことば（K-26）：どの画面からでも開ける。もどると元の画面と位置へ */}
          <WordsButton />
          {/* 共有はアイコンだけ（作者 11/6 A-5）。読み上げの名前は「共有」 */}
          <button type="button" className="pill pill--icon pill--only" aria-label={line(ui('share.title'), level)} onClick={() => setSheet('share')}><ShareIcon /></button>
          {/* 幅 480px 未満では、相談・設定もアイコンだけ（名前は見えない文で残す。作者 11/6：おすすめで進める） */}
          <button type="button" className="pill pill--icon" onClick={() => setSheet('help')}><HelpIcon /><span className="pill__text"><One k="nav.help" /></span></button>
          <button type="button" className="pill pill--icon" onClick={() => setSheet('settings')}><GlobeIcon /><span className="pill__text"><One k="nav.settings" /></span></button>
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
          <Route path={path} onLive={onLive} />
          <Consent onLive={onLive} />
          {/* 報告ボタン（A-9）は、各画面の下の道案内（PageNav）の中 */}
        </main>
        {side && <SidePanel current={path} />}
      </div>
      <div className="sr-only" aria-live="polite" role="status">{live}</div>
      {sheet === 'settings' && <Settings onClose={close} onLive={onLive} />}
      {sheet === 'help' && <HelpSheet onClose={close} />}
      {sheet === 'share' && <ShareSheet path={path} onClose={close} onLive={onLive} />}
    </div>
  );
}
