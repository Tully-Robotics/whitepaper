// Public: farmers sign up for the waiting list from /waitlist. No session needed.
import { db } from '../lib/db.js';
import { secrets, sha256 } from '../lib/auth.js';
import { validate } from '../lib/waitlist.js';

const MAX_PER_HOUR = 30; // per IP; generous so a whole stand at a trade fair can sign up on one device
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function POST(request) {
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: 'Bad origin.' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Bad request.' }, 400); }

  const v = validate(body);
  if (v.error) return json({ ok: false, error: v.error, field: v.field }, 400);
  if (String(body.website ?? '').trim()) return json({ ok: true }); // honeypot: bots fill the hidden field

  const h = request.headers;
  const ip = (h.get('x-forwarded-for') || h.get('x-real-ip') || '').split(',')[0].trim();
  const ipHash = (await sha256('wl:' + (secrets().session || 'tully') + ':' + ip)).slice(0, 24); // the raw IP is never stored
  const country = String(h.get('x-vercel-ip-country') || '').slice(0, 8) || null;

  let sql;
  try { sql = db(); } catch { return json({ ok: false, error: 'Sign-up is unavailable right now. Please try again shortly.' }, 503); }

  try {
    const [{ n }] = await sql`select count(*)::int as n from tw_waitlist where ip_hash = ${ipHash} and updated_at > now() - interval '1 hour'`;
    if (n >= MAX_PER_HOUR) return json({ ok: false, error: 'Too many sign-ups from this connection. Please try again later.' }, 429);

    const e = v.entry;
    // Signing up again with the same email or phone updates the entry instead of adding a duplicate.
    await sql`insert into tw_waitlist (name, contact, contact_type, hectares, country, ip_hash)
      values (${e.name}, ${e.contact}, ${e.contactType}, ${e.hectares}, ${country}, ${ipHash})
      on conflict (contact) do update set name = excluded.name, contact_type = excluded.contact_type, hectares = excluded.hectares,
        country = coalesce(excluded.country, tw_waitlist.country), ip_hash = excluded.ip_hash, updated_at = now()`;
  } catch (err) {
    console.error('waitlist insert failed', err);
    return json({ ok: false, error: 'Sign-up is unavailable right now. Please try again shortly.' }, 503);
  }
  return json({ ok: true });
}

export function GET() {
  return json({ ok: false, error: 'Use POST.' }, 405);
}
