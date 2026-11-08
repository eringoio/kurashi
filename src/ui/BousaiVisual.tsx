/* 防災の見て分かる形（SPEC 6A.20 v0.5.38）。
   備蓄の量：人数と日数を選ぶと、水（人数×日数×3L）と携帯トイレ（人数×日数×5〜6回）の目安。答えは保存しない（端末にも書かない）。
   警戒レベル：1〜5 の行。番号・市町村の情報・すること を文字で出す（色だけにしない）。 */
import { useState } from 'react';
import { Bi, One } from '../i18n/Ruby';
import { line, ui, type UiKey } from '../i18n/text';
import { usePrefs } from '../storage/prefs';
import { art } from './art';

const MAX_PEOPLE = 10;

export function StockCalc() {
  const { level } = usePrefs();
  const [people, setPeople] = useState(2);
  const [days, setDays] = useState<3 | 7>(3);
  const water = people * days * 3;
  const bottles = Math.ceil(water / 2);
  const toiletMin = people * days * 5;
  const toiletMax = people * days * 6;
  return (
    <section className="group bousai-visual" aria-labelledby="bousai-stock">
      <h2 id="bousai-stock"><Bi phrase k="bousai.stock.title" /></h2>
      <p className="sub"><Bi k="bousai.stock.sub" /></p>
      <div className="bousai-calc">
        <div className="bousai-calc__row" role="group" aria-label={line(ui('bousai.stock.people'), level)}>
          <span className="label"><One k="bousai.stock.people" /></span>
          <div className="bousai-step">
            <button type="button" className="k-answer bousai-step__btn" aria-label={line(ui('bousai.stock.less'), level)} disabled={people <= 1} onClick={() => setPeople((n) => Math.max(1, n - 1))}>−</button>
            <output className="bousai-step__n" aria-live="polite">{people}<One k="bousai.stock.peopleUnit" /></output>
            <button type="button" className="k-answer bousai-step__btn" aria-label={line(ui('bousai.stock.more'), level)} disabled={people >= MAX_PEOPLE} onClick={() => setPeople((n) => Math.min(MAX_PEOPLE, n + 1))}>＋</button>
          </div>
        </div>
        <div className="bousai-calc__row" role="group" aria-label={line(ui('bousai.stock.days'), level)}>
          <span className="label"><One k="bousai.stock.days" /></span>
          <div className="house-plans">
            {([3, 7] as const).map((d) => (
              <button key={d} type="button" className="k-answer house-plans__btn" aria-pressed={days === d} onClick={() => setDays(d)}>
                <One k={d === 3 ? 'bousai.stock.d3' : 'bousai.stock.d7'} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <ul className="bousai-amounts" role="list" aria-live="polite">
        <li>
          <img src={art('water')} alt="" />
          <span className="bousai-amounts__name"><Bi k="bousai.stock.water" /></span>
          <span className="bousai-amounts__n"><span><strong>{water}</strong><One k="bousai.stock.liter" /></span>
            <span className="sub"><One k="bousai.stock.bottles" /> {bottles}<One k="bousai.stock.bottleUnit" /></span></span>
        </li>
        <li>
          <img src={art('bousai-bag')} alt="" />
          <span className="bousai-amounts__name"><Bi k="bousai.stock.toilet" /></span>
          <span className="bousai-amounts__n"><span><strong>{toiletMin}〜{toiletMax}</strong><One k="bousai.stock.toiletUnit" /></span></span>
        </li>
      </ul>
      <p className="sub"><Bi k="bousai.stock.formula" /></p>
      <p className="sub"><Bi k="bousai.stock.note" /></p>
    </section>
  );
}

const LEVELS: { n: 1 | 2 | 3 | 4 | 5; info?: UiKey; act: UiKey }[] = [
  { n: 1, act: 'bousai.lv.1' },
  { n: 2, act: 'bousai.lv.2' },
  { n: 3, info: 'bousai.lv.3.info', act: 'bousai.lv.3' },
  { n: 4, info: 'bousai.lv.4.info', act: 'bousai.lv.4' },
  { n: 5, info: 'bousai.lv.5.info', act: 'bousai.lv.5' },
];

export function AlertLevels() {
  return (
    <section className="group bousai-visual" aria-labelledby="bousai-levels">
      <h2 id="bousai-levels"><Bi phrase k="bousai.lv.title" /></h2>
      <p className="sub"><Bi k="bousai.lv.sub" /></p>
      <ol className="bousai-levels" role="list">
        {LEVELS.map((l) => (
          <li key={l.n} className={'bousai-levels__row bousai-levels__row--' + l.n}>
            <span className="bousai-levels__n"><span className="bousai-levels__word"><One k="bousai.lv.name" /></span><strong>{l.n}</strong></span>
            <span className="bousai-levels__body">
              {l.info && <span className="bousai-levels__info"><span className="sub"><One k="bousai.lv.from" />：</span><Bi k={l.info} /></span>}
              <Bi k={l.act} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
