/* 届いた書類を撮る（SPEC 6A.9・13.1〜13.3。v0.4.6 の案 B）。
   撮る → 写真を確かめる＋同意（撮るたび）→ 送る → 候補を本人が確かめる → 結果（説明と関係する手続き）。
   写真と結果はこの画面のメモリの中だけ（IndexedDB に書かない。画面を離れたら消える）。同意も保存しない。
   読めない・同意しない・キーが無いときも止まらない：一覧から選ぶ。
   作者 11/7 K-11：写真の読み取りは VITE_LETTER_READ=on（API キーを入れたあと）のときだけ出す。off のときは一覧から選ぶだけ。
   「見本で試す」はやめ、一覧で選ぶ → 見本の画像（架空）と説明・大事な言葉。 */
import { useEffect, useRef, useState } from 'react';
import { cleanCandidates, DOCUMENTS, type KnownDocument } from '../core/documents';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { fill } from '../ui/guide';
import { DocAbout } from '../ui/DocAbout';
import { DocSearchList } from '../ui/DocSearch';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { arrivedByHistory, navigate, useFocusTitle } from '../ui/router';
import { useSeen } from '../ui/Words';
import { trackError } from '../ui/telemetry';
import { getReadToken, READ_TOKEN_HEADER } from '../ui/readToken';
/** 結果の書類の名前を「ことば」に残す（10b） */
export function SeenDoc({ id }: { id: string }) { useSeen(['doc:' + id]); return null; }

const LONG = 1600;
/** 写真の読み取り（Claude）。キーを入れて公開するときに on にする */
export const LETTER_READ_ON = import.meta.env.VITE_LETTER_READ === 'on'
  // 開発のときだけ、テストのために sessionStorage の kurashi:letter_read=on でも on にする（本番のビルドでは読まない）
  || (import.meta.env.DEV && typeof sessionStorage !== 'undefined' && sessionStorage.getItem('kurashi:letter_read') === 'on');
/** 作者のテスト（READ_MODE=test）：/review でトークンを入れたタブだけ、写真の欄を出す（v0.5.23） */
const readOn = () => LETTER_READ_ON || !!getReadToken();

type Photo = { url: string; data: string; media: 'image/jpeg'; sample: boolean };
type St =
  | { k: 'intro' }
  | { k: 'preview'; photo: Photo }
  | { k: 'sending'; photo: Photo }
  | { k: 'confirm'; ids: string[]; i: number; sample: boolean }
  | { k: 'pick' }
  | { k: 'result'; doc: KnownDocument; sample: boolean }
  | { k: 'failed' }
  | { k: 'unknown' };

/** 長辺 1600px の JPEG にする（描き直すので、位置などの情報 EXIF は残らない） */
async function toJpeg(src: Blob | string): Promise<{ url: string; data: string }> {
  const img = new Image();
  img.decoding = 'async';
  img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  await img.decode();
  const s = Math.min(1, LONG / Math.max(img.naturalWidth || LONG, img.naturalHeight || LONG));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round((img.naturalWidth || LONG) * s));
  c.height = Math.max(1, Math.round((img.naturalHeight || LONG) * s));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (typeof src !== 'string') URL.revokeObjectURL(img.src);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { url, data: url.slice(url.indexOf(',') + 1) };
}

/* 一覧から /doc/{id} へ進んだあと、ブラウザの戻るで /letter に戻ったとき、一覧と検索の言葉を戻す。
   メモリ（この変数）の中だけ。URL・history.state・保存には入れない。写真は戻さない（SPEC 13.4）。 */
let listMemo: { q: string } | null = null;
const takeMemo = () => (arrivedByHistory() ? listMemo : null); // 戻る・進むで来たときだけ

// 外に置く（中で作ると、描き直すたびに見出しが作り直されて、フォーカスが外れる）
const Title = ({ children }: { children: React.ReactNode }) => <h1 id="screen-title" tabIndex={-1}>{children}</h1>;

const docOf = (id: string) => DOCUMENTS().find((d) => d.id === id)!;

