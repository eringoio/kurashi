/* 財布の紛失の保存と再開（レビューの指摘 5）。7つの場面で、途中で保存を開き直し（ページの再読み込みと同じ）、
   続きが「中断しなかったとき」と同じになることを確かめる。eventStore（画面と同じ保存の層）を通す。 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/core/data';
import { run } from '../../src/core/engine';
import { answersFor } from '../../src/core/occurrence';
import { nowStep } from '../../src/core/now';
import type { Value } from '../../src/core/schema';
import { eventStore } from '../../src/guide/eventStore';
import { Vault } from '../../src/storage/vault';

const data = loadData();
const ev = data.events.find((e) => e.id === 'E-lost-wallet')!;
const TODAY = '2026-11-04';
const deps = { questions: data.questions, cards: data.cards, today: () => TODAY };

/** 保存から、画面と同じ入力を作ってエンジンにかける */
function engineFrom(v: Vault) {
  const s = eventStore(v, ev.id, deps);
  const occ = s.current();
  const profile = Object.fromEntries(v.entries('profile')) as Record<string, Value>;
  return run(data, { answers: answersFor(occ, profile, data.questions), objects: {}, plan: occ?.plan ?? {}, createdOn: occ?.started_on ?? null, today: TODAY, mode: 'public', event: ev });
}
/** いまの1つを1歩進める（画面の操作と同じ：答える・済んだにする・日を決める）。進めた内容を返す */
async function step(v: Vault, script: Record<string, Value>): Promise<string> {
  const s = eventStore(v, ev.id, deps);
  const n = nowStep(engineFrom(v), TODAY);
  if (n.kind === 'upfront' || n.kind === 'card_q') { await s.answer(n.q.id, script[n.q.id]); return `質問:${n.q.id}`; }
  if (n.kind === 'urgent') { await s.setPlan(n.view.card.id, { status: 'done' }); return `すぐ:${n.view.card.id}`; }
  if (n.kind === 'plan') { await s.setPlan(n.view.card.id, { planned_on: TODAY }); return `日:${n.view.card.id}`; }
  return n.kind;
}
async function openKept(idb: IDBFactory) {
  (globalThis as { indexedDB?: IDBFactory }).indexedDB = idb;
  const v = await Vault.open({ indexedDB: idb });
  if (v.mode !== 'kept') await v.keep();
  return v;
}
/** reloadAt 歩目のあとで開き直す。最後まで（today／until／idle。今日を選ぶので today）進めた手順を返す */
async function play(script: Record<string, Value>, reloadAt: number | null) {
  const idb = new IDBFactory();
  let v = await openKept(idb);
  const steps: string[] = [];
  for (let i = 0; i < 20; i++) {
    const s = await step(v, script);
    steps.push(s);
    if (s === 'today' || s === 'until' || s === 'idle') break;
    if (i === reloadAt) v = await Vault.open({ indexedDB: idb });
  }
  return { steps, v };
}

const SCENES: Record<string, Record<string, Value>> = {
  'A カードだけ': { 'Q-lost-items': ['cash_card'], 'Q-police-reported': 'not_yet' },
  'B 在留カードだけ': { 'Q-lost-items': ['zairyu_card'], 'Q-police-reported': 'not_yet' },
  'C 外国旅券だけ': { 'Q-lost-items': ['passport'], 'Q-passport-country': 'other_country', 'Q-police-reported': 'not_yet' },
  'D 在留カード＋外国旅券': { 'Q-lost-items': ['zairyu_card', 'passport'], 'Q-passport-country': 'other_country', 'Q-police-reported': 'not_yet' },
  'E 日本旅券': { 'Q-lost-items': ['passport'], 'Q-passport-country': 'japan', 'Q-police-reported': 'not_yet' },
  'F 不明': { 'Q-lost-items': ['unknown'], 'Q-police-reported': 'not_yet' },
  'G すでに警察へ届けた': { 'Q-lost-items': ['zairyu_card'], 'Q-police-reported': 'yes' },
};

describe('保存と再開（7つの場面）', () => {
  for (const [name, script] of Object.entries(SCENES)) {
    it(`${name}：どの歩目で開き直しても、続きは中断しなかったときと同じ。保存した答えと日が残る`, async () => {
      const straight = await play(script, null);
      for (let at = 0; at < straight.steps.length - 1; at++) {
        const resumed = await play(script, at);
        expect(resumed.steps, `${at} 歩目のあとで開き直した`).toEqual(straight.steps);
      }
      // 最後の保存を開き直して、答えと進捗が残っている
      const idb = new IDBFactory();
      let v = await openKept(idb);
      for (let i = 0; i < 20; i++) { const s = await step(v, script); if (s === 'today' || s === 'until' || s === 'idle') break; }
      v = await Vault.open({ indexedDB: idb });
      const occ = eventStore(v, ev.id, deps).current()!;
      expect(occ.answers['Q-lost-items']).toEqual(script['Q-lost-items']);
      expect(occ.answers['Q-police-reported']).toEqual(script['Q-police-reported']);
      // 選ばなかった物の手続きは、保存の中にも無い（紛失済みとして記録されない）
      const pickedCards = engineFrom(v).cards.filter((c) => c.state !== 'excluded').map((c) => c.card.id);
      for (const id of Object.keys(occ.plan)) expect(pickedCards, id).toContain(id);
    });
  }

  it('2回目の紛失は新しい出来事。前の出来事の答え・済んだを使わない', async () => {
    const idb = new IDBFactory();
    const v = await openKept(idb);
    for (let i = 0; i < 20; i++) { const s = await step(v, SCENES['A カードだけ']); if (s === 'today' || s === 'until') break; }
    await eventStore(v, ev.id, deps).startNew();
    const w = await Vault.open({ indexedDB: idb });
    const o = engineFrom(w);
    expect(nowStep(o, TODAY)).toMatchObject({ kind: 'upfront', q: { id: 'Q-lost-items' } });
    expect(o.cards.some((c) => c.section === 'done')).toBe(false);
  });
});
