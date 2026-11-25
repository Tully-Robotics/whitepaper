// Validation for the waiting-list form (waitlist.html runs the same rules in the browser).
const clip = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);

export const MAX_HECTARES = 100000;

// Accepts "12", "4.5" and the European "4,5".
export function parseHectares(v) {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export function normEmail(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

// Kept as "+<digits>" (or just digits when no country code was given), so the same number written
// with spaces or dashes is recognised as the same person.
export function normPhone(v) {
  let s = String(v ?? '').trim();
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!/^\+?[\d\s().\/-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15) return null;
  return (s.startsWith('+') ? '+' : '') + digits;
}

// One field takes either: anything with an @ is treated as an email address, everything else as a phone number.
export function validate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const name = clip(b.name, 120);
  if (!name) return { error: 'Please enter your name.', field: 'name' };

  const raw = String(b.contact ?? '').trim();
  if (!raw) return { error: 'Please enter your email address or phone number.', field: 'contact' };
  const contactType = raw.includes('@') ? 'email' : 'phone';
  const contact = contactType === 'email' ? normEmail(raw) : normPhone(raw);
  if (!contact) {
    return { error: 'That email address or phone number does not look right. For a phone number, include the country code.', field: 'contact' };
  }

  const ha = parseHectares(b.hectares);
  if (!(ha > 0) || ha > MAX_HECTARES) return { error: 'Please enter your apple area in hectares, for example 12 or 4.5.', field: 'hectares' };

  return { entry: { name, contactType, contact, hectares: Math.round(ha * 100) / 100 } };
}
