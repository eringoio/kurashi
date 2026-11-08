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

/** 本人の答え（profile）だけで、範囲のルールが「範囲外」と決まっているできごとか。
    未回答（U）は範囲外にしない（国籍を推測しない）。できごとの中の答え（occurrence）は見ない */
export function eventOutOfScope(event: EventDef, profile: Record<string, Value>): boolean {
  if (!event.scope_rule) return false;
  const data = DATA();
  return run(data, { answers: answersFor(null, profile, data.questions), objects: {}, plan: {}, createdOn: null, today: todayJst(), mode: 'public', event }).scope === 'F';
}

/** 入口・探すの出し分け：本人の答えで範囲外と決まっているできごとの id */
export function useHiddenEvents(): Set<string> {
  const { vault: v } = usePrefs();
  const rev = v.rev;
  return useMemo(() => {
    const profile = Object.fromEntries(v.entries('profile')) as Record<string, Value>;
    return new Set(builtEvents().filter((e) => e.id !== MOVE && eventOutOfScope(e, profile)).map((e) => e.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, rev]);
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
      // 範囲外のできごと（例：日本国籍の人の在留期間の更新）は、探す・一覧に出さない。カードは、ほかのできごとにあればそちらで出す
      if (event.id !== MOVE && eventOutOfScope(event, profile)) continue;
      views = views.filter((c) => event.card_ids.includes(c.card.id) && !seen.has(c.card.id));
      views.forEach((c) => seen.add(c.card.id));
      if (views.length) groups.push({ event, base: event.id === MOVE ? '/c/' : '/e/' + event.id + '/c/', views });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, v, rev]);
}
