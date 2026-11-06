/* ことばの部品（語学学習の最初の版。作者が OK 2026-11-06）：記録のフック、1つの言葉の行（日本語・意味・読み上げ・★）、/words の画面 */
import { useEffect, useMemo, useState } from 'react';
import { allWords, heardFirst, listWords, logSeen, recentWords, WORD_KINDS, type WordKind, type WordLog, type WordMode, type WordView } from '../core/words';
import { todayJst } from '../core/date';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { line, ui, type LocalizedText, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { navigate, useFocusTitle, usePath } from './router';
import '../styles/words.css';
import { Speak } from './Speak';

/** 記録（phrases ストア。同意の前は vault がメモリの中だけに置く） */
export function useWordLog() {
  const { vault } = usePrefs();
  const logs = Object.fromEntries(vault.entries('phrases').map(([k, v]) => [k, v as WordLog])) as Record<string, WordLog>;
  const seen = (ids: string[]) => { const t = todayJst(); for (const id of ids) { const p = logs[id]; void vault.put('phrases', id, logSeen(p, id, t, Date.now())); } };
  const star = (id: string) => { const p = logs[id] ?? logSeen(undefined, id, todayJst()); void vault.put('phrases', id, { ...p, starred: !p.starred }); };
  return { logs, seen, star };
}

/** 画面に出た言葉を残す（一度だけ） */
export function useSeen(ids: string[]) {
  const { seen } = useWordLog();
  const key = ids.join(',');
  // 1拍おくらせる：子の effect は親より先に走るので、そのままだと「どこまで進んだか」（resume）の保存より先に書き込みが並ぶ
  useEffect(() => { if (!ids.length) return; const t = setTimeout(() => seen(ids), 0); return () => clearTimeout(t); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function WordRow({ w, starred, onStar }: { w: WordView; starred: boolean; onStar: () => void }) {
  const { level } = usePrefs();
  // 作者 11/7 K-5：どの表示レベルでも同じ形。主の文はふりがな付きの日本語、意味は英語（英語で表示しているときと同じ）。
  // 言う文（say）の主の文は、やさしい日本語（言いやすい）。聞こえてくる言葉・正式名・書類の言葉は、そのままの日本語（聞いて分かるように）
  const m = w.meaning as LocalizedText;
  const main = w.kind === 'say' ? m.ja_easy ?? m.ja : w.ja;
  const mean = m.en ?? '';
  return (
    <li className="word">
      <span className="word__ja" lang="ja"><Ruby s={main} furigana /></span>
      {mean && <span className="word__mean" lang="en"><Ruby s={mean} /></span>}
      <span className="word__btns">
        <Speak ja={main} name={main} />
        <button type="button" className="seg word__star" aria-pressed={starred} aria-label={line(ui('words.star'), level) + '：' + main.replace(/\{([^|}]+)\|[^}]+\}/g, '$1')} onClick={onStar}>
          <span aria-hidden="true">{starred ? '★' : '☆'}</span>
        </button>
      </span>
    </li>
  );
}

/** 付き添いの「窓口で」：聞こえてくるかもしれない言葉（3つ。★を先に） */
export function HeardWords({ place }: { place: string }) {
  const { logs, star } = useWordLog();
  const list = heardFirst(allWords(), logs, place);
  useSeen(list.map((w) => w.id));
  if (!list.length) return null;
  return (
    <section aria-labelledby="heard-title">
      <h2 id="heard-title" className="label"><One phrase k="words.heard" /></h2>
      <ul className="words" role="list">{list.map((w) => <WordRow key={w.id} w={w} starred={!!logs[w.id]?.starred} onStar={() => star(w.id)} />)}</ul>
    </section>
  );
}

const KIND_KEY: Record<WordKind, UiKey> = { heard: 'words.kind.heard', say: 'words.kind.say', official: 'words.kind.official', doc: 'words.kind.doc' };
const MODES: { m: WordMode; k: UiKey }[] = [{ m: 'all', k: 'words.mode.all' }, { m: 'seen', k: 'words.mode.seen' }, { m: 'star', k: 'words.mode.star' }];

/** どの画面からでも /words に行き、すぐ戻るための記憶。メモリの中だけ（URL・保存先には書かない） */
let prev: { path: string; y: number } | null = null;

/** ヘッダーのボタン：見えるラベル付き、44px 以上。押した画面と位置を覚える */
export function WordsButton() {
  const path = usePath();
  const here = path === '/words';
  const go = () => {
    if (here) return;
    prev = { path: location.pathname, y: window.scrollY };
    navigate('/words');
  };
  return (
    <button type="button" className="words-btn" aria-current={here ? 'page' : undefined} onClick={go}>
      <One k="nav.words" />
    </button>
  );
}

function back() {
  const p = prev;
  prev = null;
  navigate(p?.path ?? '/');
  if (!p) return;
  // 画面が描き直されて、見出しへのスクロールが終わってから位置を戻す
  const restore = () => window.scrollTo(0, p.y);
  requestAnimationFrame(() => requestAnimationFrame(restore));
  setTimeout(restore, 120);
}

export function WordsPage() {
  useFocusTitle('words');
  const { level } = usePrefs();
  const { logs, star } = useWordLog();
  const [mode, setMode] = useState<WordMode>('all');
  const [kind, setKind] = useState<WordKind | ''>('');
  const [todayOnly, setTodayOnly] = useState(false);
  const [q, setQ] = useState('');
  const words = allWords();
  const filtered = !!(kind || todayOnly || q.trim());
  const list = useMemo(() => listWords(words, logs, { mode, kind: kind || undefined, today: todayOnly ? todayJst() : undefined, q }), [words, logs, mode, kind, todayOnly, q]);
  // 「さいきん見たもの」：すべてのモードで同じ絞り込みのとき（絞り込みなし）だけ、上に10件
  const recent = useMemo(() => (mode === 'all' && !filtered ? recentWords(words, logs) : []), [words, logs, mode, filtered]);
  const recentIds = new Set(recent.map((r) => r.w.id));
  const rest = recent.length ? list.filter(({ w }) => !recentIds.has(w.id)) : list;
  const row = ({ w, log }: { w: WordView; log: WordLog }) => <WordRow key={w.id} w={w} starred={log.starred} onStar={() => star(w.id)} />;
  return (
    <>
      <p><button type="button" className="seg words-back" onClick={back}><span aria-hidden="true">← </span><One k="nav.backPrev" /></button></p>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi phrase k="words.title" /></h1></div>
      <p className="sub"><Bi k="words.sub" /></p>
      <div className="words-filter" role="group" aria-label={line(ui('words.filter'), level)}>
        {MODES.map(({ m, k }) => (
          <button key={m} type="button" className="seg" aria-pressed={mode === m} onClick={() => setMode(m)}><One k={k} /></button>
        ))}
        <button type="button" className="seg" aria-pressed={todayOnly} onClick={() => setTodayOnly((x) => !x)}><One k="words.today" /></button>
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as WordKind | '')} aria-label={line(ui('words.kind'), level)}>
          <option value="">{line(ui('words.kind.all'), level)}</option>
          {WORD_KINDS.map((k) => <option key={k} value={k}>{line(ui(KIND_KEY[k]), level)}</option>)}
        </select>
        <input className="field" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={line(ui('words.search'), level)} aria-label={line(ui('words.search'), level)} />
      </div>
      {recent.length > 0 && (
        <section aria-labelledby="words-recent">
          <h2 id="words-recent" className="label"><One phrase k="words.recent" /></h2>
          <ul className="words" role="list">{recent.map(row)}</ul>
        </section>
      )}
      {rest.length > 0 ? (
        <ul className="words" role="list">{rest.map(row)}</ul>
      ) : recent.length === 0 && (
        <p className="sub"><Bi k={filtered ? 'words.noMatch' : 'words.empty'} /></p>
      )}
    </>
  );
}
