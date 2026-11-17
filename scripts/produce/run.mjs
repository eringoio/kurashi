#!/usr/bin/env node
/* 無人の下書き制作（Node の逐次処理）。docs/PRODUCE.md を見る。
   タスク（drafts/queue.json）→ 取得 → 生成 → 検査 → 保存（drafts/data/・drafts/review/）。
   data/ と public/ には書かない。verified にしない。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { FatalStop, TaskHold, acquireLock, releaseLock, readJson, writeJson, writeAtomic, sha256, slugOf } from './lib/util.mjs';
import { fetchOfficial } from './lib/fetch.mjs';
import { Budget } from './lib/budget.mjs';
import { makeAdapter, parseBundleText } from './lib/model.mjs';
import { buildPrompt, loadExample, PROMPT_VERSION } from './lib/prompt.mjs';
import { parseResetTime } from './lib/model.mjs';
import { mechanicalChecks } from './lib/check.mjs';
import { renderReview } from './lib/review.mjs';

export const CONTRACT = 'v1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const DEFAULT_LIMITS = { max_tasks: 5, max_total_ms: 2 * 3600e3, max_task_ms: 20 * 60e3, max_retries: 2, max_calls: 20, max_input_chars: 60000, max_output_tokens: 16000 };

/** 既定の検査：vite-node で src/core/data.ts の Zod と参照の検査にかける（data/ は読むだけ） */
export function defaultValidate(root) {
  return (bundle, tmpFile) => new Promise((resolve) => {
    writeAtomic(tmpFile, JSON.stringify(bundle));
    const bin = path.join(root, 'node_modules', 'vite-node', 'vite-node.mjs');
    const child = spawn(process.execPath, [bin, path.join(root, 'scripts', 'produce', 'validate.ts'), tmpFile], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (err += d));
    child.on('close', () => {
      try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ ok: false, errors: ['検査の実行に失敗：' + (err || out).slice(0, 300)], warnings: [] }); }
      try { fs.unlinkSync(tmpFile); } catch { /* なし */ }
    });
  });
}

const urlKey = (u) => 'd-' + new URL(u).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/g, '-') + '-' + sha256(u).slice(0, 8);

/** タスクの資料の URL。urls 直書き、または調査票の evidence の source_id を research/sources-*.json から引く */
export function resolveUrls(task, root) {
  const out = [];
  for (const u of task.urls || []) out.push(typeof u === 'string' ? { id: urlKey(u), url: u } : { id: u.id || urlKey(u.url), url: u.url });
  if (task.source_ids?.length) {
    const reg = ['sources-A.json', 'sources-B.json', 'sources.json'].flatMap((f) => readJson(path.join(root, 'research', f), []));
    for (const id of task.source_ids) { const s = reg.find((x) => x.id === id); if (s?.url) out.push({ id: urlKey(s.url), url: s.url }); }
  }
  return [...new Map(out.map((x) => [x.url, x])).values()];
}

/**
 * 実行本体。テストから呼べるよう、取得・検査・アダプタ・時計は差し替えられる。
 * 戻り値: { stopped: null | {reason,msg}, tasks: {id: status}, ... }
 */
