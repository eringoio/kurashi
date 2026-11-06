/* 小さな道案内（URL と画面の対応）。URL に答え・日付・個人の情報を入れない。クエリ文字列は使わない（SPEC 13.4） */
import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

export function navigate(path: string) {
  if (path === location.pathname) return;
  history.pushState(null, '', path);
  notify();
}
export function usePath(): string {
  return useSyncExternalStore(
    (f) => { listeners.add(f); return () => listeners.delete(f); },
    () => location.pathname,
  );
}

export function Link({ to, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={go} {...rest} />;
}

/** 画面が変わったら、見出しにフォーカスを移す（SPEC 15.2） */
export function useFocusTitle(key: string) {
  useEffect(() => {
    const h = document.getElementById('screen-title');
    if (!h) return;
    // 読み込み・画面の切り替えで移したときは輪を出さない。キー操作が始まったら出す（K-48）
    h.dataset.autofocus = '1';
    h.focus({ preventScroll: true }); window.scrollTo(0, 0);
    const off = () => { delete h.dataset.autofocus; window.removeEventListener('keydown', off, true); };
    window.addEventListener('keydown', off, true);
    return () => window.removeEventListener('keydown', off, true);
  }, [key]);
}
