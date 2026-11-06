/* 公開しているできごと（built）ごとの手続きの一覧（K-38・U03）。探す画面と、/c/{id} の行き先に使う。
   引っ越し（E-move）のカードは今までどおり /c/{id}。ほかのできごとのカードは /e/{event}/c/{id}。
   同じカードがいくつかのできごとにあるときは、入口のメニューの順で最初のできごとで開く。 */
import { useMemo } from 'react';
import { DATA } from '../core/data';
import { todayJst } from '../core/date';
import { run, type CardView } from '../core/engine';
import type { EventDef } from '../core/schema';
import { answersFor, currentOf, listOccurrences, type Occurrence } from '../core/occurrence';
import type { Value } from '../core/schema';
import { usePrefs } from '../storage/prefs';
import { useGuide } from './useGuide';

const MOVE = 'E-move';

/** 公開しているできごと（入口のメニューの順。メニューに無いものは後ろ） */
export function builtEvents(): EventDef[] {
  return DATA().events.filter((e) => e.status === 'built').sort((a, b) => (a.menu ?? 999) - (b.menu ?? 999));
}

/** カードを開く道（そのカードが入っている最初の公開できごと）。どのできごとにも無ければ null */
export function cardHome(cardId: string): string | null {
  const e = builtEvents().find((x) => x.card_ids.includes(cardId));
  if (!e) return null;
  return e.id === MOVE ? '/c/' + cardId : '/e/' + e.id + '/c/' + cardId;
}

export interface CatalogueGroup { event: EventDef; base: string; views: CardView[] }

/** できごとごとの判定の結果（いまの答え・進捗で）。カードは最初のできごとにだけ入れる */
export function useCatalogue(): CatalogueGroup[] {
  const g = useGuide();
  const { vault: v } = usePrefs();
  const rev = v.rev;
  return useMemo(() => {
    const data = DATA();
    const today = todayJst();
    const profile = Object.fromEntries(v.entries('profile')) as Record<string, Value>;
    const stored = listOccurrences(v.entries('occurrences').map(([, o]) => o as Occurrence), null);
    const seen = new Set<string>();
    const groups: CatalogueGroup[] = [];
    for (const event of builtEvents()) {
      let views: CardView[];
      if (event.id === MOVE) views = g.out.cards;
      else {
        const occ = currentOf(stored, event.id);
        views = run(data, { answers: answersFor(occ, profile, data.questions), objects: {}, plan: occ?.plan ?? {}, createdOn: occ?.started_on ?? null, today, mode: g.mode, event }).cards;
      }
      views = views.filter((c) => event.card_ids.includes(c.card.id) && !seen.has(c.card.id));
      views.forEach((c) => seen.add(c.card.id));
      if (views.length) groups.push({ event, base: event.id === MOVE ? '/c/' : '/e/' + event.id + '/c/', views });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, v, rev]);
}
