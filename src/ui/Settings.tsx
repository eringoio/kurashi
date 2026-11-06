/* 文字・ことば・保存（SPEC 7章 S7・9.9。試作 D の「文字と言葉」）。説明の文は置かず、見出しと選ぶボタンだけにする。
   ことばの一覧は、それぞれの言語の名前で並べる（言語が増えても、この1つの欄に足すだけ。data/ui/languages.json）。 */
import { useState, type ReactNode } from 'react';
import { Bi, One, Ruby } from '../i18n/Ruby';
import { LEVELS, line, ui, type UiKey } from '../i18n/text';
import { usePrefs, type Size } from '../storage/prefs';
import { USER_STORES } from '../storage/vault';
import { Link } from './router';
import { Sheet } from './Sheet';
import { useJaVoice } from './Speak';
import { PinIcon } from './icons';

function Seg({ on, onPick, children, lang }: { on: boolean; onPick: () => void; children: ReactNode; lang?: string }) {
  return (
    <button type="button" className="seg" aria-pressed={on} onClick={onPick} lang={lang}>
      {children}
    </button>
  );
}

export function Settings({ onClose, onLive }: { onClose: () => void; onLive: (s: string) => void }) {
  const p = usePrefs();
  const { vault: v, level } = p;
  const voice = useJaVoice();
  const [confirmWipe, setConfirmWipe] = useState(false);
  const L = (k: UiKey) => line(ui(k), level);

  const savingKey: UiKey = v.mode === 'kept' ? 'settings.saving.yes' : v.mode === 'not_kept' ? 'settings.saving.no' : v.mode === 'unavailable' ? 'storage.unavailable' : 'settings.saving.memory';
  const stores = USER_STORES.map((s) => ({ s, n: v.entries(s).length })).filter((x) => x.n > 0);

  return (
    <Sheet title={<One k="settings.title" />} onClose={onClose}>
      <fieldset>
        <legend><One k="settings.level" /></legend>
        <div className="chips chips--langs">
          {LEVELS.map((l) => (
            <Seg key={l.id} on={level.id === l.id} onPick={() => p.setLevel(l.id)} lang={l.lang}>
              {l.labelRuby ? <Ruby s={l.labelRuby} /> : l.label}
            </Seg>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend><One k="settings.size" /></legend>
        <div className="chips">
          {([0, 1, 2] as Size[]).map((s) => (
            <Seg key={s} on={p.size === s} onPick={() => p.setSize(s)}><One k={`settings.size${s}` as UiKey} /></Seg>
          ))}
        </div>
      </fieldset>

      {/* ふりがなは、表示レベルごと（初期は、ふつうの日本語だけオフ） */}
      <fieldset>
        <legend><One k="settings.furigana" /></legend>
        <div className="chips">
          <Seg on={p.furigana} onPick={() => p.setFurigana(true)}><One k="settings.on" /></Seg>
          <Seg on={!p.furigana} onPick={() => p.setFurigana(false)}><One k="settings.off" /></Seg>
        </div>
      </fieldset>

      {/* 位置（A-6・A-12）：アイコンと見出しだけ。使う／使わない */}
      <fieldset>
        <legend><PinIcon /> <One k="settings.location" /></legend>
        <div className="chips">
          <Seg on={p.location === 'on'} onPick={() => p.setLocation('on')}><One k="loc.yes" /></Seg>
          <Seg on={p.location !== 'on'} onPick={() => p.setLocation('off')}><One k="loc.no" /></Seg>
        </div>
      </fieldset>

      {voice && (
        <fieldset>
          <legend><One k="settings.speech" /></legend>
          <div className="chips">
            <Seg on={p.speechRate === 'normal'} onPick={() => p.setSpeechRate('normal')}><One k="settings.speechNormal" /></Seg>
            <Seg on={p.speechRate === 'slow'} onPick={() => p.setSpeechRate('slow')}><One k="settings.speechSlow" /></Seg>
          </div>
        </fieldset>
      )}

      {v.mode !== 'view_only' && (
        <fieldset>
          <legend><One k="settings.saving" /></legend>
          <p><Bi k={savingKey} />{v.mode === 'kept' && v.persisted === false && <span className="sheet__sub"><One k="settings.persist.no" /></span>}</p>
          <div className="chips">
            {v.mode === 'kept' && <button type="button" className="seg" onClick={async () => { await v.dontKeep(); onLive(L('consent.noNote')); }}><One k="settings.stop" /></button>}
            {(v.mode === 'not_kept' || v.mode === 'undecided') && <button type="button" className="seg" onClick={async () => { await v.keep(); onLive(L('consent.keptNote')); }}><One k="settings.startKeep" /></button>}
            {v.mode !== 'unavailable' && <button type="button" className="seg" onClick={() => { v.startViewOnly(); onClose(); }}><One k="settings.viewOnly" /></button>}
          </div>
          {stores.length > 0 && (
            <details className="stores">
              <summary><One k="settings.stores" />（{stores.length}）</summary>
              {stores.map(({ s, n }) => (
                <div className="store" key={s}>
                  <span><span className="store__name"><One k={`store.${s}` as UiKey} /></span> <span className="store__n">（{n}）</span></span>
                  <button type="button" className="seg" aria-label={L('settings.deleteOne') + '：' + L(`store.${s}` as UiKey)} onClick={async () => { await v.clearStore(s); onLive(L('settings.deleted') + '：' + L(`store.${s}` as UiKey)); }}>
                    <One k="settings.deleteOne" />
                  </button>
                </div>
              ))}
            </details>
          )}
          {confirmWipe ? (
            <>
              <p role="alert"><Bi k="settings.wipeConfirm" /></p>
              <div className="chips">
                <button type="button" className="seg danger" onClick={async () => { await v.wipe(); setConfirmWipe(false); onLive(L('settings.wiped')); }}><One k="settings.wipeYes" /></button>
                <button type="button" className="seg" onClick={() => setConfirmWipe(false)}><One k="settings.cancel" /></button>
              </div>
            </>
          ) : (
            <div className="chips">
              <button type="button" className="seg danger" onClick={() => setConfirmWipe(true)}><One k="settings.wipe" /></button>
            </div>
          )}
        </fieldset>
      )}

      <Link to="/info/about" className="link" onClick={onClose}><Bi k="home.about" /></Link>
    </Sheet>
  );
}
