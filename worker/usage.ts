/* 写真の読み取りの1日の回数（KV。目安の数え方）。費用を確実に止めるのは Anthropic の Workspace の支出の上限。
   KV はすぐに全部の場所にそろわないので、上限を少し超えることがある（README の「公開」）。 */

export interface CounterKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

/** 日本時間の日付（YYYY-MM-DD） */
export const jstDay = (now: number) => new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
export const readKey = (day: string) => 'usage:read:' + day;

export async function readCount(kv: CounterKv, day: string): Promise<number> {
  const n = Number(await kv.get(readKey(day)));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 1つ増やす（3日で消える） */
export async function addRead(kv: CounterKv, day: string): Promise<void> {
  await kv.put(readKey(day), String((await readCount(kv, day)) + 1), { expirationTtl: 3 * 86_400 });
}
