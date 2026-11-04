/* 文を出す部品。ふりがなを消したときは <ruby> を出さない（SPEC 15.2） */
import { Fragment, type ElementType } from 'react';
import { segs, show, type LocalizedText, type UiKey, ui } from './text';
import { usePrefs } from '../storage/prefs';

export function Ruby({ s }: { s: string }) {
  const { furigana } = usePrefs();
  return (
    <>
      {segs(s).map((g, i) =>
        g.r && furigana ? (
          <ruby key={i}>
            {g.t}
            {/* 読みは目で見るためのもの。読み上げでは漢字だけを読ませ、二重に読まれないようにする（U34。VoiceOver の実機で確かめる） */}
            <rt aria-hidden="true">{g.r}</rt>
          </ruby>
        ) : (
          <Fragment key={i}>{g.t}</Fragment>
        ),
      )}
    </>
  );
}

/** 大事な文：表示レベルの1行。外国語のときは下にふりがな付きの日本語（BilingualText） */
export function Bi({ t, k, as, className }: { t?: LocalizedText; k?: UiKey; as?: ElementType; className?: string }) {
  const { level } = usePrefs();
  const text = t ?? ui(k!);
  const s = show(text, level);
  const Tag = as ?? 'span';
  return (
    <Tag className={'bi' + (className ? ' ' + className : '')}>
      <span className="bi__main" lang={s.mainLang}>
        <Ruby s={s.main} />
      </span>
      {s.sub && (
        <span className="bi__ja" lang="ja">
          <Ruby s={s.sub} />
        </span>
      )}
    </Tag>
  );
}

/** 1行だけの文（狭いところ。English は英語だけ） */
export function One({ t, k }: { t?: LocalizedText; k?: UiKey }) {
  const { level } = usePrefs();
  const s = show(t ?? ui(k!), level);
  return (
    <span lang={s.mainLang}>
      <Ruby s={s.main} />
    </span>
  );
}
