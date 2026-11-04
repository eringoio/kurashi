/* 写す層：エンジン・データ契約の型 → 部品の型（types.ts）。読み替えはここ1か所だけ。
   契約の counter→window、link→web、持ち物 held→have、reissue_waiting→reissue_wait。
   根拠（evidence）の status が verified でなければ「要確認」の印（mode が verified の見本表示のときは出さない）。 */
import type { Card, Evidence, Question } from '../../core/schema';
import type { BelongingVM, ContactVM, HoldStatus, LifeGuideVM, MethodKind, MethodVM, PickOptionVM, T, UrgentActionVM } from './types';

type Mode = 'public' | 'verified';
type CardContact = NonNullable<Card['urgent']>['contacts'][number];

export const unverified = (e: Evidence, mode: Mode): boolean => mode !== 'verified' && e.status !== 'verified';

export function toContact(c: CardContact): ContactVM {
  return { kind: c.type === 'phone' ? 'phone' : 'web', label: c.label as T, value: c.value };
}

export function toUrgent(card: Card, onDone: () => void): UrgentActionVM | null {
  if (!card.urgent) return null;
  return { id: card.id, title: card.title as T, why: card.urgent.text as T, contacts: card.urgent.contacts.map(toContact), onDone };
}

export const toPickOptions = (q: Question): PickOptionVM[] => q.options.map((o) => ({ id: String(o.value), label: o.label as T, art: o.icon }));

const METHOD: Record<NonNullable<Card['methods']>[number]['type'], MethodKind> = { counter: 'window', online: 'online', mail: 'mail', phone: 'phone' };
/** 手続きの方法。when（使える条件）があるものは、エンジンがまだ判定していないので「要確認」にして出す */
export function toMethods(card: Card, mode: Mode): MethodVM[] {
  return (card.methods ?? []).map((m, i) => ({
    id: m.type + '-' + i,
    kind: METHOD[m.type],
    label: m.text as T,
    needs: [],
    unverified: unverified(m.evidence, mode) || !!m.when,
  }));
}

/** 代わりの書類の案内（カード単位）。文だけを返す */
export const toAlternatives = (card: Card, mode: Mode): { text: T; unverified: boolean }[] =>
  (card.alternatives ?? []).map((a) => ({ text: a.text as T, unverified: unverified(a.evidence, mode) }));

/** 持ち物の状態の名前の読み替え（契約 → 部品） */
const HOLD: Record<string, HoldStatus> = { held: 'have', lost: 'lost', stopped: 'stopped', reissue_waiting: 'reissue_wait', unknown: 'unknown' };
export const toHold = (s: string | undefined): HoldStatus => HOLD[s ?? 'unknown'] ?? 'unknown';
export const toBelonging = (b: { id: string; title: T; illustration?: string; state?: string }): BelongingVM => ({ id: b.id, label: b.title, art: b.illustration, status: toHold(b.state) });

/** 日を聞かない案内（kind: guide） */
export function toGuide(card: Card, mode: Mode): LifeGuideVM {
  void mode;
  return { kind: 'consult', title: card.title as T, points: [card.summary as T, card.where.text as T] };
}
