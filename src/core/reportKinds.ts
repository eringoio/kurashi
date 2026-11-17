/* 報告の種類と、作者が付ける状態（2026-11-14）。画面（ReportSheet・ReviewReports）と Worker（worker/report.ts）で同じものを使う */

/** 種類：まちがい／古い（期限・料金）／手順が足りない／公式のリンクが開けない／わかりにくい／そのほか */
export const REPORT_KINDS = ['wrong', 'outdated', 'missing', 'link', 'unclear', 'other'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** 状態：新しい → 確認中 → 直した／再現できない／変えない */
export const REPORT_STATUSES = ['new', 'reviewing', 'fixed', 'cannot_reproduce', 'no_change'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
