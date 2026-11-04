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
export function Speak({ ja }: { ja: string }) {
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
  return (
    <button type="button" className="speak" aria-pressed={on} aria-label={name + '：' + plain(ja)} onClick={toggle}>
      <span aria-hidden="true">{on ? '■' : '🔊'}</span>
      <span aria-hidden="true">{name}</span>
    </button>
  );
}
