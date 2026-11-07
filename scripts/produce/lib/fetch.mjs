/* 公式資料の取得：許可ドメイン・robots.txt・間隔・リダイレクト先の確認・本文の取り出し。
   403 / CAPTCHA は回避せず保留。PDF は取り出さず保留。 */
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { sha256, sleep } from './util.mjs';

export const hostAllowed = (host, allow) => allow.some((d) => host === d || host.endsWith('.' + d));

/** robots.txt の最小の読み方：自分の UA か * のグループの Disallow / Allow（最長一致） */
export function robotsAllows(txt, ua, pathname) {
  const groups = []; let cur = null; let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/); if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') { if (!lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false;
    if (cur && (k === 'disallow' || k === 'allow')) cur.rules.push([k, v]);
  }
  const me = ua.toLowerCase();
  const g = groups.find((x) => x.agents.some((a) => a !== '*' && me.includes(a))) || groups.find((x) => x.agents.includes('*'));
  if (!g) return true;
  let best = null;
  for (const [k, v] of g.rules) {
    if (!v) continue;
    const pat = v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$');
    if (new RegExp('^' + pat).test(pathname) && (!best || v.length >= best.len)) best = { len: v.length, allow: k === 'allow' };
  }
  return best ? best.allow : true;
}

export function extractText(html) {
  const { document } = parseHTML(html);
  const title = (document.querySelector('title')?.textContent || '').trim();
  let text = '';
  try { text = new Readability(document.cloneNode(true), { charThreshold: 50 }).parse()?.textContent || ''; } catch { /* 下で代替 */ }
  if (text.trim().length < 200) {
    document.querySelectorAll('script,style,noscript,nav,header,footer').forEach((n) => n.remove());
    text = document.body?.textContent || document.documentElement?.textContent || '';
  }
  text = text.replace(/ /g, ' ').split(/\r?\n/).map((l) => l.replace(/[ \t　]+/g, ' ').trim()).filter(Boolean).join('\n');
  return { title, text };
}

const looksCaptcha = (body) => /captcha|are you a robot|access denied|アクセスが制限/i.test(body.slice(0, 5000)) && body.length < 8000;

/**
 * 1つの URL を取得する。失敗は例外にせず { result: '…' } で返す（呼び出し側がタスクを保留する）。
 * deps: { fetchImpl, now(), sleepFn, hostLast:Map, robotsCache:Map }
 */
export async function fetchOfficial(url, cfg, deps) {
  const rec = { url, final_url: url, fetched_at: deps.now(), http_status: null, result: 'error', sha256: null, chars: 0, redirects: [] };
  const ua = cfg.user_agent;
  const timeout = cfg.fetch_timeout_ms ?? 30000;
  // cfg.conditional：前回の ETag・Last-Modified。ページが変わっていなければ 304 が返り、本文を取らない
  const cond = cfg.conditional || {};
  const get = async (u, extra = {}) => {
    const host = new URL(u).host;
    const wait = (deps.hostLast.get(host) ?? 0) + (cfg.min_interval_ms ?? 3000) - Date.now();
    if (wait > 0) await (deps.sleepFn ?? sleep)(wait);
    deps.hostLast.set(host, Date.now());
    return deps.fetchImpl(u, { redirect: 'manual', headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', 'accept-language': 'ja,en;q=0.5', ...extra }, signal: AbortSignal.timeout(timeout) });
  };
  try {
    let cur = url;
    for (let hop = 0; ; hop++) {
      const u = new URL(cur);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') { rec.result = 'domain_not_allowed'; return rec; }
      if (!hostAllowed(u.hostname, cfg.allow_domains)) { rec.result = 'domain_not_allowed'; rec.final_url = cur; return rec; }
      // robots.txt（ホストごとに1回）。404 は許可、読めないときは安全側で止める
      if (!deps.robotsCache.has(u.host)) {
        let txt = '';
        try {
          const r = await get(`${u.protocol}//${u.host}/robots.txt`);
          if (r.status === 404 || r.status === 410) txt = '';
          else if (r.status >= 200 && r.status < 300) txt = await r.text();
          else { rec.result = 'robots_unreadable'; rec.http_status = r.status; return rec; }
        } catch { rec.result = 'robots_unreadable'; return rec; }
        deps.robotsCache.set(u.host, txt);
      }
      if (!robotsAllows(deps.robotsCache.get(u.host), ua, u.pathname + u.search)) { rec.result = 'robots_disallow'; rec.final_url = cur; return rec; }
      const extra = hop === 0 ? { ...(cond.etag ? { 'if-none-match': cond.etag } : {}), ...(cond.last_modified ? { 'if-modified-since': cond.last_modified } : {}) } : {};
      const res = await get(cur, extra);
      rec.http_status = res.status; rec.final_url = cur;
      if (res.status === 304) { rec.result = 'not_modified'; return rec; }
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        if (hop >= (cfg.max_redirects ?? 5)) { rec.result = 'too_many_redirects'; return rec; }
        cur = new URL(res.headers.get('location'), cur).href; rec.redirects.push(cur); continue;
      }
      if (res.status < 200 || res.status >= 300) { rec.result = 'http_' + res.status; return rec; }
      const ct = res.headers.get('content-type') || '';
      if (/pdf/i.test(ct) || /\.pdf($|\?)/i.test(u.pathname)) { rec.result = 'pdf_unreadable'; return rec; }
      const buf = Buffer.from(await res.arrayBuffer());
      const cs = (ct.match(/charset=([\w-]+)/i)?.[1]) || (buf.subarray(0, 2048).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]) || 'utf-8';
      let html; try { html = new TextDecoder(cs).decode(buf); } catch { html = buf.toString('utf8'); }
      if (looksCaptcha(html)) { rec.result = 'captcha'; return rec; }
      const { title, text } = extractText(html);
      if (text.length < 80) { rec.result = 'empty_text'; return rec; }
      Object.assign(rec, { result: 'ok', title, text, sha256: sha256(text), chars: text.length, content_type: ct, etag: res.headers.get('etag'), last_modified: res.headers.get('last-modified') });
      return rec;
    }
  } catch (e) {
    rec.result = e.name === 'TimeoutError' ? 'timeout' : 'network_error'; rec.error = String(e.message || e);
    return rec;
  }
}