export async function runAll(opts = {}) {
  const root = opts.root || REPO;
  const dir = opts.draftsDir || path.join(root, 'drafts');
  const cfgFile = opts.configPath || path.join(dir, 'config.json');
  const cfg = { ...readJson(cfgFile), ...(opts.config || {}) };
  const limits = { ...DEFAULT_LIMITS, ...(cfg.limits || {}), ...(opts.limits || {}) };
  const queue = readJson(opts.queuePath || path.join(dir, 'queue.json'));
  const stateDir = path.join(dir, 'state'), rawDir = path.join(dir, '_raw'), dataDir = path.join(dir, 'data'), reviewDir = path.join(dir, 'review');
  const log = opts.log || ((m) => console.log(m));
  const nowIso = opts.now || (() => new Date().toISOString());
  const t0 = Date.now();
  const adapter = opts.adapter || makeAdapter({ ...cfg, ...(opts.adapterName ? { adapter: opts.adapterName } : {}) });
  const validate = opts.validateFn || defaultValidate(root);
  const fetchDeps = { fetchImpl: opts.fetchImpl || fetch, now: nowIso, sleepFn: opts.sleepFn, hostLast: new Map(), robotsCache: new Map() };
  const example = loadExample(root);
  const today = cfg.today || todayJst();
  const summary = { started: nowIso(), adapter: adapter.name, model: cfg.model, tasks: {}, stopped: null, lock_recovered: false };

  const lock = path.join(stateDir, 'run.lock');
  const l = acquireLock(lock, limits.max_total_ms + 10 * 60e3);
  summary.lock_recovered = l.recovered;
  if (l.recovered) log('古いロックを回復した（前の実行は途中で止まっていた）');
  const pauseFile = path.join(stateDir, 'pause.json');
  const pause = readJson(pauseFile, null);
  if (pause && Date.parse(pause.paused_until) > Date.now() && !opts.ignorePause) {
    releaseLock(lock); summary.stopped = { reason: 'paused', msg: `利用枠の停止中。${pause.paused_until} まで何もしない（${pause.reason}）` }; log(summary.stopped.msg); return summary;
  }
  const budget = new Budget(stateDir, cfg.budget || {}, limits);
  const runDeadline = t0 + limits.max_total_ms;

  const stPath = (id) => path.join(stateDir, `${id}.json`);
  const loadState = (id) => readJson(stPath(id), null) || { task_id: id, contract: CONTRACT, status: 'pending', stages: {}, attempts_total: 0 };
  const saveState = (st) => { st.updated = nowIso(); writeJson(stPath(st.task_id), st); };

  try {
    const ordered = [...queue.tasks].map((t, i) => ({ t, i })).sort((a, b) => (a.t.priority ?? 1e6) - (b.t.priority ?? 1e6) || a.i - b.i).map((x) => x.t);
    let started = 0;
    for (const task of ordered) {
      if (opts.only && task.id !== opts.only) continue;
      const prev = loadState(task.id);
      const taskDef = { ...task, survey_content: task.survey ? readJson(path.join(root, task.survey), null) : null };
      const taskHash = sha256(JSON.stringify([CONTRACT, PROMPT_VERSION, cfg.model, taskDef]));
      if (prev.status === 'done' && prev.task_hash === taskHash && fs.existsSync(path.join(dataDir, `${task.id}.bundle.json`))) { summary.tasks[task.id] = 'skipped_done'; continue; }
      if (prev.status === 'held' && prev.task_hash === taskHash && !opts.retryHeld) { summary.tasks[task.id] = 'skipped_held'; continue; }
      if (started >= (opts.maxTasks ?? limits.max_tasks)) { summary.stopped = { reason: 'max_tasks', msg: `件数の上限（${limits.max_tasks}）に達した` }; break; }
      started++;
      log(`\n== ${task.id} ==`);
      const taskDeadline = Math.min(Date.now() + limits.max_task_ms, runDeadline);
      const tick = () => {
        if (Date.now() > runDeadline) throw new FatalStop('max_total_time', `全体の時間の上限（${Math.round(limits.max_total_ms / 60000)}分）に達した`);
        if (Date.now() > taskDeadline) throw new TaskHold('task_timeout', `1件の時間の上限（${Math.round(limits.max_task_ms / 60000)}分）に達した`);
      };
      tick.left = () => taskDeadline - Date.now();
      try {
        await processTask({ task, taskDef, taskHash, tick });
        summary.tasks[task.id] = 'done';
      } catch (e) {
        if (e.name === 'CrashSim') throw e;
        const st = loadState(task.id);
        if (e instanceof FatalStop) {
          st.status = 'pending'; st.interrupted = { reason: e.reason, msg: e.message, at: nowIso() }; saveState(st);
          summary.tasks[task.id] = 'interrupted'; summary.stopped = { reason: e.reason, msg: e.message };
          if (e.reason === 'rate_limit') { const until = parseResetTime(e.message) || nowIso(); writeJson(pauseFile, { paused_until: until, stopped_at: nowIso(), known_reset: !!parseResetTime(e.message), reason: e.message }); summary.paused_until = until; }
          log(`全体停止：${e.reason}（${e.message}）`);
          break;
        }
        const reason = e instanceof TaskHold ? e.reason : 'unexpected_error';
        st.status = 'held'; st.hold_reason = reason; st.hold_detail = e.message; st.task_hash = taskHash; saveState(st);
        summary.tasks[task.id] = 'held:' + reason;
        log(`保留：${reason}（${e.message}）。次のタスクへ`);
      }
    }
  } finally {
    releaseLock(lock);
    summary.finished = nowIso(); summary.spent_usd = budget.spent; summary.calls_this_run = budget.calls;
    writeJson(path.join(stateDir, 'last-run.json'), summary);
  }
  return summary;

  async function processTask({ task, taskDef, taskHash, tick }) {
    const st = loadState(task.id);
    const wasHeld = st.status === 'held';
    if (st.status !== 'in_progress') st.attempts_total++;
    Object.assign(st, { status: 'in_progress', contract: CONTRACT, task_hash: taskHash, hold_reason: undefined, hold_detail: undefined, interrupted: undefined, model: cfg.model, adapter: adapter.name });
    saveState(st);
    const after = (stage) => { saveState(st); opts.hooks?.afterStage?.(task.id, stage); };
    const slug = slugOf(task.id);

    // 1. 取得
    const urls = resolveUrls(task, root);
    if (!urls.length) throw new TaskHold('no_sources', '資料の URL がない（queue の urls か source_ids）');
    const fh = sha256(JSON.stringify(urls.map((u) => u.url)));
    const rawPath = (id) => path.join(rawDir, task.id, `${id}.txt`);
    const f = st.stages.fetch;
    const cached = !opts.refetch && f?.status === 'done' && f.input_hash === fh && f.sources.every((s) => fs.existsSync(rawPath(s.id)) && sha256(fs.readFileSync(rawPath(s.id), 'utf8')) === s.sha256);
    if (!cached) {
      tick();
      const recs = [], bad = [];
      for (const u of urls) {
        tick();
        log(`取得 ${u.url}`);
        const r = await fetchOfficial(u.url, cfg, fetchDeps);
        if (r.result !== 'ok') { bad.push(`${u.url} → ${r.result}${r.http_status ? ' ' + r.http_status : ''}`); recs.push({ id: u.id, ...r, text: undefined }); continue; }
        writeAtomic(rawPath(u.id), r.text);
        recs.push({ id: u.id, ...r, text: undefined, raw: path.relative(root, rawPath(u.id)).replace(/\\/g, '/') });
      }
      st.stages.fetch = { status: bad.length ? 'failed' : 'done', input_hash: fh, at: nowIso(), sources: recs, failures: bad };
      saveState(st);
      if (bad.length) throw new TaskHold('fetch_failed', bad.join(' / '));
      opts.hooks?.afterStage?.(task.id, 'fetch');
    } else log('取得：済み（再利用）');

    // 入力（モデルに渡す原文。長すぎるときは出典ごとに先頭だけ。引用の検査も同じ範囲で行う）
    const srcs = st.stages.fetch.sources;
    const per = Math.floor(limits.max_input_chars / srcs.length);
    const sources = srcs.map((s) => {
      const full = fs.readFileSync(rawPath(s.id), 'utf8');
      return { ...s, text: full.length > per ? full.slice(0, per) : full, truncated: full.length > per };
    });
    const survey = taskDef.survey_content;

    // 2.〜3. 生成 → 検査（直しの再試行は state に残る＝再開しても回数を数え直さない）
    const gh = sha256(JSON.stringify([taskHash, sources.map((s) => s.sha256), limits.max_input_chars]));
    const genFile = path.join(stateDir, `${task.id}.generated.json`);
    let g = st.stages.generate;
    if (g && wasHeld && opts.retryHeld) g.attempts = 0;
    if (g && g.input_hash !== gh) log(`生成の入力が前回と違う（${g.input_hash.slice(0, 8)} → ${gh.slice(0, 8)}）。作り直す`);
    if (!g || g.input_hash !== gh) g = st.stages.generate = { status: 'none', input_hash: gh, attempts: 0, usage: { input_tokens: 0, output_tokens: 0, cost_usd: 0, calls: 0 } };
    let result = null;
    for (;;) {
      if (g.status !== 'done' || !fs.existsSync(genFile)) {
        if (g.attempts > limits.max_retries) throw new TaskHold('validation_failed', `検査が通らない（${g.attempts}回生成）：${(st.stages.validate?.errors || []).slice(0, 3).join(' / ')}`);
        tick();
        budget.assertCanCall();
        const prompt = buildPrompt({ task, slug, today, sources: sources.map((s) => ({ id: s.id, final_url: s.final_url, title: s.title, text: s.text })), survey, example, feedback: g.attempts ? st.stages.validate?.errors : null });
        log(`生成（${adapter.name}、試行 ${g.attempts + 1}）`);
        let r;
        try {
          r = await adapter.call({ prompt, ctx: { task, slug, today, attempt: g.attempts, promptChars: prompt.length, sources: sources.map((s) => ({ id: s.id, text: s.text })) }, timeoutMs: Math.max(1000, tick.left()), maxOutputTokens: limits.max_output_tokens, remainingUsd: budget.remaining() });
        } catch (e) { if (e.cost_usd) budget.record(task.id, e.cost_usd); g.attempts++; saveState(st); throw e; }
        budget.record(task.id, r.cost_usd);
        g.attempts++; g.status = 'done'; g.model = r.model; g.at = nowIso();
        g.usage.input_tokens += r.usage?.input_tokens ?? 0; g.usage.output_tokens += r.usage?.output_tokens ?? 0; g.usage.cost_usd += r.cost_usd || 0; g.usage.calls++;
        writeAtomic(genFile, r.text);
        st.stages.validate = undefined;
        after('generate');
      }
      const res = await checkGenerated();
      if (res.ok) { result = res; break; }
      g.status = 'invalid'; st.stages.validate = { status: 'failed', input_hash: gh, errors: res.errors, warnings: res.warnings, at: nowIso() }; saveState(st);
      log(`検査が通らない（${res.errors.length}件）：${res.errors[0]}`);
    }

    async function checkGenerated() {
      let bundle;
      try { bundle = parseBundleText(fs.readFileSync(genFile, 'utf8')); } catch (e) { return { ok: false, errors: ['JSON を読めない：' + e.message], warnings: [] }; }
      // 出典は機械が登録する（モデルに URL を作らせない）
      bundle.sources = sources.map((s) => ({ source_id: s.id, url: s.final_url, ...publisherOf(s.final_url), title: s.title || s.id, language: 'ja' }));
      for (const k of ['rules', 'questions', 'objects', 'relations', 'cards', 'events', 'card_order']) bundle[k] ??= [];
      const mech = mechanicalChecks(bundle, Object.fromEntries(sources.map((s) => [s.id, s.text])));
      const zod = await validate(bundle, path.join(stateDir, `${task.id}.validate.tmp.json`));
      const errors = [...(zod.errors || []), ...mech.errors];
      const idErr = checkIdPrefix(bundle, slug); errors.push(...idErr);
      const mine = new Set([...(bundle.cards || []), ...(bundle.rules || []), ...(bundle.relations || [])].map((x) => x.id));
      const zw = (zod.warnings || []).filter((w) => mine.has(w.split(/[：.]/)[0]));
      return { ok: !errors.length && zod.ok, errors, warnings: [...zw, ...mech.warnings], bundle, quotes: mech.quotes };
    }

    st.stages.validate = { status: 'ok', input_hash: gh, errors: [], warnings: result.warnings, quotes: result.quotes, at: nowIso() };
    after('validate');

    // 4. 保存（同じ名前に原子的に上書き＝再開しても重複しない）
    const bundleText = JSON.stringify(result.bundle, null, 2) + '\n';
    const sh = sha256(bundleText);
    writeAtomic(path.join(dataDir, `${task.id}.bundle.json`), bundleText);
    writeJson(path.join(dataDir, `${task.id}.fetch.json`), { task_id: task.id, contract: CONTRACT, sources: st.stages.fetch.sources });
    writeAtomic(path.join(reviewDir, `${task.id}.md`), renderReview({ task, bundle: result.bundle, sources, fetchRecs: st.stages.fetch.sources, warnings: result.warnings, state: st, today }));
    st.stages.save = { status: 'done', input_hash: sh, at: nowIso(), files: [`drafts/data/${task.id}.bundle.json`, `drafts/review/${task.id}.md`] };
    st.status = 'done';
    after('save');
    log(`保存：drafts/data/${task.id}.bundle.json（警告 ${result.warnings.length}件）`);
  }

  function publisherOf(url) {
    const host = new URL(url).hostname;
    for (const [d, v] of Object.entries(cfg.publishers || {})) if (host === d || host.endsWith('.' + d)) return v;
    return { owner: host, owner_type: 'government' };
  }
}

