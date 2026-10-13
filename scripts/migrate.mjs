#!/usr/bin/env node
// Database migrations for the white-paper site. Plain SQL files in db/migrations, applied in order.
//
//   npm run db:status                 what is applied, pending or changed
//   npm run db:migrate                apply every pending migration
//   npm run db:rollback               undo the most recent migration (asks first; --yes to skip)
//   npm run db:new -- add_column_x    create db/migrations/<timestamp>_add_column_x.sql
//
// Options: --env <file>  read variables from this file instead of .env
//          --dry-run     show what `up` would apply, change nothing
//          --yes         do not ask before a rollback
//
// File format (same as dbmate, so the files stay portable):
//   -- migrate:up
//   create table ...;
//   -- migrate:down
//   drop table ...;
// Each migration runs in its own transaction. Put `-- migrate:up transaction:false` on the marker line for
// statements that cannot run in a transaction (for example `create index concurrently`).
//
// Connection: DATABASE_URL_UNPOOLED (set by the Vercel Neon integration) or DATABASE_URL.
// Variables already set in the shell win over the env file.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'db', 'migrations');
const TABLE = 'schema_migrations';
const LOCK_KEY = 727274031; // any constant; serialises concurrent runs (e.g. two CI jobs)

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--env'));
const cmd = positional[0] || 'status';

function die(msg) { console.error('✗ ' + msg); process.exit(1); }

