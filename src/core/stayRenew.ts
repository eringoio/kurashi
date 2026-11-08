/* 在留期間の更新の流れ（SPEC 6A.18 v0.5.29）。画面に依存しない。
   順番：満了日 →（要るときだけ）許可されている期間 → 在留資格 → 書類 → 申請の方法 → 予定日 → 申請した → 許可が出た。
   制度の事実は data/stay-renew.json（出典つき）。ここは日付の計算と分かれ道だけ。推測で条件を足さない。 */
import { addDays, addMonths, type Ymd } from './date';

/** 在留カードの「在留資格」（この流れの中だけの細かい区分）。共通の質問 Q-zairyu-status には profile の値で書く */
export type StayKind =
  | 'student' | 'dependent' | 'engineer' | 'work_other' | 'spouse' | 'long_term' | 'designated' | 'cultural' | 'other'
  | 'permanent' | 'hsp2' | 'special_permanent' | 'short_stay' | 'unknown';
/** 分かれ道。renew：在留期間更新許可申請／card：在留カードの有効期間の更新（永住者・高度専門職2号）／
    spc：特別永住者証明書の有効期間の更新（区役所）／short：短期滞在（公式の案内へ）／unknown：在留カードを見る */
export type Track = 'renew' | 'card' | 'spc' | 'short' | 'unknown';
/** 許可されている在留期間。long：6か月以上／short：6か月より短い／unknown：わからない */
export type PeriodBand = 'long' | 'short' | 'unknown';
export type Method = 'counter' | 'online';
export type AfterExpiry = 'applied' | 'not' | 'permitted' | 'unknown';

/** 端末に残す（SPEC 9.9 の plan の中。同意の前は書かない）。満了日 'none' は「欄がない・わからない」 */
export interface StayRecord {
  expires_on?: Ymd | 'none';
  period?: PeriodBand;
  kind?: StayKind;
  /** 見た書類（チェックした物の id） */
  docs?: string[];
  docs_seen?: boolean;
  method?: Method;
  /** 申請したと記録した日（plan.status = submitted と一緒に） */
  applied_on?: Ymd;
  /** 満了日を過ぎたときの答え（期限の前に申請したか。v0.5.29）。在留の可否は判定しない。満了日を入れ直すと消す */
  after?: AfterExpiry;
}

export const TRACK: Record<StayKind, Track> = {
  student: 'renew', dependent: 'renew', engineer: 'renew', work_other: 'renew', spouse: 'renew', long_term: 'renew',
  designated: 'renew', cultural: 'renew', other: 'renew',
  permanent: 'card', hsp2: 'card', special_permanent: 'spc', short_stay: 'short', unknown: 'unknown',
};
/** 共通の質問 Q-zairyu-status に書く値（無い物は書かない：短期滞在・わからない） */
export const PROFILE_OF: Partial<Record<StayKind, string>> = {
  student: 'student', dependent: 'family', engineer: 'work', work_other: 'work', hsp2: 'work', spouse: 'spouse', long_term: 'long_term',
  designated: 'designated', cultural: 'cultural', other: 'other', permanent: 'permanent', special_permanent: 'permanent',
};
/** 共通の答えから、1つに決まるときだけ細かい区分にする（仕事・永住者は2つ以上にあたるので聞く） */
export const KIND_FROM_PROFILE: Record<string, StayKind> = {
  student: 'student', family: 'dependent', spouse: 'spouse', long_term: 'long_term', designated: 'designated', cultural: 'cultural',
};

const days = (a: Ymd, b: Ymd) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);

/** 期限までの状態。expired：過ぎた／today：今日が満了日／week：7日以内／soon：45日以内／calm：それより前 */
export type Urgency = 'expired' | 'today' | 'week' | 'soon' | 'calm';
export function urgency(expires: Ymd, today: Ymd): { kind: Urgency; daysLeft: number } {
  const n = days(today, expires);
  return { kind: n < 0 ? 'expired' : n === 0 ? 'today' : n <= 7 ? 'week' : n <= 45 ? 'soon' : 'calm', daysLeft: n };
}

