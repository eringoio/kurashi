/* 作者用：写真の読み取りのテスト（READ_MODE=test。SPEC v0.5.23）。
   トークンは、このタブの sessionStorage にだけ残す（URL・IndexedDB に入れない。タブを閉じると消える）。値は画面に出さない。 */
import { useState } from 'react';
import { Bi, One } from '../i18n/Ruby';
import { getReadToken, setReadToken } from '../ui/readToken';

export function ReviewRead() {
  const [value, setValue] = useState('');
  const [on, setOn] = useState(!!getReadToken());
  return (
    <section className="group" aria-labelledby="review-read">
      <h2 id="review-read"><One phrase k="review.readTest" /></h2>
      <p className="sub"><Bi k="review.readTestNote" /></p>
      <label className="qrfield">
        <span className="label"><One k="review.reportsToken" /></span>
        <input className="field" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <button type="button" className="k-answer" disabled={!value} onClick={() => { setReadToken(value); setValue(''); setOn(true); }}><Bi phrase k="review.readTestSave" /></button>
      {on && <button type="button" className="k-answer" onClick={() => { setReadToken(null); setOn(false); }}><Bi phrase k="review.readTestClear" /></button>}
      <p role="status"><One k={on ? 'review.readTestOn' : 'review.readTestOff'} /></p>
    </section>
  );
}
