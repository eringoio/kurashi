/* 場面ごとの QR（SPEC 9.8・6A.1、docs/QR_SCENES.md。2026-11-05 の作者の指示で、名前の入らない共通の場面にした）。
   QR には場面の id だけを入れる（/s/{id}）。開いたら、その場面のページから始める。
   場面は何も断定しない：出すのは、場面の見出しと、そこで行う手続きの一覧か、始めるページだけ。
   答えの初期値・持ち物の「持っている」は付けない。公式のカード・ルール・関係を上書きしない。 */
import { z } from 'zod';
import { Text } from './schema';
import scenesJson from '../../data/scenes.json';

/** 始めてよいページ（アプリの中の決まった画面だけ。答え・日付を入れない。13.4） */
export const START_PATH = /^\/(move|gomi|search|now|all|c\/[a-z0-9-]+|e\/E-[a-z0-9-]+)$/;

const Shows = z.discriminatedUnion('type', [
  /** そこで行う手続き（カードの place が同じもの）の一覧 */
  z.object({ type: z.literal('card_list'), place: z.string().regex(/^[a-z_]+$/) }),
  /** アプリの決まったページから始める */
  z.object({ type: z.literal('start'), path: z.string().regex(START_PATH) }),
]);

export const Scene = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** 場面の見出し（QR の横の「kurashi で開く：〇〇」にも使う）。場所や学校などの固有の名前は入れない */
  title: Text,
  shows: Shows,
});
export type Scene = z.infer<typeof Scene>;

/** 場面のデータを確かめる（CI でも回す） */
export function checkScenes(list: Scene[]): string[] {
  const err: string[] = [];
  const seen = new Set<string>();
  for (const s of list) {
    if (seen.has(s.id)) err.push(`場面 ${s.id} が2つある`);
    seen.add(s.id);
    for (const l of ['ja', 'ja_easy', 'en']) if (!s.title[l]) err.push(`${s.id}：${l} の文がない`);
  }
  return err;
}

export function loadScenes(raw: unknown = scenesJson): Scene[] {
  const list = z.object({ scenes: z.array(Scene) }).parse(raw).scenes;
  const e = checkScenes(list);
  if (e.length) throw new Error('場面のデータの誤り：\n' + e.join('\n'));
  return list;
}
let cached: Scene[] | null = null;
export const SCENES = (): Scene[] => (cached ??= loadScenes());
export const sceneById = (id: string) => SCENES().find((s) => s.id === id) ?? null;

/** /s/{id} と古い /pack/{id} */
export function parseScenePath(path: string): string | null {
  const m = /^\/(?:s|pack)\/([a-z0-9-]+)$/.exec(path);
  return m ? m[1] : null;
}

/** 開いた場面の記録。新しい場面を後ろに。同じ場面は1つ */
export function rememberScene(list: string[], id: string): string[] {
  return [...list.filter((x) => x !== id), id];
}
