/* 届いた書類を撮る（SPEC 6A.9・13.1〜13.3。v0.4.6 の案 B）。
   撮る → 写真を確かめる＋同意（撮るたび）→ 送る → 候補を本人が確かめる → 結果（説明と関係する手続き）。
   写真と結果はこの画面のメモリの中だけ（IndexedDB に書かない。画面を離れたら消える）。同意も保存しない。
   読めない・同意しない・キーが無いときも止まらない：一覧から選ぶ・見本の画像で試す。 */
import { useEffect, useRef, useState } from 'react';
import { cleanCandidates, DOCUMENTS, type KnownDocument } from '../core/documents';
import { useGuide } from '../guide/useGuide';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { fill, CardRow } from '../ui/guide';
import { line, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from '../ui/art';
import { Link, useFocusTitle } from '../ui/router';

const LONG = 1600;
const SAMPLE = '/samples/kokuho-shikaku-sample.svg';

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

const docOf = (id: string) => DOCUMENTS().find((d) => d.id === id)!;

export function Letter() {
  const { level } = usePrefs();
  const [st, setSt] = useState<St>({ k: 'intro' });
  const file = useRef<HTMLInputElement>(null);
  useFocusTitle('letter:' + st.k + ('i' in st ? st.i : '') + ('doc' in st ? st.doc.id : ''));
  // 画面を離れたら、写真をメモリから消す
  useEffect(() => () => setSt({ k: 'intro' }), []);
  const Title = ({ children }: { children: React.ReactNode }) => <h1 id="screen-title" tabIndex={-1}>{children}</h1>;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try { const j = await toJpeg(f); setSt({ k: 'preview', photo: { ...j, media: 'image/jpeg', sample: false } }); }
    catch { setSt({ k: 'failed' }); }
    if (file.current) file.current.value = '';
  };
  const trySample = async () => {
    try { const j = await toJpeg(SAMPLE); setSt({ k: 'preview', photo: { ...j, media: 'image/jpeg', sample: true } }); }
    catch { setSt({ k: 'failed' }); }
  };
  const send = async (photo: Photo) => {
    setSt({ k: 'sending', photo });
    try {
      const r = await fetch('/api/read-document', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true, media_type: photo.media, data: photo.data }) });
      if (!r.ok) throw new Error(String(r.status));
      const body = await r.json() as { sample?: boolean };
      const ids = cleanCandidates(body, DOCUMENTS().map((d) => d.id)).map((c) => c.id);
      setSt(ids.length ? { k: 'confirm', ids, i: 0, sample: !!body.sample || photo.sample } : { k: 'failed' });
    } catch { setSt({ k: 'failed' }); }
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
      <button type="button" className="k-answer" onClick={() => setSt({ k: 'pick' })}><Bi k="letter.pick" /></button>
      <button type="button" className="k-answer" onClick={() => void trySample()}><Bi k="letter.sample" /></button>
    </div>
  );

  let body: React.ReactNode;
  if (st.k === 'intro') {
    body = (
      <>
        <div className="art" aria-hidden="true"><img src={art('letter')} alt="" className="art--big" /></div>
        <div className="head"><Title><Bi k="letter.title" /></Title></div>
        <p className="sub"><Bi k="letter.intro" /></p>
        {fileInput}
        {alt}
      </>
    );
  } else if (st.k === 'preview' || st.k === 'sending') {
    const busy = st.k === 'sending';
    body = (
      <>
        <div className="head"><Title><Bi k="letter.check" /></Title></div>
        <img className="letter__photo" src={st.photo.url} alt={line(ui('letter.photoAlt'), level)} />
        {st.photo.sample && <p className="draftmark"><Bi k="letter.sampleMark" /></p>}
        <div className="k-notice" role="note"><Bi k="letter.consent" /></div>
        <div className="list">
          <button type="button" className="k-answer k-answer--primary" disabled={busy} aria-busy={busy} onClick={() => void send(st.photo)}><Bi k={busy ? 'letter.sending' : 'letter.send'} /></button>
          <button type="button" className="k-answer" disabled={busy} onClick={() => file.current?.click()}><Bi k="letter.retake" /></button>
          <button type="button" className="k-answer" disabled={busy} onClick={() => setSt({ k: 'pick' })}><Bi k="letter.noSend" /></button>
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
          <button type="button" className="k-answer k-answer--primary" onClick={() => setSt({ k: 'result', doc: d, sample: st.sample })}><Bi k="letter.yes" /></button>
          <button type="button" className="k-answer" onClick={() => setSt(st.i + 1 < st.ids.length ? { ...st, i: st.i + 1 } : { k: 'pick' })}><Bi k="letter.no" /></button>
          <button type="button" className="k-answer" onClick={() => setSt({ k: 'unknown' })}><Bi k="letter.dontKnow" /></button>
        </div>
      </>
    );
  } else if (st.k === 'pick') {
    body = (
      <>
        <div className="head"><Title><Bi k="letter.pickTitle" /></Title></div>
        <ul className="list" role="list">
          {DOCUMENTS().map((d) => <li key={d.id}><button type="button" className="k-answer" onClick={() => setSt({ k: 'result', doc: d, sample: false })}><img src={art('doc')} alt="" /><Bi t={d.title} /></button></li>)}
          <li><button type="button" className="k-answer" onClick={() => setSt({ k: 'unknown' })}><Bi k="letter.dontKnow" /></button></li>
        </ul>
      </>
    );
  } else if (st.k === 'result') {
    body = <Result doc={st.doc} sample={st.sample} />;
  } else if (st.k === 'failed') {
    body = (
      <>
        <div className="head"><Title><Bi k="letter.failed" /></Title></div>
        <p className="sub"><Bi k="letter.failedSub" /></p>
        {fileInput}
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
        {st.k !== 'intro' && <button type="button" className="link" onClick={() => setSt({ k: 'intro' })}><Bi k="letter.again" /></button>}
        <Link to="/" className="link"><Bi k="nav.home" /></Link>
      </div>
    </>
  );
}


function Result({ doc, sample }: { doc: KnownDocument; sample: boolean }) {
  const g = useGuide();
  const cards = g.out.cards.filter((c) => doc.card_ids.includes(c.card.id));
  return (
    <>
      <div className="head">
        <p className="eyebrow"><One k="letter.resultEyebrow" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi t={doc.title} /></h1>
      </div>
      {sample && <p className="draftmark"><Bi k="letter.sampleMark" /></p>}
      <p><Bi t={doc.summary} /></p>
      <div className="k-notice" role="note"><Bi k="letter.notRead" /></div>
      {cards.length > 0 && (
        <section aria-labelledby="letter-cards">
          <h2 id="letter-cards" className="label"><One k="letter.related" /></h2>
          <ul className="list" role="list">{cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
        </section>
      )}
      <p className="sub"><Bi k="letter.checkStatus" /></p>
    </>
  );
}
