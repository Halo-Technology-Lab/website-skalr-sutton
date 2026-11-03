// CallRail post-call webhook -> GHL contact + call note.
// Set the CallRail post-call webhook URL to https://suttonsmiles.info/api/callrail-webhook
// and the company signing key in the CALLRAIL_SIGNING_KEY env var.
// Callers get ss-source-call plus a channel tag, never ss-intake-* (the clinic has
// already spoken to them, so they must not receive the automated intake messages).

import crypto from 'node:crypto';
import { FIELD, toE164, splitName, fields, upsertContact, addNote, json } from '../lib/ghl.mjs';

// CallRail signs the raw body with HMAC-SHA1 using the company signing key.
// Accept base64 or hex so a format difference cannot silently drop every call.
function signatureOk(rawBody, signature, key) {
  if (!key || !signature) return false;
  const mac = crypto.createHmac('sha1', key).update(rawBody, 'utf8');
  const digest = mac.digest();
  const given = String(signature).trim();
  const candidates = [digest.toString('base64'), digest.toString('hex')];
  return candidates.some((c) => c.length === given.length && crypto.timingSafeEqual(Buffer.from(c), Buffer.from(given)));
}

const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return '';
};

function channelTag(source, utmSource) {
  const s = `${source} ${utmSource}`.toLowerCase();
  if (s.includes('google')) return 'ss-source-google';
  if (s.includes('facebook') || s.includes('instagram') || s.includes('meta')) return 'ss-source-meta';
  return 'ss-source-other';
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false });
  const raw = await req.text();

  if (!signatureOk(raw, req.headers.get('signature'), process.env.CALLRAIL_SIGNING_KEY)) {
    console.error('callrail-webhook: signature check failed');
    return json(401, { ok: false });
  }

  let c;
  try {
    c = raw.trim().startsWith('{') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch (e) { return json(400, { ok: false }); }

  // From here on always answer 200, so CallRail does not retry and duplicate notes.
  try {
    if (!process.env.GHL_PRIVATE_TOKEN) throw new Error('GHL_PRIVATE_TOKEN is not set');
    const direction = String(pick(c, 'direction')).toLowerCase();
    if (direction && direction !== 'inbound') return json(200, { ok: true, skipped: 'not inbound' });

    const phone = toE164(pick(c, 'customer_phone_number', 'callernum', 'caller_number'));
    if (!phone) return json(200, { ok: true, skipped: 'no caller number' });

    const source = String(pick(c, 'source', 'source_name'));
    const utmSource = String(pick(c, 'utm_source', 'utmsource'));
    const landing = String(pick(c, 'landing_page_url', 'landingpage', 'landing_page'));
    const { firstName, lastName } = splitName(pick(c, 'customer_name', 'callername'));

    const contactId = await upsertContact({
      firstName,
      lastName,
      phone,
      source: 'CallRail call (suttonsmiles.info)',
      tags: ['ss-source-call', channelTag(source, utmSource)],
      customFields: fields({
        [FIELD.landingPageUrl]: landing,
        [FIELD.utmSource]: utmSource,
        [FIELD.utmMedium]: pick(c, 'utm_medium', 'utmmedium', 'medium'),
        [FIELD.utmCampaign]: pick(c, 'utm_campaign', 'utmcampaign', 'campaign'),
        [FIELD.utmTerm]: pick(c, 'utm_term', 'utmterm', 'keywords'),
        [FIELD.utmContent]: pick(c, 'utm_content', 'utmcontent'),
        [FIELD.gclid]: pick(c, 'gclid')
      })
    });

    const started = pick(c, 'start_time', 'datetime', 'created_at');
    const when = started
      ? new Date(started).toLocaleString('en-GB', { timeZone: 'Europe/London' })
      : new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' });
    const answered = pick(c, 'answered');
    const note = [
      `CallRail call ${when} (UK time)`,
      `Duration: ${pick(c, 'duration') || 0}s, ${answered === false || answered === 'false' ? 'missed' : 'answered'}`,
      `First call: ${pick(c, 'first_call') === true || pick(c, 'first_call') === 'true' ? 'yes' : 'no'}`,
      `Source: ${source || 'unknown'}`,
      pick(c, 'keywords') ? `Keyword: ${pick(c, 'keywords')}` : '',
      pick(c, 'tracking_phone_number', 'trackingnum') ? `Tracking number: ${pick(c, 'tracking_phone_number', 'trackingnum')}` : '',
      pick(c, 'recording_player', 'recording') ? `Recording: ${pick(c, 'recording_player', 'recording')}` : '',
      landing ? `Landing page: ${landing}` : ''
    ].filter(Boolean).join('\n');
    await addNote(contactId, note);
  } catch (e) {
    console.error('callrail-webhook:', e.message);
  }
  return json(200, { ok: true });
};

export const config = { path: '/api/callrail-webhook' };
