import { db } from '../lib/db.js';
import { secrets, masterTag, signSession, sessionCookie, inviteHash, sha256, timingSafeEqualStr, MAX_AGE } from '../lib/auth.js';

const MAX_FAILS = 8; // per IP per 15 minutes
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...extra } });
const clip = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);

export async function POST(request) {
  const { session, master } = secrets();
  if (!session || !master) return json({ ok: false, error: 'Access is not configured yet.' }, 503);

  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: 'Bad origin.' }, 403);

  let body = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }
  const password = String(body.password ?? '').trim().slice(0, 200);
  if (!password) return json({ ok: false, error: 'Please enter your password.' }, 400);

  const h = request.headers;
  const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim();
  const ipHash = (await sha256('ip:' + session + ':' + ip)).slice(0, 24); // the raw IP is never stored
  const country = clip(h.get('x-vercel-ip-country'), 8) || null;
  let city = null;
  try { city = clip(decodeURIComponent(h.get('x-vercel-ip-city') || ''), 80) || null; } catch {}
  const ua = clip(h.get('user-agent'), 300) || null;

  let sql = null;
  try { sql = db(); } catch { sql = null; }

  if (sql) {
    try {
      const [{ n }] = await sql`select count(*)::int as n from tw_logins
        where ip_hash = ${ipHash} and kind = 'failed' and at > now() - interval '15 minutes'`;
      if (n >= MAX_FAILS) return json({ ok: false, error: 'Too many attempts. Please wait 15 minutes and try again.' }, 429);
    } catch { sql = null; }
  }

  let kind = 'failed', inviteId = null;
  const pwH = await sha256('pw:' + password), mH = await sha256('pw:' + master);
  if (timingSafeEqualStr(pwH, mH)) kind = 'master';
  else if (sql) {
    try {
      const rows = await sql`select id from tw_invites where pw_hash = ${await inviteHash(password)} and revoked_at is null`;
      if (rows.length) { kind = 'invite'; inviteId = rows[0].id; }
    } catch { sql = null; }
  }

  if (sql) {
    try {
      // Visitors only enter a password: who signed in is known from the invite it belongs to.
      await sql`insert into tw_logins (kind, invite_id, country, city, ip_hash, user_agent)
        values (${kind}, ${inviteId}, ${country}, ${city}, ${ipHash}, ${ua})`;
    } catch { /* logging is best effort */ }
  } else if (kind !== 'master') {
    return json({ ok: false, error: 'The sign-in service is unavailable. Please try again shortly.' }, 503);
  }

  if (kind === 'failed') {
    await new Promise((r) => setTimeout(r, 600));
    return json({ ok: false, error: 'That password is not valid. Check the message you received, or contact the person who invited you.' }, 401);
  }

  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = kind === 'master' ? { k: 'm', t: await masterTag(master), e: exp } : { k: 'i', i: inviteId, e: exp };
  return json({ ok: true, admin: kind === 'master' }, 200, { 'set-cookie': sessionCookie(await signSession(payload, session), request) });
}

export function GET() {
  return json({ ok: false, error: 'Use POST.' }, 405, { allow: 'POST' });
}
