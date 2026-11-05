/* からだの絵（病院の案内。SPEC 6A.13）。絵は目で見るためのもの（aria-hidden）。選ぶのは横の名前のボタン（キーボード・読み上げ）。
   絵を押しても同じ場所を選べる。押せる所は 44px 以上（名前のボタン）。 */
import type { ClinicPart } from '../core/clinic';
import { Bi } from '../i18n/Ruby';

const ST = { stroke: '#2A2A2E', strokeWidth: 2.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function Body({ sel, onPick }: { sel: string | null; onPick: (zone: string) => void }) {
  const z = (id: string) => ({ className: 'zone' + (sel === id ? ' zone--sel' : ''), onClick: () => onPick(id) });
  return (
    <svg viewBox="0 0 200 300" className="bodymap__svg" aria-hidden="true" focusable="false">
      <g {...z('limbs')}>
        <path className="zone__fill" d="M62 100 Q44 112 38 192 H54 Q58 132 70 118 Z" fill="#CFE1F7" {...ST} />
        <path className="zone__fill" d="M138 100 Q156 112 162 192 H146 Q142 132 130 118 Z" fill="#CFE1F7" {...ST} />
        <circle cx="46" cy="199" r="8" fill="#F6EBD6" {...ST} /><circle cx="154" cy="199" r="8" fill="#F6EBD6" {...ST} />
        <path className="zone__fill" d="M76 198 L72 288 H96 L100 210 L104 288 H128 L124 198 Z" fill="#E3C08F" {...ST} />
      </g>
      <g {...z('belly')}><path className="zone__fill" d="M67 150 H133 L127 200 H73 Z" fill="#CFE1F7" {...ST} /></g>
      <g {...z('chest')}><path className="zone__fill" d="M62 100 Q100 90 138 100 L133 150 H67 Z" fill="#CFE1F7" {...ST} /></g>
      <rect x="92" y="76" width="16" height="18" fill="#F6EBD6" {...ST} />
      <g {...z('ent')}>
        <circle cx="71" cy="54" r="7" fill="#F6EBD6" {...ST} /><circle cx="129" cy="54" r="7" fill="#F6EBD6" {...ST} />
        <ellipse className="zone__halo" cx="71" cy="54" rx="11" ry="12" /><ellipse className="zone__halo" cx="129" cy="54" rx="11" ry="12" /><rect className="zone__halo" x="88" y="74" width="24" height="22" rx="6" />
      </g>
      <circle cx="100" cy="50" r="29" fill="#F6EBD6" {...ST} />
      <g {...z('head')}><path className="zone__fill" d="M72 48 Q69 19 100 19 Q131 19 128 48 Q118 33 100 34 Q82 33 72 48 Z" fill="#5B4636" {...ST} /></g>
      <g {...z('eye')}>
        <rect x="80" y="44" width="40" height="15" fill="transparent" />
        <path d="M90 52 L90.2 52 M110 52 L110.2 52" stroke="#2A2A2E" strokeWidth={5} strokeLinecap="round" />
        <ellipse className="zone__halo" cx="100" cy="52" rx="22" ry="9" />
      </g>
      <path d="M100 56 L98 62 H101" fill="none" stroke="#2A2A2E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <g {...z('mouth')}>
        <rect x="88" y="63" width="24" height="12" fill="transparent" />
        <path d="M93 67 Q100 73 107 67" fill="none" {...ST} />
        <ellipse className="zone__halo" cx="100" cy="69" rx="17" ry="10" />
      </g>
    </svg>
  );
}

/** 名前のボタン（選んだら aria-pressed） */
export function PartButton({ p, sel, onPick, small }: { p: ClinicPart; sel: string | null; onPick: (id: string) => void; small?: boolean }) {
  return (
    <button type="button" className={'chip chip--part' + (small ? ' chip--sm' : '')} aria-pressed={sel === p.id} onClick={() => onPick(p.id)}>
      <Bi t={p.name} />
    </button>
  );
}

export function BodyMap({ parts, sel, onPick }: { parts: ClinicPart[]; sel: string | null; onPick: (id: string) => void }) {
  const onBody = parts.filter((p) => p.group === 'body');
  const left = onBody.slice(0, 4), right = onBody.slice(4);
  const byZone = (zone: string) => onBody.find((p) => p.body_zone === zone);
  return (
    <div className="bodymap">
      <div className="bodymap__labels">{left.map((p) => <PartButton key={p.id} p={p} sel={sel} onPick={onPick} />)}</div>
      <Body sel={parts.find((p) => p.id === sel)?.body_zone ?? null} onPick={(zone) => { const p = byZone(zone); if (p) onPick(p.id); }} />
      <div className="bodymap__labels">{right.map((p) => <PartButton key={p.id} p={p} sel={sel} onPick={onPick} />)}</div>
    </div>
  );
}
