/* 下からのシート（ダイアログ）。開くと「閉じる」にフォーカス、Tab はシートの中で回る、Escape で閉じて開いたボタンに戻る */
import { useEffect, useRef, type ReactNode } from 'react';
import { line } from '../i18n/text';
import { ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';

export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const { level } = usePrefs();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('.close')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]')].filter((el) => !el.hasAttribute('disabled'));
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); opener?.focus?.(); };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" ref={box}>
        <div className="sheet__head">
          <h2 id="sheet-title">{title}</h2>
          <button type="button" className="close" aria-label={line(ui('nav.close'), level)} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
