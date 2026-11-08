/* 書類の説明（SPEC 6A.9a。v0.5.25）。どの書類も同じ部品で、データにある欄だけを出す。
   並び：名前と種類 → 見本 → 何の書類（短く）→ 気をつけること → 何をすればいい → 誰に関係がある → くわしく（たたむ）
   → 関係する書類・手続き → 公式の情報 → 大事な言葉。
   期限・金額・番号は、本人の書類を見る（このアプリは読まない）。することは、公式の資料で確かめたことだけ。 */
import { DATA } from '../core/data';
import { documentById, type KnownDocument } from '../core/documents';
import { docWordIds } from '../core/words';
import { useGuide } from '../guide/useGuide';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from './art';
import { CardRow, TrustMark } from './guide';
import { Link } from './router';
import { WordList } from './Words';

const FMT = (ymd: string, lang: string) =>
  new Intl.DateTimeFormat(lang, { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(ymd + 'T00:00:00Z'));

/** 見出しのある段（見出しの id は書類ごとに1つ） */
function Part({ id, k, children, mark }: { id: string; k: UiKey; children: React.ReactNode; mark?: React.ReactNode }) {
  return (
    <section className="doc__part" aria-labelledby={id}>
      <h2 id={id} className="label"><One phrase k={k} />{mark && <> {mark}</>}</h2>
      {children}
    </section>
  );
}

export function DocAbout({ doc, sample = false }: { doc: KnownDocument; sample?: boolean }) {
  const g = useGuide();
  const { level } = usePrefs();
  const d = DATA();
  const id = (s: string) => `doc-${doc.id}-${s}`;
  const cards = g.out.cards.filter((c) => doc.card_ids.includes(c.card.id));
  const related = doc.related_docs.map(documentById).filter((x): x is KnownDocument => !!x);
  const links = doc.links.map((l) => ({ ...l, s: d.sources.find((x) => x.source_id === l.source_id) })).filter((l) => l.s?.url);
  // 説明の欄の確認状態（名前だけ確かめた書類に説明を足したときは要確認）
  const ev = doc.about_evidence ?? doc.evidence;
  const verified = ev.status === 'verified';
  const lang = level.kind === 'foreign' ? level.lang : 'ja';
  return (
    <div className="doc">
      <div className="head">
        <p className="eyebrow"><One k="letter.resultEyebrow" /></p>
        <h1 id="screen-title" tabIndex={-1}><Bi phrase t={doc.title} /></h1>
        {(doc.kind || doc.issuer) && (
          <p className="doc__tags">
            {doc.kind && <span className={'doc__tag' + (doc.kind === 'warning' ? ' doc__tag--warn' : '')}><One k={('doc.kind.' + doc.kind) as UiKey} /></span>}
            {doc.issuer && <span className="doc__issuer"><One k="doc.issuer" />：<Bi t={doc.issuer} /></span>}
          </p>
        )}
      </div>
      {doc.publication !== 'public' && <p className="draftmark"><Bi k="doc.inReview" /></p>}
      {sample && <p className="draftmark"><Bi k="letter.sampleMark" /></p>}
      {/* 見本：説明用の架空の見本と公式の見本を分けて書く */}
      {doc.sample && (
        <figure className="doc__sample">
          <img className="letter__photo" src={doc.sample} alt={line(ui(doc.sample_kind === 'official' ? 'doc.sample.officialAlt' : 'letter.sampleAlt'), level)} />
          <figcaption className="sub"><Bi k={doc.sample_kind === 'official' ? 'doc.sample.official' : 'doc.sample.illustration'} /></figcaption>
        </figure>
      )}
      <p><Bi t={doc.summary} /></p>
      {doc.caution && <div className={'k-notice' + (doc.kind === 'warning' ? ' doc__warn' : '')} role="note"><Bi t={doc.caution} /></div>}

      {/* 何をすればいい（いちばん大事）。確認済みでなければ見出しに印を出さない（要確認は下の1行） */}
      <Part id={id('do')} k="doc.actions" mark={<TrustMark e={ev} />}>
        {doc.actions.length
          ? <ol className="doc__steps">{doc.actions.map((a, i) => <li key={i}><Bi t={a} /></li>)}</ol>
          : <p><Bi k="doc.actionsNone" /></p>}
      </Part>
      {doc.who && <Part id={id('who')} k="doc.who"><p><Bi t={doc.who} /></p></Part>}

      {(doc.purpose || doc.how_to_get || doc.fields.length > 0) && (
        <details className="group__more doc__more">
          <summary><One phrase k="doc.more" /></summary>
          {doc.purpose && <Part id={id('why')} k="doc.purpose"><p><Bi t={doc.purpose} /></p></Part>}
          {doc.how_to_get && <Part id={id('get')} k="doc.howToGet"><p><Bi t={doc.how_to_get} /></p></Part>}
          {doc.fields.length > 0 && (
            <Part id={id('fields')} k="doc.fields">
              <dl className="k-facts">
                {doc.fields.map((f, i) => (
                  <div key={i}>
                    <dt lang="ja"><Bi t={{ ja: f.label }} />{f.by && <span className="sub">（<One k={('doc.by.' + f.by) as UiKey} />）</span>}</dt>
                    <dd><Bi t={f.meaning} /></dd>
                  </div>
                ))}
              </dl>
            </Part>
          )}
        </details>
      )}

      {related.length > 0 && (
        <Part id={id('docs')} k="doc.relatedDocs">
          <ul className="list" role="list">
            {related.map((r) => <li key={r.id}><Link to={'/doc/' + r.id} className="k-answer"><img src={art('doc')} alt="" /><Bi phrase t={r.title} /></Link></li>)}
          </ul>
        </Part>
      )}
      {cards.length > 0 && (
        <section aria-labelledby="letter-cards">
          <h2 id="letter-cards" className="label"><One phrase k="letter.related" /></h2>
          <ul className="list" role="list">{cards.map((c) => <CardRow key={c.card.id} c={c} />)}</ul>
        </section>
      )}

      {links.length > 0 && (
        <section className="k-sources" aria-labelledby={id('links')}>
          <h2 className="label" id={id('links')}><One k="doc.links" /></h2>
          <ul role="list">
            {links.map((l) => (
              <li key={l.source_id + l.kind}>
                <span className="doc__linkkind"><One k={('doc.link.' + l.kind) as UiKey} /></span>{' '}
                <a className="link" href={l.s!.url!} target="_blank" rel="noopener noreferrer" lang="ja">{l.s!.owner}「{l.s!.title}」<span aria-hidden="true"> ↗</span><span className="sr-only"><One k="clinic.newTab" /></span></a>
              </li>
            ))}
          </ul>
          <p className="sub"><One k="src.checked" />：{FMT(ev.checked_at, lang)}・<One k={('src.status.' + ev.status) as UiKey} /></p>
        </section>
      )}

      {doc.key_words.length > 0 && (
        <section aria-labelledby="letter-words">
          <h2 id="letter-words" className="label"><One phrase k="letter.keyWords" /></h2>
          {/* ことばと同じ行（どの表示レベルでも、ふりがな付きの日本語と英語。読み上げ・お気に入り） */}
          <WordList ids={docWordIds(doc.id).slice(1)} />
        </section>
      )}
      <div className="k-notice" role="note"><Bi k="letter.notRead" /></div>
      {!verified && <p className="sub"><Bi k="letter.checkStatus" /></p>}
    </div>
  );
}