/** 許可されている期間を聞く必要があるか：満了の3か月前より前のときだけ（3か月前からの決まりが効くかで、今日申請できるかが変わる） */
export const needsPeriod = (expires: Ymd, today: Ymd) => today < addMonths(expires, -3);

/** 申請の受付が始まる日。6か月以上の人は満了の3か月前から（16-3）。6か月より短い・わからないときは決めない（null） */
export const openFrom = (expires: Ymd, period?: PeriodBand): Ymd | null => (period === 'long' ? addMonths(expires, -3) : null);
/** 入管がすすめる申請の時期：満了の3か月前から45日前まで（10_00270「努めてください」） */
export const advisedUntil = (expires: Ymd): Ymd => addDays(expires, -45);

/** 予定日として選べる範囲。min より前・max より後は選べない。null は「この方法では選べない」 */
export function planRange(x: { expires: Ymd; period?: PeriodBand; method: Method; today: Ymd }): { min: Ymd; max: Ymd } | null {
  const u = urgency(x.expires, x.today);
  if (u.kind === 'expired') return null;
  // オンラインは満了日の当日はできない（online-QA Q4-10）。窓口は満了日まで
  const max = x.method === 'online' ? addDays(x.expires, -1) : x.expires;
  const from = openFrom(x.expires, x.period);
  const min = from && from > x.today ? from : x.today;
  return min > max ? null : { min, max };
}
/** 方法を選べるか。オンラインは満了日の当日と過ぎた後はできない（Q4-10・Q4-11） */
export const methodOpen = (m: Method, expires: Ymd, today: Ymd) => (m === 'counter' ? urgency(expires, today).kind !== 'expired' : expires > today);

/** 予定日が今の範囲の外になった（満了日や方法を変えたとき） */
export function planOutside(planned: Ymd | undefined, r: { min: Ymd; max: Ymd } | null): boolean {
  if (!planned) return false;
  return !r || planned < r.min || planned > r.max;
}

/** いまの段（画面に1つだけ出す。答えた段は上に短く並べる） */
export type Step = 'expiry' | 'period' | 'status' | 'stop' | 'expired' | 'docs' | 'method' | 'day' | 'progress';
export function currentStep(s: StayRecord, today: Ymd, x: { planned?: Ymd; status?: string; profileKind?: StayKind } = {}): Step {
  const kind = s.kind ?? x.profileKind;
  // 永住者などと分かっていれば、満了日を聞かずに分かれ道へ（在留期間の満了日がない）
  const noPeriod = kind && TRACK[kind] !== 'renew';
  if (!s.expires_on && !noPeriod) return 'expiry';
  const exp = s.expires_on && s.expires_on !== 'none' ? s.expires_on : null;
  // 申請したあとは、満了日を過ぎても（特例期間）記録の段
  const applied = x.status === 'submitted' || x.status === 'waiting' || x.status === 'done';
  if (applied && s.kind && TRACK[s.kind] === 'renew') return 'progress';
  // 在留カードの更新などの別の手続き（永住者など）は、満了日が過ぎていてもそちらへ（カードの有効期間と混ぜない）
  if (s.kind && TRACK[s.kind] !== 'renew') return 'stop';
  if (exp && urgency(exp, today).kind === 'expired') return 'expired';
  if (exp && !s.period && needsPeriod(exp, today)) return 'period';
  if (!s.kind) return 'status';
  if (TRACK[s.kind] !== 'renew') return 'stop';
  if (!s.docs_seen) return 'docs';
  if (!s.method) return 'method';
  if (!exp) return 'expiry';
  if (!x.planned) return 'day';
  return 'progress';
}

/** 満了日を過ぎているか（申請したと記録していれば、記録の段なので含めない）。開いた項目で、オンラインを含む方法の一覧を出さないため */
export const stayExpired = (s: StayRecord | undefined, today: Ymd, status?: string): boolean =>
  !!s?.expires_on && s.expires_on !== 'none' && urgency(s.expires_on, today).kind === 'expired' && !(status === 'submitted' || status === 'waiting' || status === 'done');
