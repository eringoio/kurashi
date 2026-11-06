/* 読み上げのボタン（SPEC 6A.12）。端末の音声合成で、日本語の決まった文だけを読む。
   日本語の声がない端末では出さない。自動では読まない。 */
import { useEffect, useState } from 'react';
import { line, plain, reading, ui } from '../i18n/text';
import { usePrefs } from '../storage/prefs';

function jaVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'));
  // 端末の中の声を先に使う（文を外に送らないため。U44）
  return vs.find((v) => v.localService) ?? vs[0] ?? null;
}

export function useJaVoice(): SpeechSynthesisVoice | null {
  const [v, setV] = useState<SpeechSynthesisVoice | null>(() => jaVoice());
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const f = () => setV(jaVoice());
    speechSynthesis.addEventListener('voiceschanged', f);
    return () => speechSynthesis.removeEventListener('voiceschanged', f);
  }, []);
  return v;
}

/** ja：読む日本語（{漢字|よみ} を含んでよい。読みのほうを読む） */
/** name：読み上げボタンの名前に入れる語（例：行に出ている言葉）。ないときは ja。止めるときは「止める：…」 */
export function Speak({ ja, name: subject }: { ja: string; name?: string }) {
  const { level, speechRate } = usePrefs();
  const voice = useJaVoice();
  const [on, setOn] = useState(false);
  useEffect(() => () => { if (on) speechSynthesis.cancel(); }, [on]);
  if (!voice) return null;
  const toggle = () => {
    if (on) { speechSynthesis.cancel(); setOn(false); return; }
    const u = new SpeechSynthesisUtterance(reading(ja));
    u.voice = voice;
    u.lang = 'ja-JP';
    u.rate = speechRate === 'slow' ? 0.7 : 1;
    u.onend = u.onerror = () => setOn(false);
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    setOn(true);
  };
  const name = line(ui(on ? 'speak.stop' : 'speak.label'), level);
  const text = plain(subject ?? ja);
  // 見えている名前（読む・止める）を先に入れる（2.5.3 ラベルと名前の一致）。そのあとに文（同じ名前のボタンを区別する。K-52）
  const label = name + '：' + text;
  return (
    <button type="button" className="speak" aria-pressed={on} aria-label={label} onClick={toggle}>
      <span aria-hidden="true">{on ? '■' : '🔊'}</span>
      <span aria-hidden="true">{name}</span>
    </button>
  );
}
