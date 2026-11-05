// Shared GoHighLevel (LeadConnector) helpers for the Netlify Functions.
// Auth is a GHL Private Integration token in the GHL_PRIVATE_TOKEN env var
// (Contacts view + edit scopes). It is never sent to the browser.

export const GHL_API = 'https://services.leadconnectorhq.com';
export const LOCATION_ID = process.env.GHL_LOCATION_ID || 'L0XaYr7yYrETbaZFQ4T6';

// Custom field IDs in the Sutton sub-account (read from GHL on 3 Nov 2026).
export const FIELD = {
  treatmentInterest: 'FppX7H0xzR382QSY7wKx',
  mainConcern: 'sBWq3xLLKLhKwntZ5257',
  bestTime: 'N8SbBWEMPwW085qm9JrV',
  ageRange: 'ZNh6gfKChPPtClhwy75D',
  marketingConsentEmail: 'pRqECb8Wj8oq0PeOsZ1m',
  marketingConsentSms: 'EOZzEknRC4wif2GeX02o',
  consentTimestamp: '1H8d1JjaD2yazXOb8G4A',
  consentWordingVersion: 'sJOVADELpon5qGNR9LBk',
  consentSourceForm: 'i3WCud6Nqmt3C6Ojb2fM',
  landingPageUrl: 'lUk8mmvionQTw65aGsS0',
  utmSource: 'wuurGheeuo2qZ3ENS7U7',
  utmMedium: 'ZtoW4tio6IUkuje21MLd',
  utmCampaign: 'LZnsb7i2awsbHPwPHY8m',
  utmContent: '43jj4wSzYYoRDgvxO7zD',
  utmTerm: 'kOtPj1oGVGWspALReuos',
  gbraid: '1XMc3MEYfSQ6tSHRmJkM',
  wbraid: '9N16QnyFBcBok8EkOEZv',
  fbc: 'NKBx9poAVM5QarV8VykN',
  fbp: 'LpzTX8jOqlcnI7Klcm1r',
  // No gclid field exists yet. Create a TEXT field in GHL and set its ID here.
  gclid: process.env.GHL_FIELD_GCLID || ''
};

function headers() {
  return {
    Authorization: `Bearer ${process.env.GHL_PRIVATE_TOKEN}`,
    Version: '2021-07-28',
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

async function call(path, body, method = 'POST') {
  const res = await fetch(GHL_API + path, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* non-JSON error body */ }
  if (!res.ok) throw new Error(`GHL ${path} ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

// UK numbers to E.164. Leaves anything it does not recognise untouched.
export function toE164(raw) {
  const digits = String(raw || '').replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('0044')) return '+' + digits.slice(2);
  if (digits.startsWith('44')) return '+' + digits;
  if (digits.startsWith('0')) return '+44' + digits.slice(1);
  return digits;
}

export function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

// Drops empty values so an upsert never blanks a field that already holds data.
export function fields(map) {
  return Object.entries(map)
    .filter(([id, value]) => id && value !== undefined && value !== null && value !== '')
    .map(([id, value]) => ({ id, value }));
}

// Existing contact matched by phone or email (GHL's own duplicate rule), or null.
export async function findContact({ phone, email }) {
  const q = new URLSearchParams({ locationId: LOCATION_ID });
  if (phone) q.set('number', phone);
  if (email) q.set('email', email);
  if (!phone && !email) return null;
  // A failed lookup must never lose a lead: carry on as if the contact is new.
  try {
    const json = await call(`/contacts/search/duplicate?${q}`, undefined, 'GET');
    return (json && json.contact) || null;
  } catch (e) {
    console.error('findContact:', e.message);
    return null;
  }
}

// Adds tags without touching the contact's other tags.
export async function addTags(contactId, tags) {
  if (!tags || !tags.length) return null;
  return call(`/contacts/${contactId}/tags`, { tags });
}

// GHL's upsert REPLACES the tag list, so an existing contact keeps its tags
// (intake, enquiry, opt-out) only if new tags are added separately.
// Returns { id, isNew }.
export async function upsertContact(contact) {
  // GHL rejects empty strings for typed fields such as email, so drop them.
  const clean = Object.fromEntries(Object.entries(contact).filter(([, v]) => v !== '' && v !== undefined && v !== null));
  const existing = await findContact({ phone: clean.phone, email: clean.email });
  const { tags, ...rest } = clean;
  const json = await call('/contacts/upsert', { locationId: LOCATION_ID, ...(existing ? rest : clean) });
  const id = json && json.contact && json.contact.id;
  if (!id) throw new Error('GHL upsert returned no contact id');
  if (existing) await addTags(id, tags);
  return { id, isNew: !existing };
}

export async function addNote(contactId, body) {
  return call(`/contacts/${contactId}/notes`, { body });
}

export function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
