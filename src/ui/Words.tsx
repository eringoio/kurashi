/* ことばの部品（語学学習の最初の版。作者が OK 2026-11-06）：記録のフック、1つの言葉の行（日本語・意味・読み上げ・★）、/words の画面 */
import { useEffect, useMemo, useState } from 'react';
import { allWords, heardFirst, listWords, logSeen, WORD_KINDS, type WordKind, type WordLog, type WordView } from '../core/words';
import { todayJst } from '../core/date';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { line, show, ui, type LocalizedText, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { useFocusTitle } from './router';
import { Speak } from './Speak';

/** 記録（phrases ストア。同意の前は vault がメモリの中だけに置く） */
export function useWordLog() {
  const { vault } = usePrefs();
  const logs = Object.fromEntries(vault.entries('phrases').map(([k, v]) => [k, v as WordLog])) as Record<string, WordLog>;
  const seen = (ids: string[]) => { const t = todayJst(); for (const id of ids) { const p = logs[id]; if (p?.last_seen === t) continue; void vault.put('phrases', id, logSeen(p, id, t)); } };
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
  const mean = show(w.meaning as LocalizedText, level);
  return (
    <li className="word">
      <span className="word__ja" lang="ja"><Ruby s={w.ja} /></span>
      <span className="word__mean" lang={mean.mainLang}><Ruby s={mean.main} /></span>
      <span className="word__btns">
        <Speak ja={w.ja} />
        <button type="button" className="seg word__star" aria-pressed={starred} aria-label={line(ui('words.star'), level) + '：' + w.ja.replace(/\{([^|}]+)\|[^}]+\}/g, '$1')} onClick={onStar}>
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
      <h2 id="heard-title" className="label"><One k="words.heard" /></h2>
      <ul className="words" role="list">{list.map((w) => <WordRow key={w.id} w={w} starred={!!logs[w.id]?.starred} onStar={() => star(w.id)} />)}</ul>
    </section>
  );
}

const KIND_KEY: Record<WordKind, UiKey> = { heard: 'words.kind.heard', say: 'words.kind.say', official: 'words.kind.official', doc: 'words.kind.doc' };

export function WordsPage() {
  useFocusTitle('words');
  const { level } = usePrefs();
  const { logs, star } = useWordLog();
  const [starred, setStarred] = useState(false);
  const [kind, setKind] = useState<WordKind | ''>('');
  const [todayOnly, setTodayOnly] = useState(false);
  const [q, setQ] = useState('');
  const words = allWords();
  const list = useMemo(() => listWords(words, logs, { starred, kind: kind || undefined, today: todayOnly ? todayJst() : undefined, q }), [words, logs, starred, kind, todayOnly, q]);
  // まだ何も出会っていないときは、言う文から始められるように（最初の数語を出会ったことにはしない。一覧から選ぶ）
  const starter = Object.keys(logs).length === 0 ? words.filter((w) => w.kind === 'say') : [];
  return (
    <>
      <div className="head"><h1 id="screen-title" tabIndex={-1}><Bi k="words.title" /></h1></div>
      <p className="sub"><Bi k="words.sub" /></p>
      <div className="words-filter" role="group" aria-label={line(ui('words.filter'), level)}>
        <button type="button" className="seg" aria-pressed={starred} onClick={() => setStarred((x) => !x)}><One k="words.onlyStar" /></button>
        <button type="button" className="seg" aria-pressed={todayOnly} onClick={() => setTodayOnly((x) => !x)}><One k="words.today" /></button>
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as WordKind | '')} aria-label={line(ui('words.kind'), level)}>
          <option value="">{line(ui('words.kind.all'), level)}</option>
          {WORD_KINDS.map((k) => <option key={k} value={k}>{line(ui(KIND_KEY[k]), level)}</option>)}
        </select>
        <input className="field" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={line(ui('words.search'), level)} aria-label={line(ui('words.search'), level)} />
      </div>
      {list.length > 0 ? (
        <ul className="words" role="list">{list.map(({ w, log }) => <WordRow key={w.id} w={w} starred={log.starred} onStar={() => star(w.id)} />)}</ul>
      ) : (
        <p className="sub"><Bi k="words.empty" /></p>
      )}
      {starter.length > 0 && (
        <section aria-labelledby="words-start">
          <h2 id="words-start" className="label"><One k="words.start" /></h2>
          <ul className="words" role="list">{starter.map((w) => <WordRow key={w.id} w={w} starred={false} onStar={() => star(w.id)} />)}</ul>
        </section>
      )}
    </>
  );
}
