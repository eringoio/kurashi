/* 在留期間の更新の流れのデータ（data/stay-renew.json）。読み込むときに Zod と出典の検査を通す（tests/core/stay-renew-flow.test.ts） */
import { z } from 'zod';
import { Evidence, Text } from './schema';
import json from '../../data/stay-renew.json';
import type { StayKind } from './stayRenew';

const Fact = z.object({ text: Text, evidence: Evidence });
const KINDS = ['student', 'dependent', 'engineer', 'work_other', 'spouse', 'long_term', 'designated', 'cultural', 'other', 'permanent', 'hsp2', 'special_permanent', 'short_stay', 'unknown'] as const satisfies readonly StayKind[];
export const StayData = z.object({
  statuses: z.array(z.object({ id: z.enum(KINDS), icon: z.string(), label: Text, docs_source: z.string().optional() })),
  docs: z.array(z.object({ id: z.string().regex(/^[a-z_]+$/), text: Text, note: Text.optional(), evidence: Evidence })),
  facts: z.object({
    expiry_hint: Fact, open_long: Fact, open_short: Fact, advised: Fact, where: Fact, online: Fact, designated: Fact, change: Fact,
    card: Fact, spc: Fact, short: Fact, unknown: Fact, expired: Fact, special_period: Fact,
    expired_consult: Fact, expired_applied: Fact, expired_permitted: Fact,
  }),
  /** 期限が過ぎたときの相談先（愛知県に住んでいる場合。名古屋と言い切らない。全国の一覧も必ず出す） */
  nagoya: z.object({ name: Text, scope: Text, address: Text, phones: z.array(z.object({ label: Text, value: z.string().regex(/^[0-9-]+$/) })), evidence: Evidence }),
});
export type StayData = z.infer<typeof StayData>;
let d: StayData | null = null;
export const STAY = () => (d ??= StayData.parse(json));

/** 分かれ道ごとの公式ページ（出典の id）。在留資格のページが無いものは一般の案内（16-3） */
export const TRACK_SOURCE = { card: 'isa-card-renewal', spc: 'isa-spc-renewal', short: 'B-moj-koshin', unknown: 'isa-status-list', change: 'B-moj-shikaku-henko', general: 'B-moj-koshin', tokurei: 'isa-tokurei', online: 'isa-online-qa', nagoya: 'isa-nagoya', region: 'isa-region-list' } as const;
