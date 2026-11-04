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
