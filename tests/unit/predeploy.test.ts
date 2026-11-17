/* 公開の前の検査（scripts/predeploy.mjs）。開発用リポジトリから本番へ公開しない */
import { describe, it, expect } from 'vitest';
// @ts-expect-error 型の無い .mjs
import { deployProblems } from '../../scripts/predeploy.mjs';

const ok = {
  wranglerToml: 'name = "kurashi"\nmain = "worker/index.ts"\npreview_urls = false\n',
  releaseJson: JSON.stringify({ release_id: '2026-11-14.abc1234', source_commit: 'abc1234def' }),
  originUrl: 'git@github.com:eringoio/kurashi.git\n',
  dirty: false,
  approved: '2026-11-14.abc1234',
};

describe('公開の前の検査', () => {
  it('公開用の木・公開用のリポジトリ・未コミットなし・承認ありのときだけ通る', () => {
    expect(deployProblems(ok)).toEqual([]);
    expect(deployProblems({ ...ok, originUrl: 'https://github.com/eringoio/kurashi' })).toEqual([]);
  });
  it('開発用の設定（名前が kurashi でない）は止める', () => {
    expect(deployProblems({ ...ok, wranglerToml: 'name = "kurashi-proto"\npreview_urls = false\n' })).toHaveLength(1);
  });
  it('preview_urls = false が無い設定は止める（前の版のプレビューの URL が開いたまま。Fable HA-1）', () => {
    expect(deployProblems({ ...ok, wranglerToml: 'name = "kurashi"\n' })).toHaveLength(1);
    expect(deployProblems({ ...ok, wranglerToml: 'name = "kurashi"\npreview_urls = true\n' })).toHaveLength(1);
  });
  it('release.json が無い・形が違う・未コミットの書き出しは止める', () => {
    expect(deployProblems({ ...ok, releaseJson: null })).toHaveLength(1);
    expect(deployProblems({ ...ok, releaseJson: '{' }).length).toBeGreaterThan(0);
    expect(deployProblems({ ...ok, releaseJson: JSON.stringify({ release_id: 'x' }) }).length).toBeGreaterThan(0);
  });
  it('開発用のリポジトリ（kurashi_proto）は止める', () => {
    expect(deployProblems({ ...ok, originUrl: 'git@github.com:eringoio/kurashi_proto.git' })).toHaveLength(1);
    expect(deployProblems({ ...ok, originUrl: '' })).toHaveLength(1);
    // 似た URL（FB-15）
    expect(deployProblems({ ...ok, originUrl: 'https://github.com/someone/eringoio/kurashi' })).toHaveLength(1);
    expect(deployProblems({ ...ok, originUrl: 'https://evil.example/eringoio/kurashi.git' })).toHaveLength(1);
  });
  it('VITE_REVIEW=on のビルドは止める（FD-5）', () => {
    expect(deployProblems({ ...ok, reviewBuild: true })).toHaveLength(1);
  });
  it('未コミットの変更から書き出した試しの木（source_dirty: true）は止める（FB-6）', () => {
    const rel = JSON.stringify({ release_id: '2026-11-14.abc1234', source_commit: 'abc1234def', source_dirty: true });
    expect(deployProblems({ ...ok, releaseJson: rel })).toHaveLength(1);
  });
  it('未コミットの変更・承認なし・別の版の承認は止める', () => {
    expect(deployProblems({ ...ok, dirty: true })).toHaveLength(1);
    expect(deployProblems({ ...ok, approved: undefined })).toHaveLength(1);
    expect(deployProblems({ ...ok, approved: '2026-11-13.0000000' })).toHaveLength(1);
  });
});
