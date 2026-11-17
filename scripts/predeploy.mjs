// 公開（wrangler deploy）の前の検査。npm run deploy が最初に動かす。1つでも合わなければ止める。
// 目的：非公開の開発用リポジトリ（kurashi_proto）から、本番の Worker へ公開しない（docs/release/RELEASE_PIPELINE.md）。
//   1. wrangler.toml の name が "kurashi"（本番）である
//   2. release.json がある（scripts/release/export-public.mjs が公開用の木にだけ書く）
//   3. git の origin が eringoio/kurashi（kurashi_proto ではない）
//   4. 作業ツリーに未コミットの変更がない（どの版を出したかを言えるように）
//   4b. wrangler.toml に preview_urls = false（前の版のプレビューの URL を閉じる。HA-1）
//   5. 作者の承認：環境変数 KURASHI_DEPLOY_APPROVED が release.json の release_id と同じ
// この検査は wrangler を直接たたくことは止められない。そのために開発用の wrangler.toml は本番を指さない。
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** 検査の中身（テストから呼べるように、入力を引数でもらう）。返すのは止める理由の一覧 */
export function deployProblems({ wranglerToml, releaseJson, originUrl, dirty, approved, reviewBuild }) {
  const why = [];
  // 作者用の確認の画面を入れたビルドは本番に出さない（O-6・FD-5）
  if (reviewBuild) why.push('VITE_REVIEW=on のまま（作者用の確認の画面と受信箱が入る）。本番では外す');
  const name = /^name\s*=\s*"([^"]+)"/m.exec(wranglerToml ?? '')?.[1];
  if (name !== 'kurashi') why.push(`wrangler.toml の name が "${name ?? '（なし）'}"。本番（"kurashi"）の設定ではない`);
  // 前の版のプレビューの URL を開かない（Fable 監査 HA-1）。開いていると古い版が公開の後も残る
  if (!/^preview_urls\s*=\s*false\s*$/m.test(wranglerToml ?? '')) why.push('wrangler.toml に preview_urls = false がない（前の版が <版>-kurashi.eringo-io.workers.dev で開いたままになる）');
  let rel = null;
  if (!releaseJson) why.push('release.json がない（公開用に書き出した木ではない）');
  else {
    try { rel = JSON.parse(releaseJson); } catch { why.push('release.json を読めない'); }
    // 未コミットの変更から書き出した木（--allow-dirty。手元の試し用）は公開しない（Fable 監査 FB-6）
    if (rel && rel.source_dirty !== undefined && rel.source_dirty !== false) why.push('release.json の source_dirty が true（未コミットの変更から書き出した試しの木）');
    if (rel && (typeof rel.release_id !== 'string' || !/^[0-9a-f]{7,40}$/.test(rel.source_commit ?? ''))) why.push('release.json に release_id・source_commit がない');
  }
  const origin = (originUrl ?? '').trim();
  // GitHub の eringoio/kurashi だけ（someone/eringoio/kurashi のような似た URL は通さない。FB-15）
  if (!/^(git@github\.com:|https:\/\/github\.com\/|ssh:\/\/git@github\.com\/)eringoio\/kurashi(\.git)?$/.test(origin)) why.push(`git の origin が公開用リポジトリ（eringoio/kurashi）ではない：${origin || '（なし）'}`);
  if (dirty) why.push('未コミットの変更がある');
  if (rel?.release_id && approved !== rel.release_id) why.push(`作者の承認がない（KURASHI_DEPLOY_APPROVED に release_id「${rel.release_id}」を入れて実行する）`);
  return why;
}

const sh = (c) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return ''; } };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const why = deployProblems({
    wranglerToml: existsSync('wrangler.toml') ? readFileSync('wrangler.toml', 'utf8') : '',
    releaseJson: existsSync('release.json') ? readFileSync('release.json', 'utf8') : null,
    originUrl: sh('git remote get-url origin'),
    dirty: sh('git status --porcelain').trim() !== '',
    approved: process.env.KURASHI_DEPLOY_APPROVED,
    reviewBuild: process.env.VITE_REVIEW === 'on',
  });
  if (why.length) {
    console.error('predeploy: 公開を止めた。\n- ' + why.join('\n- '));
    process.exit(1);
  }
  console.log('predeploy: OK');
}
