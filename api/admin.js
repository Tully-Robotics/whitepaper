// Admin API: only for sessions signed in with the master password.
import { db, dbHint } from '../lib/db.js';
import { secrets, masterTag, readSession, newPassword, inviteHash } from '../lib/auth.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const clip = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);

async function guard(request) {
  const { session, master } = secrets();
  if (!session || !master) return json({ error: 'Access is not configured yet.' }, 503);
  const s = await readSession(request.headers.get('cookie'), session);
  if (!s || s.k !== 'm' || s.t !== (await masterTag(master))) return json({ error: 'Sign in with the master password.' }, 401);
  return null;
}


const csvCell = (v) => {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheet formulas from running
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export async function GET(request) {
  const denied = await guard(request);
  if (denied) return denied;
  let sql;
  try { sql = db(); } catch (e) { return json({ error: 'Database is not connected: ' + e.message }, 503); }
  try { return await handleGet(request, sql); } catch (e) { return json({ error: dbHint(e) }, 500); }
}

async function handleGet(request, sql) {
  const view = new URL(request.url).searchParams.get('view');

  if (view === 'csv') {
    const rows = await sql`select l.at, l.kind, l.name, l.email, l.firm, i.name as invite_name, i.email as invite_email,
        l.country, l.city, l.user_agent from tw_logins l left join tw_invites i on i.id = l.invite_id order by l.at desc`;
    const head = ['time_utc', 'result', 'name', 'email', 'firm', 'invite_for', 'invite_email', 'country', 'city', 'browser'];
    const lines = [head.join(',')].concat(rows.map((r) =>
      [r.at, r.kind, r.name, r.email, r.firm, r.invite_name, r.invite_email, r.country, r.city, r.user_agent].map(csvCell).join(',')));
    return new Response(lines.join('\r\n') + '\r\n', {
      headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tully-whitepaper-logins.csv"', 'cache-control': 'no-store' },
    });
  }

  const invites = await sql`select i.id, i.name, i.email, i.firm, i.note, i.created_at, i.revoked_at, i.last_seen,
      count(l.id)::int as logins, max(l.at) as last_login
    from tw_invites i left join tw_logins l on l.invite_id = i.id and l.kind = 'invite'
    group by i.id order by i.created_at desc`;
  const logins = await sql`select l.id, l.at, l.kind, l.name, l.email, l.firm, l.country, l.city, l.invite_id,
      i.name as invite_name, i.email as invite_email
    from tw_logins l left join tw_invites i on i.id = l.invite_id order by l.at desc limit 300`;
  const [{ failed24 }] = await sql`select count(*)::int as failed24 from tw_logins where kind = 'failed' and at > now() - interval '24 hours'`;
  return json({ invites, logins, failed24 });
}

export async function POST(request) {
  const denied = await guard(request);
  if (denied) return denied;
  const origin = request.headers.get('origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return json({ error: 'Bad origin.' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request.' }, 400); }
  let sql;
  try { sql = db(); } catch (e) { return json({ error: 'Database is not connected: ' + e.message }, 503); }
  try { return await handlePost(body, sql); } catch (e) { return json({ error: dbHint(e) }, 500); }
}

async function handlePost(body, sql) {
  if (body.action === 'create') {
    const name = clip(body.name, 120), email = clip(body.email, 200).toLowerCase(), firm = clip(body.firm, 160), note = clip(body.note, 300);
    if (!name) return json({ error: 'A name is required.' }, 400);
    const id = crypto.randomUUID();
    for (let k = 0; k < 3; k++) {
      const password = newPassword();
      try {
        await sql`insert into tw_invites (id, name, email, firm, note, pw_hash)
          values (${id}, ${name}, ${email || null}, ${firm || null}, ${note || null}, ${await inviteHash(password)})`;
        return json({ ok: true, id, password });
      } catch (e) {
        if (!/unique|duplicate/i.test(String(e.message))) throw e; // retry only on the (astronomically rare) hash clash
      }
    }
    return json({ error: 'Could not create a unique password, please retry.' }, 500);
  }

  const id = clip(body.id, 64);
  if (!id) return json({ error: 'Missing id.' }, 400);
  if (body.action === 'revoke') {
    await sql`update tw_invites set revoked_at = now() where id = ${id} and revoked_at is null`;
    return json({ ok: true });
  }
  if (body.action === 'restore') {
    await sql`update tw_invites set revoked_at = null where id = ${id}`;
    return json({ ok: true });
  }
  if (body.action === 'reset') {
    const password = newPassword();
    const rows = await sql`update tw_invites set pw_hash = ${await inviteHash(password)}, revoked_at = null where id = ${id} returning id`;
    if (!rows.length) return json({ error: 'Invite not found.' }, 404);
    return json({ ok: true, id, password });
  }
  return json({ error: 'Unknown action.' }, 400);
}
