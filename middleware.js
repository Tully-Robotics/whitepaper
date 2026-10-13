// Vercel Routing Middleware: runs on the server before any file is served, including cached static files.
// Nothing on the site is reachable without a valid signed session cookie, except the login page, fonts and robots.txt.
import { neon } from '@neondatabase/serverless';
import { readSession, secrets, masterTag, clearCookie } from './lib/auth.js';

export const config = { matcher: '/:path*', runtime: 'nodejs' };

const PUBLIC = [/^\/login\.html$/, /^\/api\/(login|logout)$/, /^\/fonts\//, /^\/assets\/fonts\.[0-9a-f]+\.css$/, /^\/robots\.txt$/, /^\/favicon\.ico$/];
const NOINDEX = { 'x-robots-tag': 'noindex, nofollow, noarchive', 'cache-control': 'private, no-store' };

// Same wire format as next() / rewrite() from @vercel/functions, without the dependency.
function next(headers = {}) {
  return new Response(null, { headers: { 'x-middleware-next': '1', ...headers } });
}
function rewrite(url, headers = {}) {
  return new Response(null, { headers: { 'x-middleware-rewrite': String(url), ...headers } });
}
const isPage = (p) => p === '/' || p.endsWith('.html') || !/\.[a-z0-9]+$/i.test(p);

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const { session, master } = secrets();

  if (PUBLIC.some((r) => r.test(path))) {
    if (path === '/login.html' && session) {
      const s = await readSession(request.headers.get('cookie'), session);
      if (s && !url.searchParams.has('admin')) return Response.redirect(new URL('/', url), 303);
    }
    return next(path.startsWith('/api/') || path === '/login.html' ? NOINDEX : {});
  }
  if (path.startsWith('/api/')) return next(NOINDEX); // functions check the session themselves

  if (!session || !master) {
    return new Response('Site access is not configured yet (SESSION_SECRET / MASTER_PASSWORD).', { status: 503, headers: NOINDEX });
  }

  const s = await readSession(request.headers.get('cookie'), session);
  let ok = false;
  if (s && s.k === 'm') ok = s.t === (await masterTag(master));
  else if (s && s.k === 'i') ok = true;
  let stale = !!s && !ok; // a signed cookie that no longer counts (master password changed)

  // Revoking an invite takes effect on the next page load: check it (and record last_seen) for page requests only.
  if (ok && s.k === 'i' && isPage(path)) {
    try {
      const url_ = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
      if (url_) {
        const sql = neon(url_);
        const rows = await sql`update tw_invites set last_seen = now() where id = ${s.i} returning revoked_at`;
        if (!rows.length || rows[0].revoked_at) { ok = false; stale = true; }
      }
    } catch {
      /* database unreachable: the signed cookie still proves a login, so keep the site available */
    }
  }

  const adminPage = path === '/admin.html' || path === '/admin';
  if (ok && adminPage && s.k !== 'm') ok = false;

  if (ok) {
    if (path === '/admin') return rewrite(new URL('/admin.html', url), NOINDEX);
    return next(adminPage ? NOINDEX : { 'x-robots-tag': 'noindex, nofollow, noarchive' });
  }
  if (isPage(path)) {
    const login = new URL('/login.html', url);
    if (adminPage) login.searchParams.set('admin', '1');
    const headers = { ...NOINDEX };
    if (stale) headers['set-cookie'] = clearCookie(request);
    return rewrite(login, headers);
  }
  return new Response('Unauthorized', { status: 401, headers: NOINDEX });
}