function loadEnv(file) {
  if (!fs.existsSync(file)) return false;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    const q = v.match(/^(["'])(.*?)\1/); // quoted value, anything after the closing quote is ignored
    if (q) v = q[1] === '"' ? q[2].replace(/\\n/g, '\n') : q[2];
    else v = v.replace(/\s+#.*$/, '').trim();
    if (process.env[m[1]] === undefined || process.env[m[1]] === '') process.env[m[1]] = v;
  }
  return true;
}

function files() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort().map((f) => {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8');
    const up = text.match(/^--\s*migrate:up(.*)$/m);
    const down = text.match(/^--\s*migrate:down(.*)$/m);
    if (!up) die(`${f}: missing "-- migrate:up" line`);
    const upSql = text.slice(up.index + up[0].length, down && down.index > up.index ? down.index : undefined).trim();
    const downSql = down ? text.slice(down.index + down[0].length, down.index > up.index ? undefined : up.index).trim() : '';
    return {
      version: f.slice(0, 14), name: f.slice(15, -4), file: f,
      checksum: crypto.createHash('sha256').update(upSql).digest('hex'),
      up: upSql, down: downSql,
      upTx: !/transaction:\s*false/.test(up[1]), downTx: !(down && /transaction:\s*false/.test(down[1])),
    };
  });
}

function connectionString() {
  const url = ['DATABASE_URL_UNPOOLED', 'POSTGRES_URL_NON_POOLING', 'DATABASE_URL', 'POSTGRES_URL'].map((k) => (process.env[k] || '').trim()).find(Boolean);
  if (!url) die('No DATABASE_URL_UNPOOLED or DATABASE_URL. Put it in .env, pass --env <file>, or export it.\n  In GitHub Actions: add a DATABASE_URL_UNPOOLED repository secret if `vercel pull` does not provide it.');
  let u;
  try { u = new URL(url); } catch { die('The database URL is not a valid postgresql:// connection string.'); }
  // pg treats sslmode=require as verify-full anyway; say so explicitly to avoid its deprecation warning.
  if (['require', 'prefer', 'verify-ca'].includes(u.searchParams.get('sslmode'))) u.searchParams.set('sslmode', 'verify-full');
  const channelBinding = u.searchParams.get('channel_binding') === 'require';
  u.searchParams.delete('channel_binding');
  return { url: u.toString(), label: `${u.hostname}${u.pathname}`, pooled: /-pooler\./.test(u.hostname), channelBinding };
}

async function connect() {
  const c = connectionString();
  const client = new pg.Client({ connectionString: c.url, application_name: 'tully-migrate', enableChannelBinding: c.channelBinding });
  await client.connect();
  await client.query(`create table if not exists ${TABLE} (
    version    text primary key,
    name       text not null,
    checksum   text not null,
    applied_at timestamptz not null default now())`);
  console.log(`Database: ${c.label}${c.pooled ? '  (pooled connection; DATABASE_URL_UNPOOLED is preferred for migrations)' : ''}`);
  return client;
}

const applied = async (client) => (await client.query(`select version, name, checksum, applied_at from ${TABLE} order by version`)).rows;

function compare(all, done) {
  const byV = new Map(done.map((r) => [r.version, r]));
  const changed = all.filter((m) => byV.has(m.version) && byV.get(m.version).checksum !== m.checksum);
  const missing = done.filter((r) => !all.some((m) => m.version === r.version));
  const pending = all.filter((m) => !byV.has(m.version));
  return { byV, changed, missing, pending };
}

async function runOne(client, m, direction) {
  const sql = direction === 'up' ? m.up : m.down;
  const tx = direction === 'up' ? m.upTx : m.downTx;
  if (tx) {
    await client.query('begin');
    try {
      await client.query('select pg_advisory_xact_lock($1)', [LOCK_KEY]);
      const { rowCount } = await client.query(`select 1 from ${TABLE} where version = $1`, [m.version]);
      if (direction === 'up' && rowCount) { await client.query('rollback'); return false; }
      if (direction === 'down' && !rowCount) { await client.query('rollback'); return false; }
      if (sql) await client.query(sql);
      if (direction === 'up') await client.query(`insert into ${TABLE} (version, name, checksum) values ($1, $2, $3)`, [m.version, m.name, m.checksum]);
      else await client.query(`delete from ${TABLE} where version = $1`, [m.version]);
      await client.query('commit');
      return true;
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    }
  } else {
    if (sql) await client.query(sql);
    if (direction === 'up') await client.query(`insert into ${TABLE} (version, name, checksum) values ($1, $2, $3) on conflict (version) do nothing`, [m.version, m.name, m.checksum]);
    else await client.query(`delete from ${TABLE} where version = $1`, [m.version]);
    return true;
  }
}

async function main() {
  if (cmd === 'new') {
    const slug = positional.slice(1).join('_').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!slug) die('Usage: npm run db:new -- <name>');
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    fs.mkdirSync(DIR, { recursive: true });
    const f = path.join(DIR, `${ts}_${slug}.sql`);
    fs.writeFileSync(f, '-- migrate:up\n\n\n-- migrate:down\n\n');
    console.log('Created ' + path.relative(ROOT, f));
    return;
  }
  if (!['up', 'down', 'status'].includes(cmd)) die(`Unknown command "${cmd}". Use status, up, down or new.`);

  const envFile = opt('--env');
  if (envFile) { if (!loadEnv(path.resolve(envFile))) console.warn(`! Env file not found: ${envFile} (using variables from the shell)`); }
  else loadEnv(path.join(ROOT, '.env'));

  const all = files();
  const client = await connect();
  try {
    const done = await applied(client);
    const { byV, changed, missing, pending } = compare(all, done);

    if (cmd === 'status') {
      for (const m of all) {
        const r = byV.get(m.version);
        const state = !r ? 'pending' : r.checksum !== m.checksum ? 'CHANGED' : 'applied ' + r.applied_at.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
        console.log(`  ${state.padEnd(24)} ${m.file}`);
      }
      for (const r of missing) console.log(`  ${'applied, FILE MISSING'.padEnd(24)} ${r.version}_${r.name}.sql`);
      if (!all.length && !missing.length) console.log('  No migration files.');
      console.log(`${pending.length} pending.`);
      if (changed.length) process.exitCode = 1;
      return;
    }

    if (cmd === 'up') {
      if (changed.length) die(`Already-applied migration(s) were edited: ${changed.map((m) => m.file).join(', ')}.\n  Never edit an applied migration; add a new one with npm run db:new.`);
      for (const r of missing) console.warn(`! ${r.version}_${r.name}.sql is applied in the database but missing here.`);
      const last = done.length ? done[done.length - 1].version : '';
      for (const m of pending) if (m.version < last) console.warn(`! ${m.file} is older than the last applied migration; applying it anyway.`);
      if (!pending.length) { console.log('Up to date.'); return; }
      if (flag('--dry-run')) { pending.forEach((m) => console.log('  would apply ' + m.file)); return; }
      let n = 0;
      for (const m of pending) {
        const t = Date.now();
        let ran;
        try { ran = await runOne(client, m, 'up'); }
        catch (e) { die(`${m.file} failed, ${m.upTx ? 'nothing from it was kept' : 'it ran outside a transaction, so check what was changed'}:\n  ${e.message}`); }
        if (ran) { n++; console.log(`  ✓ ${m.file} (${Date.now() - t} ms)`); }
        else console.log(`  = ${m.file} (already applied by a parallel run)`);
      }
      console.log(`Applied ${n}.`);
      return;
    }

    // down: undo only the newest applied migration
    if (!done.length) { console.log('Nothing to roll back.'); return; }
    const lastRow = done[done.length - 1];
    const m = all.find((x) => x.version === lastRow.version);
    if (!m) die(`The newest applied migration (${lastRow.version}_${lastRow.name}) has no file here.`);
    if (!m.down) die(`${m.file} has no "-- migrate:down" section.`);
    if (!flag('--yes')) {
      if (!process.stdin.isTTY) die('Rolling back needs confirmation: rerun with --yes.');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const a = await rl.question(`Roll back ${m.file}? This runs its down section. [y/N] `);
      rl.close();
      if (!/^y(es)?$/i.test(a.trim())) { console.log('Cancelled.'); return; }
    }
    let ran;
    try { ran = await runOne(client, m, 'down'); }
    catch (e) { die(`Rolling back ${m.file} failed, ${m.downTx ? 'nothing was changed' : 'it ran outside a transaction, so check what was changed'}:\n  ${e.message}`); }
    console.log(ran ? `  ↩ rolled back ${m.file}` : `  = ${m.file} was already rolled back by a parallel run`);
  } finally {
    await client.end();
  }
}

main().catch((e) => die(e.message));
