/* QR から開いた場面（SPEC 9.8・6A.1、docs/QR_SCENES.md）。/s/{id}（古い /pack/{id} も）。
   開いたら、その場面のページから始める：
   - card_list：そこで行う手続きの一覧（約束した日が今日なら、付き添いの「窓口で」へのボタン）
   - start：アプリの決まったページ（/move・/gomi など）へ、そのまま移る（戻るで QR の URL に戻らないよう replace）
   開いた場面の id は保存の meta に残す（同意の前はメモリの中だけ。9.9）。URL には場面の id だけ（13.4）。 */
import { useEffect } from 'react';
import { visitPath, visitsToday } from '../core/accompany';
import { DATA } from '../core/data';
import { rememberScene, sceneById } from '../core/scene';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { CardRow } from '../ui/guide';
import { Link, useFocusTitle } from '../ui/router';

/** そこで行う手続きの一覧。約束した日が今日なら、付き添いへ（QR は「窓口で」、いまいる場所からは「行く前」） */
export function CardList({ place, stage = 'counter' }: { place: string; stage?: 'before' | 'counter' }) {
  const g = useGuide();
  const origin = typeof g.answers['Q-origin'] === 'string' ? (g.answers['Q-origin'] as string) : undefined;
  const cards = g.out.cards.filter((c) => c.card.place === place && c.state !== 'out_of_scope');
  // 約束した日が今日なら、付き添いの「窓口で」へ（QR_SCENES 2章）
  const today = visitsToday(g.out, DATA().objects, g.objects, origin, g.today).find((v) => v.place === place);
  return (
    <>
      {today && <Link to={visitPath(place, stage)} className="k-answer k-answer--primary"><img src={art('hall')} alt="" /><Bi phrase k={stage === 'counter' ? 'scene.toCounter' : 'here.toBefore'} /></Link>}
      <section aria-labelledby="scene-cards">
        <h2 id="scene-cards" className="label"><One phrase k="scene.cards" /></h2>
        <ul className="list" role="list">{cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
        <p className="sub"><Bi k="scene.cardsNote" /></p>
      </section>
      <Link to="/move" className="k-answer"><img src={art('box')} alt="" /><Bi phrase k="scene.toMove" /></Link>
    </>
  );
}

export function ScenePage({ id }: { id: string }) {
  const { vault: v } = usePrefs();
  const s = sceneById(id);
  useFocusTitle('scene:' + id);
  useEffect(() => {
    if (!s) return;
    const list = v.get<string[]>('meta', 'scenes') ?? [];
    if (list.at(-1) !== s.id) void v.put('meta', 'scenes', rememberScene(list, s.id));
    if (s.shows.type === 'start') { history.replaceState(null, '', s.shows.path); dispatchEvent(new PopStateEvent('popstate')); }
  }, [s?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!s) {
    return (
      <>
        <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="scene.notFound" /></h1></div>
      </>
    );
  }
  if (s.shows.type === 'start') return null;
  return (
    <>
      <div className="art" aria-hidden="true"><img src={art('hall')} alt="" className="art--big" /></div>
      <div className="head">
        <p className="eyebrow"><One k="scene.eyebrow" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase t={s.title} /></h1>
      </div>
      <CardList place={s.shows.place} />
    </>
  );
}