/** 新しいIDの接頭辞（本体のデータと重ならないための目印）。重複は loadData の検査も止める */
function checkIdPrefix(b, slug) {
  const errs = [];
  for (const c of b.cards || []) if (!String(c.id).startsWith(slug + '-')) errs.push(`カード ID は "${slug}-" で始める：${c.id}`);
  for (const r of b.rules || []) if (!String(r.id).startsWith(`R-${slug}-`)) errs.push(`ルール ID は "R-${slug}-" で始める：${r.id}`);
  for (const q of b.questions || []) if (!String(q.id).startsWith(`Q-${slug}-`)) errs.push(`質問 ID は "Q-${slug}-" で始める：${q.id}`);
  for (const e of b.events || []) if (!String(e.id).startsWith(`E-${slug}`)) errs.push(`イベント ID は "E-${slug}" で始める：${e.id}`);
  for (const e of b.events || []) if (e.status !== 'coming_soon') errs.push(`下書きのイベントは status "coming_soon" だけ：${e.id}`);
  return errs;
}

// ---- コマンドライン ----
const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const a = process.argv.slice(2);
  const val = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const opts = { draftsDir: val('--drafts-dir') ? path.resolve(val('--drafts-dir')) : undefined, configPath: val('--config'), only: val('--only'), retryHeld: a.includes('--retry-held'), refetch: a.includes('--refetch'), adapterName: val('--adapter'), maxTasks: val('--max-tasks') ? Number(val('--max-tasks')) : undefined };
  if (a.includes('--status')) {
    const dir = path.join(REPO, 'drafts', 'state');
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (!/^P-.*\.json$|^E-.*\.json$/.test(f) || /generated|validate/.test(f)) continue;
      const s = readJson(path.join(dir, f)); console.log(`${s.task_id.padEnd(34)} ${s.status.padEnd(12)} ${s.hold_reason || ''}`);
    }
    const b = readJson(path.join(dir, 'budget.json'), null); console.log('費用:', b ? `${b.spent_usd} USD、呼出 ${b.calls_total}回` : '記録なし'); process.exit(0);
  }
  const bye = () => { releaseLock(path.join(REPO, 'drafts', 'state', 'run.lock')); process.exit(130); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
  runAll(opts).then((s) => { console.log('\n' + JSON.stringify(s, null, 2)); process.exit(s.stopped && ['paused', 'rate_limit', 'auth', 'locked', 'cli_missing'].includes(s.stopped.reason) ? 2 : 0); })
    .catch((e) => { console.error(e instanceof FatalStop ? `停止：${e.reason}：${e.message}` : e); process.exit(e instanceof FatalStop ? 2 : 1); });
}
