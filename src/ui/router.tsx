/* 小さな道案内（URL と画面の対応）。URL に答え・日付・個人の情報を入れない。クエリ文字列は使わない（SPEC 13.4） */
import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import type { Value } from '../core/schema';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
/** 今の画面へ、ブラウザの戻る・進む（popstate）で来たか。リンクなどの navigate で来たときは false。
    先に登録する（notify の再描画より前に印を付ける） */
let byHistory = false;
export const arrivedByHistory = () => byHistory;
/** 前の画面で選んだ答えを、次の画面（できごとの入口）へ引き継ぐ（kaizen sumai 5）。
    メモリの中だけ（URL・history.state・保存に入れない。9.9・13.4）。次の navigate・戻る・進むで消える。再読み込み・直接の URL では無い */
let handoff: { path: string; answers: Record<string, Value> } | null = null;
/** 引き継いだ答えを1回だけ受け取る（いまの道あての物だけ） */
export function takeHandoff(path: string): Record<string, Value> | null {
  if (!handoff || handoff.path !== path || location.pathname !== path) return null;
  const a = handoff.answers;
  handoff = null;
  return a;
}
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => { byHistory = true; handoff = null; });
  window.addEventListener('popstate', notify);
}

/** replace：履歴に積まない（自動で次の画面へ移るとき。もどるで同じ画面に閉じこめない。Fable C-1） */
export function navigate(path: string, answers?: Record<string, Value>, opts: { replace?: boolean } = {}) {
  if (path === location.pathname) return;
  byHistory = false;
  handoff = answers ? { path, answers } : null;
  if (opts.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  notify();
}
export function usePath(): string {
  return useSyncExternalStore(
    (f) => { listeners.add(f); return () => listeners.delete(f); },
    () => location.pathname,
  );
}

/** answers：行き先へ引き継ぐ答え（navigate を見る）。新しいタブで開いたときは引き継がない */
export function Link({ to, onClick, answers, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; answers?: Record<string, Value> }) {
  const go = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to, answers);
  };
  return <a href={to} onClick={go} {...rest} />;
}

/** 画面の見出し（#screen-title）の文。ふりがな（rt）と、English の下の日本語の行は除く */
function titleText(h: HTMLElement): string {
  const c = (h.querySelector('.bi__main') ?? h).cloneNode(true) as HTMLElement;
  c.querySelectorAll('rt,rp,wbr').forEach((n) => n.remove());
  return (c.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** 全画面に1つ（App から呼ぶ）。見出しの文が変わったら document.title を「見出し — Kurashi」にし（WCAG 2.4.2）、
    答えたあとなどで押した項目が消えてフォーカスが body に落ちたときは、新しい見出しに移す（UX-1・C-6） */
export function useScreenAnnounce(rootId = 'main') {
  useEffect(() => {
    const root = document.getElementById(rootId);
    if (!root) return;
    let last: HTMLElement | null = null;
    let raf = 0;
    const run = () => {
      raf = 0;
      const h = document.getElementById('screen-title');
      if (!h) return;
      const t = titleText(h);
      const next = t ? t + ' — Kurashi' : 'Kurashi';
      if (document.title !== next) document.title = next;
      if (h === last) return;
      last = h;
      const a = document.activeElement;
      if (a && a !== document.body) return;
      if (document.querySelector('[role="dialog"],[aria-modal="true"]')) return;
      h.dataset.autofocus = '1';
      h.focus({ preventScroll: true });
      const off = () => { delete h.dataset.autofocus; window.removeEventListener('keydown', off, true); };
      window.addEventListener('keydown', off, true);
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(run); });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    raf = requestAnimationFrame(run);
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [rootId]);
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
