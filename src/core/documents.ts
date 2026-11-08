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
  card_ids: z.array(z.string()).default([]),
  /** この書類を出す（もらえる）手続きのカード（作者 11/6 B-12）。カードのページに「この手続きでもらう書類」として出す */
  issued_by_card: z.array(z.string()).optional(),
  /** 見本の画像（public/samples。架空の書類。作者 11/7 K-11） */
  sample: z.string().regex(/^\/samples\/[a-z0-9-]+\.svg$/).optional(),
  /** 書類にある大事な言葉と、その意味（作者 11/7 K-11） */
  key_words: z.array(z.object({ word: z.string(), meaning: Text })).default([]),
  evidence: Evidence,

  /* 書類の説明の画面（SPEC 6A.9a・9.12。v0.5.25）。どれも任意：ある欄だけを出す。
     義務・期限・必要な書類は、公式の資料で確かめたことだけを書く（推測しない。分からないことは書かない） */
  /** 説明の欄（purpose〜fields）の根拠。無ければ evidence。書類の名前を確かめた後に説明を足したときは、ここを要確認にする */
  about_evidence: Evidence.optional(),
  /** 書類の種類（画面の札） */
  kind: z.enum(['notice', 'bill', 'statement', 'certificate', 'application', 'email', 'warning']).optional(),
  /** 受け取る・書いて出す・注意（あやしい） */
  direction: z.enum(['receive', 'submit', 'warning']).optional(),
  /** 出す所（発行元）、または出す先 */
  issuer: Text.optional(),
  /** 何のための書類か（専門の言葉をさけて） */
  purpose: Text.optional(),
  /** 誰に関係があるか（条件で分かれるときは、その条件） */
  who: Text.optional(),
  /** どこから届く・どこでもらう（受け取り方・自分で頼むか・いつ届くか） */
  how_to_get: Text.optional(),
  /** 何をすればいいか（順番に）。無いときは「内容を確かめて、必要なら保管」 */
  actions: z.array(Text).default([]),
  /** 気をつけること（1つ。支払い・あやしい通知・許可ではない など） */
  caution: Text.optional(),
  /** 書く欄（申請書・届出書。実際の様式と公式の記入例で確かめた欄だけ） */
  fields: z.array(z.object({
    label: z.string(),
    meaning: Text,
    by: z.enum(['self', 'employer', 'school', 'doctor', 'office']).optional(),
  })).default([]),
  /** 関係する書類（この一覧の id。手続きの前後も考えて） */
  related_docs: z.array(z.string()).default([]),
  /** 公式の情報へのリンク。種類を分ける（案内のページを「見本」として扱わない） */
  links: z.array(z.object({
    source_id: z.string(),
    kind: z.enum(['procedure', 'sample', 'blank_form', 'filled_example', 'reference']),
  })).default([]),
  /** sample の画像の種類：illustration＝説明用の架空の見本、official＝公式の見本 */
  sample_kind: z.enum(['illustration', 'official']).default('illustration'),
  /** 調査資料の候補（data/document-candidates.json）の id。同じ書類の別の版も */
  catalogue_ids: z.array(z.string()).default([]),
  /** 公開の段階：public＝公開、review＝要確認（開発と /review だけ）、research＝調査中（出さない）。
      人の確認なしに public にしない */
  publication: z.enum(['public', 'review', 'research']).default('public'),
});
export type KnownDocument = z.infer<typeof KnownDocument>;

/** 書類を探すための形（src/core/search.ts の Searchable。v0.5.31）。
    強い手がかり：書類の名前（全部の表示レベル）・書類の見出しの言葉・発行元・大事な言葉とその意味。
    弱い手がかり：概要・何のため・誰に関係・届き方・すること・注意・書く欄 */
export interface DocSearchItem { doc: KnownDocument; card: { title: Record<string, string | undefined>; official_name: { ja: string; reading: string }; keywords: string[]; body: string[] } }
const RUBY = /\{([^|{}]+)\|([^|{}]+)\}/g;
const textsOf = (t: Text | undefined): string[] => (t ? Object.entries(t).filter(([k, v]) => k !== 'status' && typeof v === 'string').map(([, v]) => v as string) : []);
export function docSearchItems(docs: KnownDocument[]): DocSearchItem[] {
  return docs.map((d) => {
    const plain = (s: string) => s.replace(RUBY, '$1');
    const reading = (s: string) => s.replace(RUBY, '$2');
    const keywords = [
      ...textsOf(d.issuer).flatMap((s) => [plain(s), reading(s)]),
      ...d.key_words.flatMap((k) => [plain(k.word), reading(k.word), ...textsOf(k.meaning).map(plain)]),
    ];
    const body = [
      ...textsOf(d.summary), ...textsOf(d.purpose), ...textsOf(d.who), ...textsOf(d.how_to_get), ...textsOf(d.caution),
      ...d.actions.flatMap(textsOf), ...d.fields.flatMap((f) => [f.label, ...textsOf(f.meaning)]),
    ];
    return { doc: d, card: { title: d.title, official_name: { ja: plain(d.look_for), reading: reading(d.look_for) }, keywords, body } };
  });
}

/** strict：関係する書類の id が一覧に無ければ止める。本番（要確認の書類を読まない）では、無い id を黙って外す */
export function loadDocuments(raw: unknown = documentsJson, strict = true): KnownDocument[] {
  const list = z.object({ documents: z.array(KnownDocument) }).parse(raw).documents;
  const ids = new Set(list.map((d) => d.id));
  if (ids.size !== list.length) throw new Error('書類の id が重なっている');
  for (const d of list) {
    for (const r of d.related_docs) if (r === d.id || (strict && !ids.has(r))) throw new Error(`${d.id}：関係する書類 ${r} がない`);
    d.related_docs = d.related_docs.filter((r) => ids.has(r));
  }
  return list;
}

/** 要確認・調査中の書類（data/documents-review.json）は、開発（vite dev・vitest）でだけ読む。
    本番のビルドでは import.meta.env.DEV が false になり、ファイルごと入らない。Worker（import.meta.env が無い）でも読まない */
const REVIEW_FILES: Record<string, unknown> = (() => {
  try { return import.meta.env.DEV ? import.meta.glob('../../data/documents-review.json', { eager: true, import: 'default' }) : {}; } catch { return {}; }
})();
const SHOW_REVIEW = Object.keys(REVIEW_FILES).length > 0;

let cached: KnownDocument[] | null = null;
/** すべての書類（読み込んだもの。開発では要確認も。/review とテスト用） */
export const ALL_DOCUMENTS = (): KnownDocument[] => (cached ??= loadDocuments({
  documents: [
    ...(documentsJson as { documents: unknown[] }).documents,
    ...Object.values(REVIEW_FILES).flatMap((r) => (r as { documents: unknown[] }).documents),
  ],
}, SHOW_REVIEW));

export const isShown = (d: KnownDocument, review = SHOW_REVIEW) => d.publication === 'public' || (review && d.publication === 'review');
let shown: KnownDocument[] | null = null;
/** 画面と写真の読み取りで使う書類 */
export const DOCUMENTS = (): KnownDocument[] => (shown ??= ALL_DOCUMENTS().filter((d) => isShown(d)));
export const documentById = (id: string): KnownDocument | undefined => DOCUMENTS().find((d) => d.id === id);

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
