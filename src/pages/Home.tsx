/* 入口（SPEC 6A.1）。開いたときの出し分けは App（src/core/entry.ts）で行う。
   ここに来るのは、初めての人・入口にもどった人・すべて済んだ人。進捗があれば、続きへの入口を上に出す。 */
import type { ReactNode } from 'react';
import { DATA } from '../core/data';
import STRINGS from '../../data/ui/strings.json';
import type { UiKey } from '../i18n/text';
import { Bi } from '../i18n/Ruby';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';
import { useHiddenEvents } from '../guide/catalogue';
import { LocationAsk, NearBand } from '../ui/Location';

type Item = { key: string; title: ReactNode; icon: string; to: string; menu: number };
/** 固定の項目（ごみ・書類・病院・探す）。menu は、できごとの menu（data/events.json）と同じ並びの番号（作者 11/6 A-10：よくある順。探すは最後） */
const FIXED: Record<string, Item> = {
  gomi: { key: 'gomi', title: <Bi phrase k="home.gomi" />, icon: 'bin', to: '/gomi', menu: 2 },
  letter: { key: 'letter', title: <Bi phrase k="home.letter" />, icon: 'letter', to: '/letter', menu: 3 },
  clinic: { key: 'clinic', title: <Bi phrase k="clinic.home" />, icon: 'clinic', to: '/clinic', menu: 4 },
  search: { key: 'search', title: <Bi phrase k="home.search" />, icon: 'search', to: '/search', menu: 999 },
};
const groupKey = (g: string): UiKey | null => (('home.group.' + g) in STRINGS ? ('home.group.' + g) as UiKey : null);

/** まとめた項目の中（/g/{group}）：その group の出来事を並べる（作者 11/7 K-16） */
export function GroupPage({ group }: { group: string }) {
  useFocusTitle('group:' + group);
  const hidden = useHiddenEvents();
  const events = DATA().events.filter((e) => e.status === 'built' && e.menu !== undefined && e.group === group && !hidden.has(e.id)).sort((a, b) => a.menu! - b.menu!);
  const key = groupKey(group);
  if (!key || !events.length) return null;
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k={key} /></h1></div>
      <ul className="list" role="list">
        {events.map((e) => <li key={e.id}><Link to={'/e/' + e.id} className="k-answer"><img src={art(e.illustration)} alt="" /><Bi phrase t={e.title} /></Link></li>)}
      </ul>
    </>
  );
}

/** 引っ越し（E-move）は今までどおり /move。ほかの built のイベントは共通の /e/{id} */
export function menuItems(hidden: ReadonlySet<string> = new Set()): Item[] {
  const events = DATA().events.filter((e) => e.status === 'built' && e.menu !== undefined && !hidden.has(e.id)).sort((a, b) => a.menu! - b.menu!);
  const count = (g: string) => events.filter((e) => e.group === g).length;
  const seen = new Set<string>();
  const list: Item[] = [];
  for (const e of events) {
    if (e.id === 'E-move') { list.push({ key: e.id, title: <Bi phrase k="home.move" />, icon: 'box', to: '/move', menu: e.menu! }); continue; }
    // 同じ group の出来事が2つ以上あるときは、まとめた1つの項目（/g/{group}）。名前は strings の home.group.{group}
    if (count(e.group) > 1 && groupKey(e.group)) {
      if (seen.has(e.group)) continue;
      seen.add(e.group);
      list.push({ key: 'g-' + e.group, title: <Bi phrase k={groupKey(e.group)!} />, icon: e.illustration, to: '/g/' + e.group, menu: e.menu! });
      continue;
    }
    list.push({ key: e.id, title: <Bi phrase t={e.title} />, icon: e.illustration, to: '/e/' + e.id, menu: e.menu! });
  }
  // 固定の項目は、同じ group の出来事が入口のメニューにあるときは出さない（出来事のほうを使う）
  const fixed = [FIXED.gomi, FIXED.clinic, FIXED.letter, FIXED.search].filter((f) => !events.some((e) => e.group === f.key));
  return [...list, ...fixed].sort((a, b) => a.menu - b.menu);
}
export const LINKS = [
  { k: 'home.about', to: '/info/about' },
  { k: 'home.disclaimer', to: '/info/disclaimer' },
  { k: 'privacy.link', to: '/info/privacy' },
] as const;

export function Home({ hasProgress, continueTo = '/now' }: { hasProgress: boolean; continueTo?: string }) {
  useFocusTitle('home');
  const hidden = useHiddenEvents();
  return (
    <>
      <div className="head">
        <h1 id="screen-title" tabIndex={-1}><Bi phrase k="home.title" /></h1>
      </div>
      {/* 位置（A-6）：使うかを一度だけ聞く。使うなら近くの区役所の帯 */}
      <LocationAsk />
      <NearBand />
      {hasProgress && <Link to={continueTo} className="k-answer k-answer--primary"><img src={art('calendar')} alt="" /><span className="k-answer__text"><Bi phrase k="home.continue" /></span></Link>}
      <nav aria-labelledby="screen-title">
        <ul className="tiles" role="list">
          {menuItems(hidden).map((m) => (
            <li key={m.key}>
              <Link to={m.to} className="tile">
                <img src={art(m.icon)} alt="" />
                <span className="tile__text">{m.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="links">
        {LINKS.map((l) => (
          <Link key={l.k} to={l.to} className="link"><Bi k={l.k} /></Link>
        ))}
        {import.meta.env.DEV && <Link to="/review" className="link"><Bi k="review.link" /></Link>}
      </div>
    </>
  );
}
