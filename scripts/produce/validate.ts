/* 下書きのまとまり（Bundle）を、本体のデータに足して Zod と参照の検査にかける。
   使い方：npx vite-node scripts/produce/validate.ts <bundle.json>
   結果は最後の行に JSON で出す：{"ok":bool,"errors":[…],"warnings":[…]}。data/ は読むだけで、書かない。 */
import fs from 'node:fs';
import { baseRaw, loadData, warnings, withBundles, type Bundle } from '../../src/core/data';

const file = process.argv[process.argv.length - 1];
const out: { ok: boolean; errors: string[]; warnings: string[] } = { ok: false, errors: [], warnings: [] };
try {
  const bundle = JSON.parse(fs.readFileSync(file, 'utf8')) as Bundle;
  const data = loadData(withBundles(baseRaw(), [bundle]));
  out.warnings = warnings(data);
  out.ok = true;
} catch (e) {
  const err = e as { issues?: { path: (string | number)[]; message: string }[]; message?: string };
  out.errors = err.issues ? err.issues.slice(0, 40).map((i) => `${i.path.join('.')}: ${i.message}`) : String(err.message ?? e).split('\n').filter(Boolean).slice(0, 40);
}
console.log('\n' + JSON.stringify(out));