export function Letter() {
  const { level } = usePrefs();
  const [memo] = useState(takeMemo);
  const [st, setSt] = useState<St>(memo ? { k: 'pick' } : { k: 'intro' });
  const query = useRef(memo?.q ?? '');
  useEffect(() => { listMemo = null; }, []);
  const file = useRef<HTMLInputElement>(null);
  useFocusTitle('letter:' + st.k + ('i' in st ? st.i : '') + ('doc' in st ? st.doc.id : ''));
  // 画面を離れると、この画面の状態（写真を含む）は React ごと捨てられる。
  // （ここで setSt すると、StrictMode の開発で入り直しのたびに入口へ戻ってしまうので、書かない）

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { const j = await toJpeg(f); setSt({ k: 'preview', photo: { ...j, media: 'image/jpeg', sample: false } }); }
    catch { trackError('photo', 'resize'); setSt({ k: 'failed' }); }
    if (file.current) file.current.value = '';
  };
  const send = async (photo: Photo) => {
    setSt({ k: 'sending', photo });
    try {
      const token = getReadToken();
      const headers: Record<string, string> = { 'content-type': 'application/json', ...(token ? { [READ_TOKEN_HEADER]: token } : {}) };
      const r = await fetch('/api/read-document', { method: 'POST', headers, body: JSON.stringify({ consent: true, media_type: photo.media, data: photo.data }) });
      if (!r.ok) throw new Error(String(r.status));
      const body = await r.json() as { sample?: boolean };
      const ids = cleanCandidates(body, DOCUMENTS().map((d) => d.id)).map((c) => c.id);
      if (!ids.length) trackError('read', 'no_candidate');
      setSt(ids.length ? { k: 'confirm', ids, i: 0, sample: !!body.sample || photo.sample } : { k: 'failed' });
    } catch (e) { trackError('read', (e as Error).message); setSt({ k: 'failed' }); }
  };

  const fileInput = (
    <label className="k-answer k-answer--primary">
      <img src={art('doc')} alt="" />
      <Bi k="letter.take" />
      <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
    </label>
  );
  const alt = (
    <div className="list">
      <button type="button" className="k-answer" onClick={() => setSt({ k: 'pick' })}><Bi phrase k="letter.pick" /></button>
    </div>
  );
  // 書類の一覧と検索の欄（v0.5.31）：名前と、説明の大事な言葉から探せる
  const pickList = (
    <DocSearchList initialQuery={query.current} onQueryChange={(q) => { query.current = q; }}
      onPick={(d) => { listMemo = { q: query.current }; navigate('/doc/' + d.id); }}
      extra={<li><button type="button" className="k-answer" onClick={() => setSt({ k: 'unknown' })}><Bi phrase k="letter.dontKnow" /></button></li>} />
  );

  let body: React.ReactNode;
  if (st.k === 'intro') {
    body = (
      <>
        <div className="art" aria-hidden="true"><img src={art('letter')} alt="" className="art--big" /></div>
        <div className="head"><Title><Bi phrase k="letter.title" /></Title></div>
        {readOn() ? <><p className="sub"><Bi k="letter.intro" /></p>{fileInput}{alt}</> : <><p className="sub"><Bi k="letter.pickHint" /></p>{pickList}</>}
      </>
    );
  } else if (st.k === 'preview' || st.k === 'sending') {
    const busy = st.k === 'sending';
    body = (
      <>
        <div className="head"><Title><Bi k="letter.check" /></Title></div>
        <img className="letter__photo" src={st.photo.url} alt={line(ui('letter.photoAlt'), level)} />
        {st.photo.sample && <p className="draftmark"><Bi k="letter.sampleMark" /></p>}
        {/* くわしい保持・アメリカの制度は「使う情報について」。写真が消えないよう、新しいタブで開く */}
        <div className="k-notice" role="note"><Bi k="letter.consent" /> <a className="link" href="/info/privacy" target="_blank" rel="noopener"><Bi k="privacy.link" /><span className="sr-only"><One k="here.newTab" /></span></a></div>
        <div className="list">
          <button type="button" className="k-answer k-answer--primary" disabled={busy} aria-busy={busy} onClick={() => void send(st.photo)}><Bi phrase k={busy ? 'letter.sending' : 'letter.send'} /></button>
          <button type="button" className="k-answer" disabled={busy} onClick={() => file.current?.click()}><Bi phrase k="letter.retake" /></button>
          <button type="button" className="k-answer" disabled={busy} onClick={() => setSt({ k: 'pick' })}><Bi phrase k="letter.noSend" /></button>
        </div>
        <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e.target.files?.[0])} />
        {busy && <p className="sr-only" role="status"><One k="letter.sending" /></p>}
      </>
    );
  } else if (st.k === 'confirm') {
    const d = docOf(st.ids[st.i]);
    const q = fill(ui('letter.confirmQ'), 'word', () => d.look_for);
    body = (
      <>
        <div className="head">
          <p className="eyebrow"><Bi t={fill(ui('letter.maybe'), 'doc', (_lv, id) => d.title[id] ?? d.title.ja_easy ?? d.title.ja)} /></p>
          <Title><Bi t={q} /></Title>
        </div>
        <p className="k-counter__ja letter__word" lang="ja"><Ruby s={d.look_for} /></p>
        <div className="list">
          <button type="button" className="k-answer k-answer--primary" onClick={() => setSt({ k: 'result', doc: d, sample: st.sample })}><Bi phrase k="letter.yes" /></button>
          <button type="button" className="k-answer" onClick={() => setSt(st.i + 1 < st.ids.length ? { ...st, i: st.i + 1 } : { k: 'pick' })}><Bi phrase k="letter.no" /></button>
          <button type="button" className="k-answer" onClick={() => setSt({ k: 'unknown' })}><Bi phrase k="letter.dontKnow" /></button>
        </div>
      </>
    );
  } else if (st.k === 'pick') {
    body = (
      <>
        <div className="head"><Title><Bi k="letter.pickTitle" /></Title></div>
        {pickList}
      </>
    );
  } else if (st.k === 'result') {
    body = <><DocAbout doc={st.doc} sample={st.sample} /><SeenDoc id={st.doc.id} /></>;
  } else if (st.k === 'failed') {
    body = (
      <>
        <div className="head"><Title><Bi k="letter.failed" /></Title></div>
        <p className="sub"><Bi k="letter.failedSub" /></p>
        {readOn() && fileInput}
        {alt}
      </>
    );
  } else {
    body = (
      <>
        <div className="head"><Title><Bi k="letter.unknownTitle" /></Title></div>
        <p className="sub"><Bi k="letter.unknownSub" /></p>
      </>
    );
  }
  return (
    <>
      {body}
      <div className="links">
        {st.k !== 'intro' && <button type="button" className="k-answer k-answer--small" onClick={() => setSt({ k: "intro" })}><Bi k="letter.again" /></button>}
      </div>
    </>
  );
}


