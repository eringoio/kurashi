/* 上の帯のボタンの小さな印（線だけ。文字の色に合わせる）。文字の代わりにしない：いつも名前と一緒に出す */
const P = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

/** 相談：吹き出しと「？」 */
export const HelpIcon = () => (
  <svg {...P}><path d="M4 5h16v11H10l-4 4v-4H4z" /><path d="M10 9a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.5" /><path d="M12 14.2h.01" /></svg>
);
/** 設定・ことば：地球（言語を探す人が見つけやすい形） */
export const GlobeIcon = () => (
  <svg {...P}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></svg>
);
/** カレンダー（カレンダーに追加） */
export const CalendarIcon = () => (
  <svg {...P}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M12 13v5" /><path d="M9.5 15.5h5" /></svg>
);
/** 電話（押すと電話をかける） */
export const PhoneIcon = () => (
  <svg {...P}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" /></svg>
);
/** 位置（地図のピン） */
export const PinIcon = () => (
  <svg {...P}><path d="M12 21s-6.5-6.2-6.5-11.2A6.5 6.5 0 0 1 18.5 9.8C18.5 14.8 12 21 12 21z" /><circle cx="12" cy="9.8" r="2.4" /></svg>
);
/** 共有（四角から上へ出る矢印） */
export const ShareIcon = () => (
  <svg {...P}><path d="M12 3v12" /><path d="M7.5 7.5 12 3l4.5 4.5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
);

/** 左向きの矢印（いまの手続きにもどる） */
export const BackIcon = () => (
  <svg {...P}><path d="M19 12H5" /><path d="M11 6l-6 6 6 6" /></svg>
);
/** 一覧（3本の線） */
export const ListIcon = () => (
  <svg {...P}><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></svg>
);
/** 旗（まちがいを知らせる） */
export const FlagIcon = () => (
  <svg {...P}><path d="M6 21V4" /><path d="M6 4h11l-2 4 2 4H6" /></svg>
);
/** 家（入口にもどる） */
export const HomeIcon = () => (
  <svg {...P}><path d="M4 11l8-7 8 7" /><path d="M6 10v10h12V10" /></svg>
);
