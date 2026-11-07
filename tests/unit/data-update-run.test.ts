import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const repo = resolve(__dirname, '../..');
const tmp = mkdtempSync(join(tmpdir(), 'kurashi-update-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const env = { ...process.env };
delete env.ANTHROPIC_API_KEY;
const q = (s: string) => `"${s}"`;
const run = (args: string[]) => execFileSync('npx', ['vite-node', ...args.map(q)], { cwd: repo, env, shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const json = (f: string) => JSON.parse(readFileSync(join(tmp, f), 'utf8'));
const FIX = ['nagoya-juumin-todoke', 'nagoya-kokuho-kanyu-page'];
// 同じ URL の出典（下書きを公開に移したときの別名）は、同じページとして扱う
const SOURCES = JSON.parse(readFileSync(join(repo, 'data', 'sources.json'), 'utf8')).sources as { source_id: string; url: string | null }[];
const urlOf = (id: string) => SOURCES.find((s) => s.source_id === id)!.url;
const sameAs = (id: string) => SOURCES.filter((s) => s.url && s.url === urlOf(id)).map((s) => s.source_id).sort();
const FIX_ALL = FIX.flatMap(sameAs);

describe('data update pipeline (fixtures)', () => {
  it('runs fetch twice and the agent, end to end', () => {
    run(['scripts/fetch-sources.ts', '--', '--fixtures', 'tests/fixtures/sources/run1', '--root', tmp, '--date', '2026-11-01']);
    const idx1 = json('index.json');
    for (const id of FIX) {
      expect(idx1[id].result).toBe('ok');
      expect(idx1[id].sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const id of FIX_ALL) expect(idx1[id].result, id).toBe('ok');
    const others = Object.entries(idx1).filter(([id]) => !FIX_ALL.includes(id));
    expect(others.length).toBeGreaterThan(0);
    for (const [, v] of others) expect((v as { result: string }).result).not.toBe('ok');
    // 1回目は記録だけ（AI を使わない・データを変えない）
    run(['scripts/update-agent.ts', '--', '--root', tmp]);
    expect(json('report/2026-11-01.json').baseline).toBe(true);

    run(['scripts/fetch-sources.ts', '--', '--fixtures', 'tests/fixtures/sources/run2', '--root', tmp, '--date', '2026-11-08']);
    const last = json('last-run.json');
    expect([...last.changed].sort()).toEqual(sameAs('nagoya-kokuho-kanyu-page'));
    expect([...last.unchanged].sort()).toEqual(sameAs('nagoya-juumin-todoke'));
    expect(existsSync(join(tmp, 'snapshots', 'nagoya-kokuho-kanyu-page', '2026-11-08.txt'))).toBe(true);
    expect(existsSync(join(tmp, 'snapshots', 'nagoya-juumin-todoke', '2026-11-01.txt'))).toBe(true);

    run(['scripts/update-agent.ts', '--', '--root', tmp]);
    const report = json('report/2026-11-08.json');
    expect(report.sample).toBe(true);
    expect(report.date).toBe('2026-11-08');
    expect(existsSync(join(tmp, 'report', '2026-11-08.md'))).toBe(true);
    expect(report.baseline).toBe(false);
    for (const v of report.verdicts) expect(v.verdict).toMatch(/^(unchanged|changed|unclear)$/);

    // データに入れる：写しの data/ にだけ書く。verified にはしない
    cpSync(join(repo, 'data'), join(tmp, 'data'), { recursive: true });
    run(['scripts/apply-update.ts', '--', '--root', tmp, '--data', join(tmp, 'data')]);
    expect(readFileSync(join(tmp, 'report', '2026-11-08.md'), 'utf8')).toContain('## データに入れたこと');
    const before = readFileSync(join(repo, 'data', 'rules.json'), 'utf8');
    expect(readFileSync(join(tmp, 'data', 'rules.json'), 'utf8').match(/"verified"/g)?.length ?? 0).toBeLessThanOrEqual(before.match(/"verified"/g)?.length ?? 0);
  }, 90_000);

  it('snapshots are git-ignored', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', 'sources/snapshots/x/y.txt'], { cwd: repo })).not.toThrow();
  });
});
