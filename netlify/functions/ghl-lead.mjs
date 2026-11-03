// Landing-page enquiry -> GHL contact.
// The four pages POST their form payload here (text/plain JSON, same origin).
// Upserts the contact with source/intake tags and attribution fields, then adds
// a note with the full enquiry. Tag ss-intake-implants / ss-intake-aligners is
// what starts the GHL intake workflows (WF01 / WF02).

import { FIELD, toE164, splitName, fields, upsertContact, addNote, json } from '../lib/ghl.mjs';

const PRODUCTION_HOSTS = ['suttonsmiles.info', 'www.suttonsmiles.info'];

// landing_page value sent by each page -> enquiry line and ad channel.
const PAGES = {
  google_ads: { line: 'implants', channel: 'google', label: 'suttonsmiles.info/ (Google Ads LP)' },
  google_ads_multi_teeth: { line: 'implants', channel: 'google', label: 'suttonsmiles.info/multiple-implants/' },
  google_ads_clearcorrect: { line: 'aligners', channel: 'google', label: 'suttonsmiles.info/clear-aligners/' },
  meta_ads: { line: 'implants', channel: 'meta', label: 'suttonsmiles.info/meta-ads (Meta Ads LP)' }
};

// Form "need" values -> GHL Treatment Interest option + a readable label.
const NEED = {
  one: ['Not sure', 'One missing tooth'],
  several: ['Multiple missing teeth', 'Several teeth'],
  'full-arch': ['Full arch', 'A full arch / implant dentures'],
  dentures: ['Full arch', 'Loose dentures'],
  'not-sure': ['Not sure', 'Not sure yet'],
  'front-teeth': ['Clear aligners', 'The front teeth'],
  crowding: ['Clear aligners', 'Crowding'],
  gaps: ['Clear aligners', 'Gaps or spacing'],
  'full-mouth': ['Clear aligners', 'Full-mouth alignment']
};

// Form "age" values -> GHL Age Range option (exact GHL option text).
const AGE = { 'under-18': 'Under 18', '18-29': '18-29', '30-44': '30-44', '45-59': '45-59', '60+': '60+' };

const TIME = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' };

function readCookie(cookieHeader, name) {
  const m = (cookieHeader || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false });
  if (!process.env.GHL_PRIVATE_TOKEN) {
    console.error('ghl-lead: GHL_PRIVATE_TOKEN is not set');
    return json(500, { ok: false });
  }

  let p;
  try { p = JSON.parse(await req.text()); } catch (e) { return json(400, { ok: false }); }

  // Honeypot: pretend success, store nothing.
  if (String(p.website || '').trim()) return json(200, { ok: true });

  const name = String(p.name || '').trim();
  const phone = toE164(p.phone);
  const email = String(p.email || '').trim();
  if (!name || (!phone && !email)) return json(400, { ok: false });

  const page = PAGES[p.landing_page] || { line: 'implants', channel: 'other', label: String(p.landing_page || 'unknown') };
  const pageUrl = String(p.page_url || req.headers.get('referer') || '');
  let host = '';
  let q = new URLSearchParams();
  try { const u = new URL(pageUrl); host = u.hostname; q = u.searchParams; } catch (e) { /* no URL */ }
  const isTest = !PRODUCTION_HOSTS.includes(host);

  const [interest, needLabel] = NEED[p.need] || ['Not sure', String(p.need || '')];
  const time = TIME[p.time] || '';
  const age = AGE[p.age] || '';
  const mktEmail = p.marketing_email === 'Yes';
  const mktSms = p.marketing_sms === 'Yes';
  const mktConsent = mktEmail || mktSms;
  const cookies = req.headers.get('cookie') || '';
  const fbclid = q.get('fbclid') || '';
  const fbc = readCookie(cookies, '_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : '');
  const gclid = q.get('gclid') || '';
  const now = Date.now();

  const tags = [
    page.line === 'aligners' ? 'ss-intake-aligners' : 'ss-intake-implants',
    page.channel === 'google' ? 'ss-source-google' : page.channel === 'meta' ? 'ss-source-meta' : 'ss-source-other'
  ];
  if (isTest) tags.push('ss-internal-test');

  const { firstName, lastName } = splitName(name);
  const contact = {
    firstName,
    lastName,
    phone,
    email,
    source: page.channel === 'meta' ? 'Meta Ads LP (suttonsmiles.info)' : 'Google Ads LP (suttonsmiles.info)',
    tags,
    customFields: fields({
      [FIELD.treatmentInterest]: interest,
      [FIELD.mainConcern]: needLabel,
      [FIELD.bestTime]: time,
      [FIELD.ageRange]: age,
      // The two optional, unticked boxes are the only marketing consent. When
      // neither is ticked the Marketing Consent fields stay untouched and the
      // wording version stays at LP v1 (enquiry contact only, no timestamp).
      [FIELD.marketingConsentEmail]: mktEmail ? ['Yes'] : '',
      [FIELD.marketingConsentSms]: mktSms ? ['Yes'] : '',
      [FIELD.consentSourceForm]: page.label,
      [FIELD.consentWordingVersion]: mktConsent ? 'v2 2026-10-28' : 'LP v1: contact me about my enquiry (enquiry contact only, NOT marketing consent)',
      // GHL rejects epoch milliseconds here; an ISO date works for a date or text field.
      [FIELD.consentTimestamp]: mktConsent ? new Date(now).toISOString().slice(0, 10) : '',
      [FIELD.landingPageUrl]: pageUrl,
      [FIELD.utmSource]: q.get('utm_source'),
      [FIELD.utmMedium]: q.get('utm_medium'),
      [FIELD.utmCampaign]: q.get('utm_campaign'),
      [FIELD.utmContent]: q.get('utm_content'),
      [FIELD.utmTerm]: q.get('utm_term'),
      [FIELD.gbraid]: q.get('gbraid'),
      [FIELD.wbraid]: q.get('wbraid'),
      [FIELD.fbc]: fbc,
      [FIELD.fbp]: readCookie(cookies, '_fbp'),
      [FIELD.gclid]: gclid
    })
  };

  let contactId;
  try {
    contactId = await upsertContact(contact);
  } catch (e) {
    console.error('ghl-lead: upsert failed', e.message);
    // Preview/test hosts only: expose GHL's reason so it can be read in the browser.
    return json(502, isTest ? { ok: false, detail: String(e.message).slice(0, 400) } : { ok: false });
  }

  const note = [
    `${isTest ? 'TEST ' : ''}Website enquiry (${page.line}) from ${page.label}`,
    `Looking for: ${needLabel || 'not given'}`,
    `Best time to call: ${time || 'not given'}`,
    `Age range: ${age || 'not given'}`,
    `Marketing email box ticked: ${mktEmail ? 'yes' : 'no'}`,
    `Marketing SMS box ticked: ${mktSms ? 'yes' : 'no'}`,
    mktConsent ? `Marketing consent given at: ${new Date(now).toISOString()}` : '',
    gclid ? `gclid: ${gclid}` : '',
    fbclid ? `fbclid: ${fbclid}` : '',
    pageUrl ? `Page: ${pageUrl}` : ''
  ].filter(Boolean).join('\n');
  try { await addNote(contactId, note); } catch (e) { console.error('ghl-lead: note failed', e.message); }

  return json(200, { ok: true });
};

export const config = { path: '/api/ghl-lead' };
