/* 確認状態の扱い（SPEC v0.4.9・12.3・10.4）。どの欄で ai_checked を verified と同じに扱うかを、ここ1か所で決める。
   義務・期限・費用・対象者（制度のルール）・前提の関係は、ai_checked でも U のまま（「窓口で確認」）。作者が verified にするまで変わらない。 */
import type { Evidence, Status } from './schema';

/** 確認状態が効く欄の種類 */
export type FieldKind =
  // ai_checked を verified と同じに扱う（行く所・方法・連絡先・リンク・持ち物の名前・手続きの名前と説明）
  | 'place' | 'method' | 'contact' | 'link' | 'object_name' | 'card_text'
  // ai_checked でも U のまま（重要）
  | 'obligation' | 'deadline' | 'fee' | 'rule' | 'prerequisite' | 'relation';

/** ai_checked を verified と同じに扱う欄なら true。作者が見る表（/review）にも、この表をそのまま出す */
export const AI_CHECK_COUNTS: Record<FieldKind, boolean> = {
  place: true, method: true, contact: true, link: true, object_name: true, card_text: true,
  obligation: false, deadline: false, fee: false, rule: false, prerequisite: false, relation: false,
};
export const FIELD_KINDS = Object.keys(AI_CHECK_COUNTS) as FieldKind[];

/** 判定に使う確認状態：ai_checked は、表で許した欄だけ verified、ほかは needs_check（U）として扱う */
export function effectiveStatus(e: Pick<Evidence, 'status'>, kind: FieldKind): Exclude<Status, 'ai_checked'> {
  if (e.status !== 'ai_checked') return e.status;
  return AI_CHECK_COUNTS[kind] ? 'verified' : 'needs_check';
}

/** 画面の印：AI で照合した（作者の確認前）か。verified と同じに扱う欄でも、印は付ける（色だけにしない。15.2） */
export const isAiChecked = (e: Pick<Evidence, 'status'> | undefined | null) => e?.status === 'ai_checked';

/** ai_checked にしてよいか（v0.4.9 の条件）：(a) 引用が取得した本文にそのままある (b) 独立の照合が同じ結論 */
export function canBeAiChecked(e: Evidence, body: string | null): { ok: boolean; why: string[] } {
  const why: string[] = [];
  if (!e.quote) why.push('引用（quote）がない');
  else if (body === null) why.push('取得した本文がない');
  else if (!normalize(body).includes(normalize(e.quote))) why.push('引用が本文にない');
  if (!e.ai_check) why.push('照合の記録（ai_check）がない');
  else if (e.ai_check.verdict !== 'agree') why.push('独立の照合が同じ結論でない');
  return { ok: why.length === 0, why };
}

/** 本文と引用の比べ方：空白（全角・改行）の違いだけをそろえる。文字は変えない */
export const normalize = (s: string) => s.replace(/[\s　]+/g, '');
