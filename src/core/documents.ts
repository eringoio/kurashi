/* 知っている書類（SPEC 9.12）と、写真の読み取りの結果の検査（6A.9）。画面にも Worker にも依存しない。
   Claude に返させるのは「一覧の中のどれか（id）と確からしさ」だけ。一覧の外の id・型に合わない結果は捨てる。 */
import { z } from 'zod';
import { Evidence, Text } from './schema';
import documentsJson from '../../data/documents.json';

export const KnownDocument = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: Text,
  /** 書類の見出しにある言葉（日本語。{漢字|よみ}）。本人が書類で確かめる */
  look_for: z.string(),
  summary: Text,
  card_ids: z.array(z.string()),
  /** この書類を出す（もらえる）手続きのカード（作者 11/6 B-12）。カードのページに「この手続きでもらう書類」として出す */
  issued_by_card: z.array(z.string()).optional(),
  /** 見本の画像（public/samples。架空の書類。作者 11/7 K-11） */
  sample: z.string().regex(/^\/samples\/[a-z0-9-]+\.svg$/).optional(),
  /** 書類にある大事な言葉と、その意味（作者 11/7 K-11） */
  key_words: z.array(z.object({ word: z.string(), meaning: Text })).default([]),
  evidence: Evidence,
});
export type KnownDocument = z.infer<typeof KnownDocument>;

export function loadDocuments(raw: unknown = documentsJson): KnownDocument[] {
  const list = z.object({ documents: z.array(KnownDocument) }).parse(raw).documents;
  if (new Set(list.map((d) => d.id)).size !== list.length) throw new Error('書類の id が重なっている');
  return list;
}
let cached: KnownDocument[] | null = null;
export const DOCUMENTS = (): KnownDocument[] => (cached ??= loadDocuments());

/** 候補の確からしさが、これより低ければ「読み取れませんでした」 */
export const MIN_CONFIDENCE = 0.5;
export const MAX_CANDIDATES = 3;

/** 読み取りの結果（Worker が返す形。端末でももう一度確かめる） */
export const ReadResult = z.object({
  candidates: z.array(z.object({ id: z.string(), confidence: z.number().min(0).max(1) })).max(10),
});
export type ReadResult = z.infer<typeof ReadResult>;

/** 型を確かめ、一覧の外の id を捨て、確からしい順に最大3つ。低いものは捨てる */
export function cleanCandidates(raw: unknown, known: string[]): { id: string; confidence: number }[] {
  const r = ReadResult.safeParse(raw);
  if (!r.success) return [];
  const ids = new Set(known);
  return r.data.candidates
    .filter((c) => ids.has(c.id) && c.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .filter((c, i, a) => a.findIndex((x) => x.id === c.id) === i)
    .slice(0, MAX_CANDIDATES);
}

/** キーが無いとき・見本の画像のときの結果（架空の資格確認書の見本） */
export const SAMPLE_RESULT: ReadResult = { candidates: [{ id: 'kokuho-shikaku', confidence: 0.9 }] };
