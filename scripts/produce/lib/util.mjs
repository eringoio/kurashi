/* 共通の小さな道具：原子的な書込み・ハッシュ・ロック・エラーの種類 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const readJson = (p, fallback = undefined) => {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
};
/** 一時ファイルに書いてから rename（書込み途中で止まっても壊れたファイルを残さない） */
export function writeAtomic(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, p);
}
export const writeJson = (p, obj) => writeAtomic(p, JSON.stringify(obj, null, 2) + '\n');
export const slugOf = (id) => id.replace(/^P-/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 全体停止（認証失敗・予算・呼出回数・全体時間）。残りのタスクは触らない */
export class FatalStop extends Error { constructor(reason, msg) { super(msg || reason); this.reason = reason; } }
/** このタスクだけ保留して次へ（取得失敗・矛盾・検査が通らない・1件の時間切れ） */
export class TaskHold extends Error { constructor(reason, msg) { super(msg || reason); this.reason = reason; } }

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** ロック（同時実行1）。PID が生きていないとき、または古すぎるときは回復する */
export function acquireLock(file, staleMs, now = Date.now()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(file, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, started: new Date(now).toISOString(), ms: now }));
      fs.closeSync(fd);
      return { recovered: i === 1 };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let cur = null;
      try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* 壊れたロックは古いとみなす */ }
      const stale = !cur || !alive(cur.pid) || now - cur.ms > staleMs;
      if (!stale) throw new FatalStop('locked', `別の実行が動いている（PID ${cur.pid}、${cur.started}）。同時実行は1つだけ。`);
      try { fs.unlinkSync(file); } catch { /* 競合 */ }
    }
  }
  throw new FatalStop('locked', 'ロックを取れなかった');
}
export function releaseLock(file) {
  try { const cur = JSON.parse(fs.readFileSync(file, 'utf8')); if (cur.pid === process.pid) fs.unlinkSync(file); } catch { /* なし */ }
}
