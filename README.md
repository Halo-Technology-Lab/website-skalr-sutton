# Sutton Dental & Implant Clinic — landing pages

Two static landing pages for suttonsmiles.info, deployed as one Netlify
site: `index.html` for Google Ads, `meta-ads.html` for Meta Ads. No build
step, no framework, no server — Netlify publishes the repo root as-is.

Both pages boot a proprietary React-based template runtime
(`assets/js/dc-runtime.js`) that reads a `<x-dc>...</x-dc>` template block
per page and mounts an inline `class Component extends DCLogic` script
that holds all interactivity, including the enquiry form.

## Where things live

- **Page markup/copy**: inline inside each page's own `<x-dc>` block. There
  is no shared component library between the two pages — they're
  independent files that happen to share `assets/js/dc-runtime.js`.
- **Form logic** (`submitForm`, validation, webhook/Formspree calls): the
  `class Component extends DCLogic { ... }` script at the bottom of each
  HTML file.
- **Consent Mode v2 / cookie banner**: the `#consent-banner` div + its
  handling `<script>`, placed in `<body>` before `<x-dc>` on both pages so
  it survives independently of the template runtime's re-renders.
  GTM loads on every visit on all four pages with consent defaulting to
  denied (Consent Mode v2, advanced): Google tags send cookieless pings until
  the visitor accepts. The Meta pixel tags in GTM require `ad_storage` and
  fire on the `consent_granted` dataLayer event that `applyConsent(true)`
  pushes, so Meta never fires before consent.

## Lead capture: GHL function + Formspree

Every page posts each lead to `/api/ghl-lead` (Netlify Function in
`netlify/functions/ghl-lead.mjs`) and to the shared Formspree form in parallel.
The function upserts the contact into GHL (sub-account `L0XaYr7yYrETbaZFQ4T6`)
with an intake tag (`ss-intake-implants` / `ss-intake-aligners`, which starts
the GHL intake workflows), a source tag (`ss-source-google` / `ss-source-meta`),
attribution fields and a note. Formspree (`https://formspree.io/f/xkoddegp`)
stays as a backup email; the success UI needs at least one of the two to work.

| Page | `landing_page` | GHL tags |
|---|---|---|
| `index.html` | `google_ads` | `ss-intake-implants`, `ss-source-google` |
| `meta-ads.html` | `meta_ads` | `ss-intake-implants`, `ss-source-meta` |
| `/multiple-implants/` | `google_ads_multi_teeth` | `ss-intake-implants`, `ss-source-google` |
| `/clear-aligners/` | `google_ads_clearcorrect` | `ss-intake-aligners`, `ss-source-google` |

When the visitor picks an adult age band (anything except Under 18) the
function also adds `ss-age-given`. GHL WF15 (Age Confirmed) triggers on it to
release a contact that an earlier enquiry without an age left on hold.

On any host other than suttonsmiles.info (deploy previews, local) the page
sends to GHL only, the function adds `ss-internal-test` (which stops the GHL
workflows), no Formspree email is sent and no conversion event is pushed.

Form fields: every form has a required "How old are you?" select (`age`, sent to
GHL Age Range as Under 18, 18-29, 30-44, 45-59 or 60+) and two optional,
unticked marketing boxes (`marketing_email`, `marketing_sms`). A ticked box sets
the matching Marketing Consent field to `["Yes"]`, Consent Wording Version to
`v2 2026-10-28` and Consent Timestamp. With neither ticked, the wording version
stays `LP v1` (enquiry contact only) and no timestamp is set. Under-18 leads are
still submitted; GHL decides what to do with them.

CallRail calls reach GHL through `/api/callrail-webhook` (CallRail post-call
webhook, signature-checked): contact upsert with `ss-source-call` plus a channel
tag, and a note with duration, source and recording link.

Netlify env vars: `GHL_PRIVATE_TOKEN` (GHL Private Integration, Contacts
scopes), `CALLRAIL_SIGNING_KEY`, and `GHL_FIELD_GCLID` once a gclid custom field
exists in GHL. Never commit them.

## Fixed in this pass

- `index.html` was posting to the **Meta** Ads Zapier webhook instead of
  its own Google Ads one — every Google Ads lead was landing in the wrong
  Zap. Fixed (now `4um6lf6`).
- `meta-ads.html`'s `submitForm` showed a fake "thank you" and fired the
  `lead_submit` conversion event **even when both the Zapier and Formspree
  POSTs failed** — brought in line with `index.html`'s already-correct
  pattern (only shows success once a POST is confirmed 2xx; shows an error
  banner with a click-to-call fallback otherwise).
- Formspree was previously only contacted as a **fallback** — only fired
  if the Zapier POST failed — on both pages, which doesn't satisfy "all
  submissions go to Formspree as a backup". Both pages now `fetch()` Zapier
  and Formspree in parallel (`Promise.allSettled`) on every submission,
  independently of each other.
- `meta-ads.html` had no cookie-consent banner or Consent Mode v2 at all,
  so it sent the health-intent `enquiry_type` field to Meta/GTM
  unconditionally, with no marketing-consent gate. Brought to parity with
  `index.html`'s consent banner/gating.
- GA4 client ID capture no longer depends on a third-party script
  (`app.boxly.ai/scripts/ga4_client_id_tracker.js`, previously loaded only
  on `meta-ads.html`). Both pages now read the `_ga` cookie directly and
  forward `ga4_client_id` to both Zapier and Formspree.
- Removed the dead `assets/js/image-slot.js` `<script>` tag from
  `meta-ads.html` (unused design-tool helper, already removed from
  `index.html`).
- Dropped `vercel.json` — leftover from an earlier Vercel deploy attempt,
  not needed now Netlify is the only host.

## Deployment

Netlify, git-integrated auto-deploy from `main`. `netlify.toml` publishes
the repo root with no build command — no `[[plugins]]`/`[functions]` are
needed (this is a static site, not an SSR framework app). One `[[redirects]]`
rewrite maps clean `/meta-ads` to `/meta-ads.html`.

No environment variables are required — all webhook/Formspree URLs are
public, client-side literals by design (Zapier's Catch Hook and Formspree
are both meant to be posted to directly from the browser).

## Future hardening (not done in this pass)

- No Content-Security-Policy is set. Adding one is non-trivial here because
  `dc-runtime.js` transpiles the inline component script via Babel in the
  browser (needs `unsafe-eval`) and both pages load third-party GTM/Meta
  Pixel/CallRail scripts — worth doing as its own piece of work, not
  bundled into a functional bug-fix pass.
- Babel (`@babel/standalone`) is loaded from `unpkg.com` at runtime,
  unvendored — a CDN outage there would break page boot on both pages
  (there is a `showBootFailureFallback()` in `dc-runtime.js`, but vendoring
  Babel locally, the way React/ReactDOM already are, would remove the
  dependency entirely).
