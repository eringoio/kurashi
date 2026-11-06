/* ことばの部品（語学学習の最初の版。作者が OK 2026-11-06）：記録のフック、1つの言葉の行（日本語・意味・読み上げ・★）、/words の画面 */
import { useEffect, useMemo, useState } from 'react';
import { allWords, pageTopics, heardFirst, listWords, logSeen, wordById, WORD_KINDS, WORD_TOPICS, type WordKind, type WordLog, type WordMode, type WordTopic, type WordView } from '../core/words';
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
  const seen = (ids: string[]) => { const t = todayJst(), now = Date.now(); void vault.putMany('phrases', ids.map((id) => [id, logSeen(logs[id], id, t, now)])); };
  const star = (id: string) => { const p = logs[id] ?? logSeen(undefined, id, todayJst()); void vault.put('phrases', id, { ...p, starred: !p.starred }); };
  return { logs, seen, star };
}

/** いまの画面に出た言葉（/words の「この画面のことば」に使う）。メモリの中だけ（URL・保存先には書かない） */
let onPage: { path: string; ids: string[] } = { path: '', ids: [] };
function addOnPage(ids: string[]) {
  const path = location.pathname;
  if (path === '/words') return;
  if (onPage.path !== path) onPage = { path, ids: [] };
  for (const id of ids) if (!onPage.ids.includes(id)) onPage.ids.push(id);
}

/** 画面に出た言葉を残す（一度だけ）。その画面の言葉としても覚える。
    keep=false：保存しない（メモリの「この画面のことば」だけ）。病院の画面は AT-clinic-05（IndexedDB に病院の値を残さない） */
export function useSeen(ids: string[], keep = true) {
  const { seen } = useWordLog();
  // 道も鍵に入れる：同じ言葉の画面へ移ったときも「この画面のことば」に入れる
  const key = location.pathname + '|' + ids.join(',');
  // 1拍おくらせる：子の effect は親より先に走るので、そのままだと「どこまで進んだか」（resume）の保存より先に書き込みが並ぶ
  useEffect(() => { if (!ids.length) return; const t = setTimeout(() => { addOnPage(ids); if (keep) seen(ids); }, 0); return () => clearTimeout(t); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
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

/** 画面の中の言葉の一覧（/words と同じ行。どの表示レベルでも同じ形）。出したら記録する */
export function WordList({ ids, keep = true }: { ids: string[]; keep?: boolean }) {
  const { logs, star } = useWordLog();
  const list = ids.map(wordById).filter((w): w is WordView => !!w);
  useSeen(list.map((w) => w.id), keep);
  if (!list.length) return null;
  return <ul className="words" role="list">{list.map((w) => <WordRow key={w.id} w={w} starred={!!logs[w.id]?.starred} onStar={() => star(w.id)} />)}</ul>;
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

const KIND_KEY: Record<WordKind, UiKey> = { word: 'words.kind.word', heard: 'words.kind.heard', say: 'words.kind.say', official: 'words.kind.official', doc: 'words.kind.doc' };
const MODES: { m: WordMode; k: UiKey }[] = [{ m: 'all', k: 'words.mode.all' }, { m: 'seen', k: 'words.mode.seen' }, { m: 'star', k: 'words.mode.star' }];

/** どの画面からでも /words に行き、すぐ戻るための記憶。メモリの中だけ（URL・保存先には書かない） */
let prev: { path: string; y: number; ids: string[] } | null = null;

/** ヘッダーのボタン：見えるラベル付き、44px 以上。押した画面と位置を覚える */
export function WordsButton() {
  const path = usePath();
  const here = path === '/words';
  const go = () => {
    if (here) return;
    prev = { path: location.pathname, y: window.scrollY, ids: onPage.path === location.pathname ? [...onPage.ids] : [] };
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

const TOPIC_KEY = (t: WordTopic) => ('words.topic.' + t) as UiKey;

export function WordsPage() {
  useFocusTitle('words');
  const { level } = usePrefs();
  const { logs, star } = useWordLog();
  // 作者 11/7：はじめは全部を新しい順（見た言葉を新しい順に、まだ見ていない言葉はそのあと words.ts の並び）。場所で絞り込める
  const [mode, setMode] = useState<WordMode>('all');
  const [kind, setKind] = useState<WordKind | ''>('');
  const [place, setPlace] = useState<WordTopic | ''>('');
  const [q, setQ] = useState('');
  // 開いた画面の言葉（ヘッダーのボタンで来たときだけ）
  const [pageIds] = useState(() => prev?.ids ?? []);
  const [pageTop] = useState(() => (prev ? pageTopics(prev.path) : []));
  const words = allWords();
  const filtered = !!(kind || place || q.trim());
  const list = useMemo(() => listWords(words, logs, { mode, kind: kind || undefined, topic: place || undefined, q }), [words, logs, mode, kind, place, q]);
  const onThis = new Set(pageIds);
  // この画面のことば：その画面の場所の言葉を先に、あとは全体と同じ並び（分野 → 種類）
  const pos = (w: WordView) => (pageTop.includes(w.topic) ? 0 : 1) * 100000 + words.indexOf(w);
  const page = list.filter((r) => onThis.has(r.w.id)).sort((x, y) => pos(x.w) - pos(y.w));
  const rest = list.filter(({ w }) => !onThis.has(w.id));
  const seen = rest.filter((r) => r.log.count > 0);
  const unseen = rest.filter((r) => r.log.count === 0);
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
        <select className="field" value={kind} onChange={(e) => setKind(e.target.value as WordKind | '')} aria-label={line(ui('words.kind'), level)}>
          <option value="">{line(ui('words.kind.all'), level)}</option>
          {WORD_KINDS.map((k) => <option key={k} value={k}>{line(ui(KIND_KEY[k]), level)}</option>)}
        </select>
        <select className="field" value={place} onChange={(e) => setPlace(e.target.value as WordTopic | '')} aria-label={line(ui('words.place'), level)}>
          <option value="">{line(ui('words.place.all'), level)}</option>
          {WORD_TOPICS.filter((t) => words.some((w) => w.topic === t)).map((t) => <option key={t} value={t}>{line(ui(TOPIC_KEY(t)), level)}</option>)}
        </select>
        <input className="field" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={line(ui('words.search'), level)} aria-label={line(ui('words.search'), level)} />
      </div>
      {page.length > 0 && (
        <section aria-labelledby="words-page">
          <h2 id="words-page" className="label"><One phrase k="words.onPage" /></h2>
          <ul className="words" role="list">{page.map(row)}</ul>
        </section>
      )}
      {seen.length > 0 && (
        <section aria-labelledby="words-seen">
          <h2 id="words-seen" className="label"><One phrase k="words.seenH" /></h2>
          <ul className="words" role="list">{seen.map(row)}</ul>
        </section>
      )}
      {unseen.length > 0 && (
        <section aria-labelledby="words-rest">
          <h2 id="words-rest" className="label"><One phrase k="words.restH" /></h2>
          <ul className="words" role="list">{unseen.map(row)}</ul>
        </section>
      )}
      {!page.length && !rest.length && <p className="sub"><Bi k={filtered ? 'words.noMatch' : 'words.empty'} /></p>}
    </>
  );
}
