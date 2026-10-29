#!/usr/bin/env node
// Review mode (docs/review-loop.md). Serves the site from this folder like `python -m http.server`, and adds the
// review tools to every page it serves. The tools call the endpoints below, which keep comments in Postgres (the
// Neon dev branch) with the credentials from .env, so the database password never reaches the browser.
// Nothing in review/ is deployed: .vercelignore excludes it.
//
//   npm run review                      http://localhost:8000
//   npm run review -- --port 8080
//   npm run review -- --env <file>      read variables from this file instead of .env
//
// .env  DATABASE_URL_UNPOOLED or DATABASE_URL   the dev database branch (README, "Run it locally")
//       CLAUDE_TASK_FIRE_URL, CLAUDE_TASK_TOKEN  the cloud task's API trigger (docs/claude-review-task.md)
//       REVIEW_BRANCH                            the branch Claude pushes to (default feat/automated-sandboxing)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'review', 'client');
const RESULTS = path.join(ROOT, 'review', 'results');

const argv = process.argv.slice(2);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

// same .env format and precedence as scripts/migrate.mjs: variables already set in the shell win
function loadEnv(file) {
  if (!fs.existsSync(file)) return false;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    const q = v.match(/^(["'])(.*?)\1/);
    if (q) v = q[1] === '"' ? q[2].replace(/\\n/g, '\n') : q[2];
    else v = v.replace(/\s+#.*$/, '').trim();
    if (process.env[m[1]] === undefined || process.env[m[1]] === '') process.env[m[1]] = v;
  }
  return true;
}
const ENV_FILE = path.resolve(ROOT, opt('--env') || '.env');
const envLoaded = loadEnv(ENV_FILE);

const PORT = +(opt('--port') || process.env.REVIEW_PORT || 8000);
const BRANCH = (process.env.REVIEW_BRANCH || 'feat/automated-sandboxing').trim();
const FIRE_URL = (process.env.CLAUDE_TASK_FIRE_URL || '').trim();
const FIRE_TOKEN = (process.env.CLAUDE_TASK_TOKEN || '').trim();
const FIRE_LIMIT = 60000;   // the trigger takes 65,536 characters of text; keep a margin
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

// ---------------------------------------------------------------- database
function database() {
  const url = ['DATABASE_URL_UNPOOLED', 'DATABASE_URL', 'POSTGRES_URL'].map((k) => (process.env[k] || '').trim()).find(Boolean);
  if (!url) return null;
  const u = new URL(url);
  // as in scripts/migrate.mjs: pg treats sslmode=require as verify-full anyway; saying so avoids its warning
  if (['require', 'prefer', 'verify-ca'].includes(u.searchParams.get('sslmode'))) u.searchParams.set('sslmode', 'verify-full');
  const channelBinding = u.searchParams.get('channel_binding') === 'require';
  u.searchParams.delete('channel_binding');
  const pool = new pg.Pool({ connectionString: u.toString(), max: 4, application_name: 'tully-review', enableChannelBinding: channelBinding });
  pool.on('error', (e) => console.error('database:', e.message));
  pool.label = `${u.hostname}${u.pathname}`;
  return pool;
}
const pool = database();
const q = async (text, params) => (await pool.query(text, params)).rows;
async function tx(fn) {
  const c = await pool.connect();
  try { await c.query('begin'); const r = await fn(c); await c.query('commit'); return r; }
  catch (e) { await c.query('rollback').catch(() => {}); throw e; }
  finally { c.release(); }
}
const dbHint = (e) => e && e.code === '42P01' ? 'The review tables are missing: run `npm run db:migrate` once.' : 'Database error: ' + (e && e.message);

// ---------------------------------------------------------------- git
const run = promisify(execFile);
// never wait for a password or SSH passphrase prompt: without one, the call fails and the page just says less
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes' };
const git = async (...args) => (await run('git', args, { cwd: ROOT, timeout: 20000, env: GIT_ENV })).stdout.trim();
let local = { t: 0 };
async function gitLocal() {
  if (Date.now() - local.t < 3000) return local;
  try { const [head, branch] = await Promise.all([git('rev-parse', 'HEAD'), git('rev-parse', '--abbrev-ref', 'HEAD')]); local = { t: Date.now(), head, branch }; }
  catch { local = { t: Date.now(), head: null, branch: null }; }
  return local;
}
// While a round is with Claude, look at the branch on GitHub every 45 s: a new commit there means Claude pushed.
const remote = { t: 0, head: null, busy: false };
function checkRemote() {
  if (remote.busy || Date.now() - remote.t < 45000) return;
  remote.busy = true;
  git('ls-remote', 'origin', 'refs/heads/' + BRANCH)
    .then((out) => { remote.head = out.split(/\s/)[0] || null; })
    .catch(() => {})
    .finally(() => { remote.t = Date.now(); remote.busy = false; });
}

// ---------------------------------------------------------------- where is it in the code
// So Claude doesn't have to search: the file and line of each comment's text, image or chapter, read from the source.
// Text is matched with all whitespace removed, so line breaks, &nbsp; and tags inside the HTML don't get in the way.
// Text a page builds with JavaScript (the paper's charts) is looked for in that page's own scripts.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', middot: '·', times: '×', euro: '€', minus: '−', rarr: '→', larr: '←', darr: '↓', uarr: '↑', deg: '°', shy: '' };
const sources = new Map();
function source(file) {
  const full = path.join(ROOT, file);
  let st; try { st = fs.statSync(full); } catch { return null; }
  const hit = sources.get(file); if (hit && hit.mtime === st.mtimeMs) return hit;
  const raw = fs.readFileSync(full, 'utf8'), chars = [], offs = [];
  const add = (c, at) => { for (let k = 0; k < c.length; k++) if (!/\s/.test(c[k])) { chars.push(c[k]); offs.push(at); } };
  if (file.endsWith('.html')) {
    const lower = raw.toLowerCase();
    for (let i = 0; i < raw.length;) {
      if (raw.startsWith('<!--', i)) { const j = raw.indexOf('-->', i); i = j < 0 ? raw.length : j + 3; continue; }
      const sc = /^<(script|style)\b/i.exec(raw.slice(i, i + 8));
      if (sc) { const j = lower.indexOf('</' + sc[1].toLowerCase(), i); i = j < 0 ? raw.length : raw.indexOf('>', j) + 1; continue; }
      if (raw[i] === '<') { const j = raw.indexOf('>', i); i = j < 0 ? raw.length : j + 1; continue; }
      const m = raw[i] === '&' && /^&(#x[0-9a-f]+|#\d+|[a-z]+);/i.exec(raw.slice(i, i + 12));
      if (m) {
        const e = m[1];
        add(e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m[0]), i);
        i += m[0].length; continue;
      }
      add(raw[i], i); i++;
    }
  } else for (let i = 0; i < raw.length; i++) add(raw[i], i);
  const lines = [0]; for (let i = 0; i < raw.length; i++) if (raw[i] === '\n') lines.push(i + 1);
  const s = { mtime: st.mtimeMs, raw, text: chars.join(''), offs, lines };
  sources.set(file, s);
  return s;
}
function lineOf(s, off) { let lo = 0, hi = s.lines.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s.lines[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; }
const squash = (t) => String(t || '').replace(/\s+/g, '');
// the occurrence of the quote whose surrounding text matches the stored context best
function findText(file, quote, prefix, suffix) {
  const s = source(file), q = squash(quote);
  if (!s || q.length < 2) return null;
  const pre = squash(prefix), suf = squash(suffix);
  let best = -1, top = -1;
  for (let i = s.text.indexOf(q), n = 0; i >= 0 && n < 60; i = s.text.indexOf(q, i + 1), n++) {
    let a = 0, b = 0; const j = i + q.length;
    while (a < pre.length && s.text[i - 1 - a] === pre[pre.length - 1 - a]) a++;
    while (b < suf.length && s.text[j + b] === suf[b]) b++;
    if (a + b > top) { top = a + b; best = i; }
  }
  return best < 0 ? null : { file, line: lineOf(s, s.offs[best]) };
}
// a literal piece of markup, e.g. src="img/x.webp"; with a hint (the alt text), prefer the occurrence near it
function findRaw(file, needle, hint) {
  const s = source(file); if (!s || !needle) return null;
  let first = -1;
  for (let i = s.raw.indexOf(needle); i >= 0; i = s.raw.indexOf(needle, i + 1)) {
    if (first < 0) first = i;
    if (!hint || s.raw.slice(Math.max(0, i - 600), i + 600).includes(hint)) return { file, line: lineOf(s, i) };
  }
  return first < 0 ? null : { file, line: lineOf(s, first) };
}
// a pattern, e.g. the shot's entry in the story's SHOTS table
function findRe(file, re) { const s = source(file); const m = s && re.exec(s.raw); return m ? { file, line: lineOf(s, m.index + m[0].length - m[0].trimStart().length) } : null; }
const pageFile = (page) => { const f = String(page || '').replace(/^\//, '') || 'index.html'; return /^[\w.-]+\.html$/.test(f) && fs.existsSync(path.join(ROOT, f)) ? f : null; };
// the page's own scripts and stylesheets (not the simulation, whose text the review tools never show)
const assetsOf = (file, ext) => { const s = source(file); return s ? [...s.raw.matchAll(new RegExp(`(?:src|href)="(assets/[^"]+\\.${ext})"`, 'g'))].map((m) => m[1]).filter((f) => !/\/sim\./.test(f)) : []; };
function whereInCode(c) {
  const page = pageFile(c.page); if (!page) return null;
  const js = assetsOf(page, 'js'), css = assetsOf(page, 'css'), first = (fn, files) => { for (const f of files) { const r = fn(f); if (r) return r; } return null; };
  let at = null; const also = [];
  if (c.target === 'image' && c.src) at = first((f) => findRaw(f, `src="${c.src}"`, c.alt) || findRaw(f, `url(${c.src})`, c.alt) || findRaw(f, `poster="${c.src}"`), [page, ...css, ...js]);
  if (c.target === 'scene' && c.shot) {
    at = findRaw(page, `data-shot="${c.shot}"`);
    const cam = /^[\w-]+$/.test(c.shot) ? first((f) => findRe(f, new RegExp(`^\\s*${c.shot}\\s*:\\s*\\{`, 'm')), js) : null;
    if (cam) also.push({ ...cam, what: `camera shot "${c.shot}" (position, look-at, field of view, time of day)` });
  }
  if (!at && c.quote && c.target !== 'scene') at = first((f) => findText(f, c.quote, c.prefix, c.suffix), [page, ...js]);
  if (!at && c.alt) at = first((f) => findRaw(f, c.alt), [page, ...js]);     // charts and diagrams: their aria-label
  const id = /^#([\w-]+)/.exec(c.selector || '');
  if (!at && id) at = findRaw(page, `id="${id[1]}"`);
  return at || also.length ? { file: (at || {}).file || page, line: (at || {}).line || null, also } : { file: page, line: null, also };
}

// ---------------------------------------------------------------- rounds
async function openRound(c = pool) {
  let r = (await c.query(`select * from tw_review_rounds where status = 'open'`)).rows;
  if (r.length) return r[0];
  await c.query(`insert into tw_review_rounds default values on conflict do nothing`);
  return (await c.query(`select * from tw_review_rounds where status = 'open'`)).rows[0];
}

// Claude answers a round in review/results/round-N.json. Once that file arrives with `git pull`, copy its answers
// into the database so everyone sees them, and mark the round applied. Safe to repeat: only 'sent' rounds change.
let ingestError = null;
async function ingest() {
  const sent = await q(`select id from tw_review_rounds where status = 'sent'`);
  for (const { id } of sent) {
    const file = path.join(RESULTS, `round-${id}.json`);
    if (!fs.existsSync(file)) continue;
    let res;
    try {
      res = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Array.isArray(res.comments)) throw new Error('no "comments" list');
    } catch (e) { ingestError = `review/results/round-${id}.json could not be read: ${e.message}`; continue; }
    const { head } = await gitLocal();
    await tx(async (c) => {
      for (const r of res.comments) {
        const result = r.result === 'done' || r.result === 'declined' ? r.result : null;
        await c.query(`update tw_review_comments set result = $1, note = $2 where id = $3 and round_id = $4`,
          [result, String(r.note ?? '').slice(0, 2000) || null, +r.id || 0, id]);
      }
      await c.query(`update tw_review_rounds set status = 'applied', applied_at = now(), result_commit = $2, summary = $3
        where id = $1 and status = 'sent'`, [id, head, String(res.summary ?? '').slice(0, 4000) || null]);
    });
    ingestError = null;
    console.log(`Round ${id}: Claude's answers are in.`);
  }
}

const COLS = `id, round_id, parent_id, page, target, section, heading, selector, quote, prefix, suffix, src, alt, shot,
  source_file, source_line, kind, body, author, commit_sha, created_at, updated_at, result, note, (author_key = $2) as mine`;

async function state(key) {
  const g = await gitLocal();
  await ingest();
  const round = await openRound();
  const previous = (await q(`select * from tw_review_rounds where status <> 'open' order by id desc limit 1`))[0] || null;
  if (previous && previous.status === 'sent') checkRemote();
  const ids = [round.id, previous && previous.id].filter(Boolean);
  const comments = await q(`select ${COLS} from tw_review_comments where round_id = any($1) and deleted_at is null order by created_at`, [ids, key]);
  const finished = (await q(`select name from tw_review_finished where round_id = $1 order by at`, [round.id])).map((r) => r.name);
  return { round, previous, comments, finished, canSend: !!(FIRE_URL && FIRE_TOKEN), ingestError,
    git: { head: g.head, branch: g.branch, target: BRANCH, remote: previous && previous.status === 'sent' ? remote.head : null } };
}

// ---------------------------------------------------------------- input checks
const KINDS = new Set(['wording', 'numbers', 'design', 'idea', 'other']);
const TARGETS = new Set(['text', 'image', 'element', 'scene']);
const str = (v, n) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null; };
const keyOk = (k) => /^[A-Za-z0-9_-]{8,64}$/.test(k || '');
class Bad extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

async function addComment(b, key) {
  const body = str(b.body, 4000);
  if (!body) throw new Bad('Write something first.');
  const g = await gitLocal();
  return tx(async (c) => {
    const round = await openRound(c);
    if (b.parent_id) {       // a reply: no anchor of its own, lives in its comment's round
      const p = (await c.query(`select round_id from tw_review_comments where id = $1 and deleted_at is null`, [+b.parent_id])).rows[0];
      if (!p) throw new Bad('That comment no longer exists.', 404);
      if (p.round_id !== round.id) throw new Bad('That round has already gone to Claude; comment in the current round instead.', 409);
      return (await c.query(`insert into tw_review_comments (round_id, parent_id, body, author, author_key, commit_sha)
        values ($1, $2, $3, $4, $5, $6) returning id`, [round.id, +b.parent_id, body, str(b.author, 60), key, g.head])).rows[0];
    }
    const a = { target: TARGETS.has(b.target) ? b.target : 'text', page: str(b.page, 200), section: str(b.section, 100), heading: str(b.heading, 300),
      selector: str(b.selector, 400), quote: str(b.quote, 2000), prefix: String(b.prefix ?? '').slice(-80), suffix: String(b.suffix ?? '').slice(0, 80),
      src: str(b.src, 300), alt: str(b.alt, 400), shot: str(b.shot, 40) };
    if (a.target === 'text' && !a.quote) throw new Bad('Select the text you are commenting on.');
    if (a.target === 'image' && !a.src && !a.selector) throw new Bad('Point at the image you are commenting on.');
    if (a.target === 'element' && !a.selector) throw new Bad('Point at the part of the page you are commenting on.');
    if (a.target === 'scene' && !a.shot) throw new Bad('Point at the scene in a chapter of the story.');
    const at = whereInCode(a) || {};
    return (await c.query(`insert into tw_review_comments (round_id, page, target, section, heading, selector, quote, prefix, suffix, src, alt, shot,
        source_file, source_line, kind, body, author, author_key, commit_sha)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) returning id`,
      [round.id, a.page, a.target, a.section, a.heading, a.selector, a.quote, a.prefix, a.suffix, a.src, a.alt, a.shot,
       at.file || null, at.line || null, KINDS.has(b.kind) ? b.kind : 'other', body, str(b.author, 60), key, g.head])).rows[0];
  });
}

async function editComment(id, b, key) {
  const round = await openRound();
  const rows = b.delete
    ? await q(`update tw_review_comments set deleted_at = now() where id = $1 and author_key = $2 and round_id = $3 and deleted_at is null returning id`, [id, key, round.id])
    : await q(`update tw_review_comments set body = coalesce($4, body), kind = coalesce($5, kind), updated_at = now()
        where id = $1 and author_key = $2 and round_id = $3 and deleted_at is null returning id`,
        [id, key, round.id, str(b.body, 4000), KINDS.has(b.kind) ? b.kind : null]);
  if (!rows.length) throw new Bad('Only your own comments in the current round can be changed.', 403);
  return rows[0];
}

async function finish(b) {
  const name = str(b.name, 60);
  if (!name) throw new Bad('Add your name first.');
  const round = await openRound();
  if (b.done === false) await q(`delete from tw_review_finished where round_id = $1 and name = $2`, [round.id, name]);
  else await q(`insert into tw_review_finished (round_id, name) values ($1, $2) on conflict do nothing`, [round.id, name]);
  return { ok: true };
}

// ---------------------------------------------------------------- Make the changes
// Sends the open round to the cloud task. The round row stays locked while the trigger is called, so a second
// press, from anyone, waits and then finds the round already sent. If the call fails, nothing changes.
async function send(b) {
  if (!FIRE_URL || !FIRE_TOKEN) throw new Bad('"Make the changes" is not set up on this computer: add CLAUDE_TASK_FIRE_URL and CLAUDE_TASK_TOKEN to .env (docs/claude-review-task.md), then restart npm run review.');
  const g = await gitLocal();
  const by = str(b.name, 60) || 'Anonymous';
  return tx(async (c) => {
    const round = (await c.query(`select * from tw_review_rounds where status = 'open' for update`)).rows[0];
    if (!round) throw new Bad('Someone has just sent this round. Reload to see the new one.', 409);
    const all = (await c.query(`select * from tw_review_comments where round_id = $1 and deleted_at is null order by created_at`, [round.id])).rows;
    const top = all.filter((r) => !r.parent_id);
    if (!top.length) throw new Bad('There are no comments in this round yet.');
    // where: looked up again now, against the files as they are at sending, falling back to what was found when saved
    const item = (r) => {
      const at = whereInCode(r) || {};
      const it = { id: +r.id, target: r.target || 'text', kind: r.kind, comment: r.body, by: r.author || 'Anonymous',
        where: { file: at.file || r.source_file || pageFile(r.page), line: at.line || r.source_line || null, selector: r.selector || null,
          section: r.section || null, heading: r.heading || null },
        quote: r.quote, before: r.prefix || '', after: r.suffix || '' };
      if (at.also && at.also.length) it.where.also = at.also;
      if (r.target === 'image') it.image = { src: r.src || null, alt: r.alt || null };
      if (r.target === 'scene') it.scene = { chapter: r.section, shot: r.shot };
      it.replies = all.filter((x) => String(x.parent_id) === String(r.id)).map((x) => ({ by: x.author || 'Anonymous', text: x.body }));
      return it;
    };
    const head = { round: round.id, branch: BRANCH, base_commit: g.head, sent_by: by, results_file: `review/results/round-${round.id}.json`, comments: [] };
    // Fill up to the trigger's size limit; whatever does not fit moves on to the next round.
    const included = [], later = [];
    for (const r of top) {
      const it = item(r);
      if (!later.length && JSON.stringify({ ...head, comments: [...included, it] }).length <= FIRE_LIMIT) included.push(it);
      else later.push(r);
    }
    if (!included.length) throw new Bad('The first comment alone is too long to send. Shorten it and try again.');
    const text = JSON.stringify({ ...head, comments: included });
    const tip = await git('ls-remote', 'origin', 'refs/heads/' + BRANCH).then((o) => o.split(/\s/)[0] || null).catch(() => null);

    let res, json = {};
    try {
      res = await fetch(FIRE_URL, { method: 'POST', signal: AbortSignal.timeout(30000), body: JSON.stringify({ text }), headers: {
        authorization: `Bearer ${FIRE_TOKEN}`, 'anthropic-version': '2023-06-01',
        'anthropic-beta': 'experimental-cc-routine-2026-04-01', 'content-type': 'application/json' } });
      json = await res.json().catch(() => ({}));
    } catch (e) { throw new Bad('Could not reach Anthropic: ' + e.message, 502); }
    if (!res.ok) {
      const m = (json.error && json.error.message) || res.statusText;
      const why = res.status === 401 ? 'the token in CLAUDE_TASK_TOKEN was not accepted (regenerated or mistyped?)'
        : res.status === 404 ? 'the task in CLAUDE_TASK_FIRE_URL does not exist'
        : res.status === 429 ? `too many runs this hour; try again in ${res.headers.get('retry-after') || 'a while'} seconds`
        : m;
      throw new Bad(`Claude could not be started: ${why}.`, 502);
    }
    const url = json.claude_code_session_url || null;
    await c.query(`update tw_review_rounds set status = 'sent', sent_at = now(), sent_by = $2, base_commit = $3, session_url = $4, branch_head = $5 where id = $1`,
      [round.id, by, g.head, url, tip]);
    const next = await openRound(c);
    if (later.length) {
      const ids = later.map((r) => r.id);
      await c.query(`update tw_review_comments set round_id = $1 where round_id = $2 and (id = any($3) or parent_id = any($3))`, [next.id, round.id, ids]);
    }
    remote.t = 0;
    console.log(`Round ${round.id} sent to Claude by ${by}: ${included.length} comments${later.length ? `, ${later.length} moved to round ${next.id}` : ''}. ${url || ''}`);
    return { ok: true, round: round.id, sent: included.length, moved: later.length, next: next.id, session_url: url };
  });
}

// ---------------------------------------------------------------- HTTP
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.pdf': 'application/pdf' };
const TOOLS = '<link rel="stylesheet" href="/__review/review.css"><script src="/__review/review.js" defer></script>';
// served like a static file server, minus the code and secrets that are not part of the site
const PRIVATE = new Set(['node_modules', 'db', 'scripts', 'lib', 'api', 'review']);

function sendJson(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((ok, fail) => {
    let n = 0; const parts = [];
    req.on('data', (d) => { n += d.length; if (n > 200000) { fail(new Bad('Too much data.', 413)); req.destroy(); } else parts.push(d); });
    req.on('end', () => { try { ok(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch { fail(new Bad('Bad request.')); } });
    req.on('error', fail);
  });
}

async function apiRoute(req, res, p) {
  // Only the review tools on this computer may call these: other websites cannot set the custom header without
  // a preflight this server never answers, and a foreign Host (DNS rebinding) is refused.
  if (!HOSTS.has(req.headers.host) || req.headers['x-review'] !== '1') return sendJson(res, 403, { error: 'Forbidden.' });
  if (!pool) return sendJson(res, 503, { error: 'No database: add the dev DATABASE_URL to .env (see the README), then restart npm run review.' });
  const key = req.headers['x-review-key'];
  if (!keyOk(key)) return sendJson(res, 400, { error: 'Missing reviewer key.' });
  try {
    const m = p.match(/^\/__review\/api\/comments\/(\d+)$/);
    if (req.method === 'GET' && p === '/__review/api/state') return sendJson(res, 200, await state(key));
    if (req.method === 'POST' && p === '/__review/api/comments') return sendJson(res, 200, await addComment(await readBody(req), key));
    if (req.method === 'PATCH' && m) return sendJson(res, 200, await editComment(+m[1], await readBody(req), key));
    if (req.method === 'POST' && p === '/__review/api/finish') return sendJson(res, 200, await finish(await readBody(req)));
    if (req.method === 'POST' && p === '/__review/api/send') return sendJson(res, 200, await send(await readBody(req)));
    return sendJson(res, 404, { error: 'Not found.' });
  } catch (e) {
    if (e instanceof Bad) return sendJson(res, e.status, { error: e.message });
    console.error(e);
    return sendJson(res, 500, { error: dbHint(e) });
  }
}

function serveFile(req, res, file, type) {
  const stat = fs.statSync(file);
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && (range[1] || range[2])) {      // video seeking (Safari needs ranges to play mp4 at all)
    let start = range[1] ? +range[1] : stat.size - +range[2], end = range[1] && range[2] ? +range[2] : stat.size - 1;
    if (start >= stat.size || start > end) { res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); return res.end(); }
    end = Math.min(end, stat.size - 1);
    res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': stat.size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.startsWith('/__review/api/')) return apiRoute(req, res, p);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  if (p === '/__review/review.js' || p === '/__review/review.css') return serveFile(req, res, path.join(CLIENT, path.basename(p)), TYPES[path.extname(p)]);

  if (p.endsWith('/')) p += 'index.html';
  const segs = p.split('/').filter(Boolean);
  const file = path.join(ROOT, ...segs);
  if (segs.some((s) => s.startsWith('.')) || PRIVATE.has(segs[0]) || !file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('Not found');
  }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (path.extname(file) !== '.html') return serveFile(req, res, file, type);
  // pages: add the review tools just before </body>
  let html = fs.readFileSync(file, 'utf8');
  const at = html.lastIndexOf('</body>');
  html = at >= 0 ? html.slice(0, at) + TOOLS + html.slice(at) : html + TOOLS;
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : html);
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `✗ Port ${PORT} is in use. Stop the other server, or run: npm run review -- --port ${PORT + 1}` : '✗ ' + e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', async () => {
  const g = await gitLocal();
  console.log(`\nTully review mode   http://localhost:${PORT}\n`);
  if (!envLoaded) console.log(`  ! No ${path.relative(ROOT, ENV_FILE) || '.env'} found. See the README, "Run it locally".`);
  if (!pool) console.log('  ✗ Database   not set: comments are off until DATABASE_URL is in .env');
  else {
    try { await q('select 1 from tw_review_rounds limit 1'); console.log(`  ✓ Database   ${pool.label}`); }
    catch (e) { console.log(`  ✗ Database   ${pool.label}: ${dbHint(e)}`); }
  }
  console.log(FIRE_URL && FIRE_TOKEN ? '  ✓ Claude     "Make the changes" is set up'
    : '  · Claude     "Make the changes" is not set up (docs/claude-review-task.md); commenting works without it');
  console.log(g.branch === BRANCH ? `  ✓ Branch     ${g.branch}` : `  ! Branch     you are on ${g.branch}; Claude pushes to ${BRANCH}`);
  console.log('\n  Click "Review" at the bottom left of any page. Ctrl+C stops the server.\n');
});
