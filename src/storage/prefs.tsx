/* 表示の設定（表示レベル・文字の大きさ・ふりがな・読み上げの速さ）と、保存の状態を画面に渡す */
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LEVELS, levelById, type Level } from '../i18n/text';
import type { Vault } from './vault';

export type Size = 0 | 1 | 2;
export type SpeechRate = 'normal' | 'slow';
interface Prefs {
  level: Level;
  size: Size;
  furigana: boolean;
  speechRate: SpeechRate;
  vault: Vault;
  setLevel(id: string): void;
  setSize(s: Size): void;
  setFurigana(on: boolean): void;
  setSpeechRate(r: SpeechRate): void;
}

const Ctx = createContext<Prefs | null>(null);

/** ブラウザの表示言語は初期値にだけ使う（SPEC 6A.1）。判定には使わない */
function initialLevel(): string {
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'ja').slice(0, 2);
  return LEVELS.find((l) => l.kind === 'foreign' && l.lang === nav)?.id ?? 'ja';
}

export function PrefsProvider({ vault, children }: { vault: Vault; children: ReactNode }) {
  // 保存の中身が変わったら描き直す
  const version = useSyncExternalStore(
    (f) => vault.subscribe(f),
    () => vault.rev,
  );
  const saved = (k: string) => vault.get('settings', k);
  const [level, setLevelId] = useState<string>((saved('level') as string) ?? initialLevel());
  const [size, setSizeS] = useState<Size>((saved('size') as Size) ?? 0);
  const [furigana, setFuri] = useState<boolean>((saved('furigana') as boolean) ?? true);
  const [speechRate, setRate] = useState<SpeechRate>((saved('speechRate') as SpeechRate) ?? 'normal');

  const lv = levelById(level);
  useEffect(() => {
    document.documentElement.lang = lv.lang;
    document.documentElement.dir = lv.dir;
    document.documentElement.dataset.size = String(size);
  }, [lv, size]);

  const value = useMemo<Prefs>(
    () => ({
      level: lv,
      size,
      furigana,
      speechRate,
      vault,
      setLevel: (id) => { setLevelId(id); void vault.put('settings', 'level', id); },
      setSize: (s) => { setSizeS(s); void vault.put('settings', 'size', s); },
      setFurigana: (on) => { setFuri(on); void vault.put('settings', 'furigana', on); },
      setSpeechRate: (r) => { setRate(r); void vault.put('settings', 'speechRate', r); },
    }),
    // version：保存の状態（モード）が変わったときも描き直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lv, size, furigana, speechRate, vault, version],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): Prefs {
  const p = useContext(Ctx);
  if (!p) throw new Error('PrefsProvider がない');
  return p;
}
