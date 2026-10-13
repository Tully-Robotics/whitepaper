import { clearCookie } from '../lib/auth.js';

export function POST(request) {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'set-cookie': clearCookie(request) },
  });
}

export function GET(request) {
  return new Response(null, { status: 303, headers: { location: new URL('/', request.url).toString(), 'cache-control': 'no-store', 'set-cookie': clearCookie(request) } });
}
