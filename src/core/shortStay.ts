/* 短期滞在の人（旅行・訪問など。住民登録をしない人）の専用の画面（R-10 / O-4。2026-11-15 作者の決定）。
   「短期滞在」は、あなたについて（Q-zairyu-status）と引っ越しの Q-residence-basis のどちらで答えても同じこと。
   どちらかが short_stay なら、住む人のための手続き（scope_rule が R-scope-not-short-stay・R-scope-move-resident のできごと）の代わりに、専用の画面を出す。 */
import type { Value } from './schema';

export const SHORT_STAY = 'short_stay';
/** 専用の画面の道 */
export const SHORT_STAY_PATH = '/short-stay';
/** 短期滞在の人にも使える入口の行き先（入口のメニューの to と同じ。ごみは E-gomi・病院・届いた書類・探す・防災・財布をなくした） */
export const SHORT_STAY_ENTRANCES = ['/e/E-gomi', '/clinic', '/letter', '/search', '/e/E-bousai', '/e/E-lost-wallet'] as const;

/** 在留資格か住民登録の形のどちらかが短期滞在か（答えは Q-id → 値。どちらかの質問が無い・未回答でも読める） */
export const isShortStay = (answers: Record<string, Value | undefined>): boolean =>
  answers['Q-zairyu-status'] === SHORT_STAY || answers['Q-residence-basis'] === SHORT_STAY;
