/* 生活イベントの出来事の保存（src/guide/eventStore.ts）。
   レビューで再現した不具合：setPlan を続けて呼ぶと、前の保存を上書きして最後の手続きだけが残った。
   ここでは、続けて呼ぶ・一括で呼ぶ・出来事が無いときに同時に呼ぶ、のあとで保存を開き直し（再読み込み）、全部残っていることを確かめる。 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import type { Occurrence } from '../../src/core/occurrence';
import { eventStore } from '../../src/guide/eventStore';
import { Vault } from '../../src/storage/vault';

const Q = loadData().questions;
const CARDS = [{ id: 'a', data_version: 1 }, { id: 'b', data_version: 1 }, { id: 'c', data_version: 1 }];
const deps = { questions: Q, cards: CARDS, today: () => '2026-11-04' };
const EV = 'E-lost-wallet';
let idb: IDBFactory;
beforeEach(() => {
  idb = new IDBFactory();
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = idb;
});
/** 保存に同意した状態で開く */
async function kept() {
  const v = await Vault.open({ indexedDB: idb });
  await v.keep();
  return v;
}
/** 開き直す（ページの再読み込みと同じ：IndexedDB から読み直す） */
const reload = () => Vault.open({ indexedDB: idb });
const occs = (v: Vault) => v.entries('occurrences').map(([, o]) => o as Occurrence);

describe('出来事の保存（連続・一括・同時）', () => {
  it('setPlan を続けて呼んでも、前の手続きの日が消えない（再読み込み後も）', async () => {
    const v = await kept();
    const s = eventStore(v, EV, deps);
    // 画面と同じ形：最初に一度だけ store を作り、続けて呼ぶ（古い値に足して上書きしていた）
    for (const id of ['a', 'b', 'c']) await s.setPlan(id, { planned_on: '2026-11-06' });
    const w = await reload();
    const [o] = occs(w);
    expect(occs(w)).toHaveLength(1);
    expect(Object.keys(o.plan).sort()).toEqual(['a', 'b', 'c']);
    expect(Object.values(o.plan).every((p) => p.planned_on === '2026-11-06')).toBe(true);
  });

  it('setPlans で複数の手続きに一度に日を書く。前からある状態を消さない（再読み込み後も）', async () => {
    const v = await kept();
    const s = eventStore(v, EV, deps);
    await s.setPlan('a', { status: 'done' });
    await s.answer('Q-lost-items', ['cash_card']);
    await s.setPlans(['b', 'c'], { planned_on: '2026-11-07' });
    const [o] = occs(await reload());
    expect(o.plan.a.status).toBe('done');
    expect(o.plan.b.planned_on).toBe('2026-11-07');
    expect(o.plan.c.planned_on).toBe('2026-11-07');
    expect(o.answers['Q-lost-items']).toEqual(['cash_card']);
  });

  it('出来事が無いときに同時に呼んでも、出来事は1つ。どの書き込みも消えない', async () => {
    const v = await kept();
    const s = eventStore(v, EV, deps);
    await Promise.all([s.setPlan('a', { planned_on: '2026-11-05' }), s.setPlan('b', { planned_on: '2026-11-06' }), s.answer('Q-lost-items', ['license'])]);
    const w = await reload();
    expect(occs(w)).toHaveLength(1);
    const [o] = occs(w);
    expect(o.plan.a.planned_on).toBe('2026-11-05');
    expect(o.plan.b.planned_on).toBe('2026-11-06');
    expect(o.answers['Q-lost-items']).toEqual(['license']);
  });

  it('同時に別々の store から書いても消し合わない（画面の2か所から書く場合）', async () => {
    const v = await kept();
    await eventStore(v, EV, deps).setPlan('a', { status: 'preparing' });
    const s1 = eventStore(v, EV, deps);
    const s2 = eventStore(v, EV, deps);
    await Promise.all([s1.setPlan('b', { planned_on: '2026-11-06' }), s2.setPlan('c', { planned_on: '2026-11-08' })]);
    const [o] = occs(await reload());
    expect(Object.keys(o.plan).sort()).toEqual(['a', 'b', 'c']);
  });

  it('新しく始めたら、前の出来事は閉じて残り、新しい出来事に前の日は入らない', async () => {
    const v = await kept();
    const s = eventStore(v, EV, deps);
    await s.setPlans(['a', 'b'], { planned_on: '2026-11-06' });
    await s.startNew();
    await s.setPlan('c', { planned_on: '2026-11-09' });
    const w = await reload();
    const list = occs(w).sort((x, y) => x.id.localeCompare(y.id));
    expect(list).toHaveLength(2);
    expect(list[0].closed_on).toBe('2026-11-04');
    expect(Object.keys(list[0].plan).sort()).toEqual(['a', 'b']);
    expect(Object.keys(list[1].plan)).toEqual(['c']);
  });

  it('同意の前は、保存に書かない（再読み込みで消える）', async () => {
    const v = await Vault.open({ indexedDB: idb });
    await eventStore(v, EV, deps).setPlans(['a', 'b'], { planned_on: '2026-11-06' });
    expect(occs(v)).toHaveLength(1);
    expect(occs(await reload())).toHaveLength(0);
  });
});
