/* お知らせの表示の期限（11/7 B-7c。作者：「制度が変わった」は来年3月まで出し、その後は出さない）。
   show_from・show_until は日本時間の日付（YYYY-MM-DD）。両端を含む。無い側は制限なし */
import type { Notice } from './schema';

export const noticeActive = (n: Pick<Notice, 'show_from' | 'show_until'>, today: string): boolean =>
  (!n.show_from || n.show_from <= today) && (!n.show_until || today <= n.show_until);

export const activeNotices = <T extends Pick<Notice, 'show_from' | 'show_until'>>(list: T[] | undefined, today: string): T[] => (list ?? []).filter((n) => noticeActive(n, today));
