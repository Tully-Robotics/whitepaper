// Shared by middleware.js (edge) and the api/ functions (node). Web Crypto only, no secrets leave the server.
const enc = new TextEncoder();
export const COOKIE = 'tully_session';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export function secrets() {
  const s = (process.env.SESSION_SECRET || '').trim();
  const m = (process.env.MASTER_PASSWORD || '').trim();
  return { session: s.length >= 32 ? s : '', master: m.length >= 10 ? m : '' };
}

// Ties master sessions to the current master password: changing it signs every master session out.
export async function masterTag(master) {
  return (await sha256('master:' + master)).slice(0, 16);
}

export async function signSession(payload, secret) {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body));
  return body + '.' + b64u(sig);
}

export async function readSession(cookieHeader, secret) {
  if (!cookieHeader || !secret) return null;
  const m = cookieHeader.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [body, sig] = m[1].split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64u(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64u(body)));
    if (!p || typeof p.e !== 'number' || p.e < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

// Secure is set whenever the request came over https (always on Vercel). Plain http only happens on
// localhost with `vercel dev`, where Safari would otherwise drop the cookie.
const isHttps = (request) => !request || new URL(request.url).protocol === 'https:';
export function sessionCookie(value, request, maxAge = MAX_AGE) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly;${isHttps(request) ? ' Secure;' : ''} SameSite=Lax`;
}
export const clearCookie = (request) => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly;${isHttps(request) ? ' Secure;' : ''} SameSite=Lax`;

// Invite passwords: 12 characters from an alphabet without look-alikes (0/O, 1/I/L), about 59 bits.
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newPassword() {
  const out = [];
  const buf = new Uint8Array(32);
  while (out.length < 12) {
    crypto.getRandomValues(buf);
    for (const b of buf) if (b < 248 && out.length < 12) out.push(ALPHA[b % 31]); // 248 = 8*31, no modulo bias
  }
  return out.slice(0, 4).join('') + '-' + out.slice(4, 8).join('') + '-' + out.slice(8).join('');
}
export const normInvite = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const inviteHash = (p) => sha256('invite:' + normInvite(p));

export function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
