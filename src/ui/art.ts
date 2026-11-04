/* 手描きの絵（design/assets/illustrations）。文字の代わりにしない。ラベルがあるときは alt="" にする（SPEC 15.2） */
const files = import.meta.glob('../../design/assets/illustrations/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function art(name: string): string {
  const url = files[`../../design/assets/illustrations/${name}.svg`];
  if (!url) throw new Error('絵がない：' + name);
  return url;
}

/** 点線の形（-dim）がある絵はそれを、無い絵（ask など）はそのまま使う */
export function artDim(name: string, dim: boolean): string {
  return dim && files[`../../design/assets/illustrations/${name}-dim.svg`] ? art(name + '-dim') : art(name);
}
