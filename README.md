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

## Lead capture: webhook + Formspree mapping

Each page posts a lead to its **own** Zapier webhook (Boxly CRM) and to a
shared Formspree form **in parallel, on every submission** — Formspree is a
genuine backup record of every lead, not a failover only triggered when
Zapier fails. The success/error UI only needs at least one of the two to
succeed. **Do not let the webhooks cross** — a page posting to the other
page's webhook silently mis-attributes every lead in Boxly.

| Page | URL | Zapier webhook (primary) | Formspree `landing_page` tag |
|---|---|---|---|
| `index.html` | `/` (Google Ads) | `.../catch/26496932/4um6lf6/` | `google_ads` |
| `meta-ads.html` | `/meta-ads` (Meta Ads) | `.../catch/26496932/4u5j25n/` | `meta_ads` |

Formspree (`https://formspree.io/f/xkoddegp`) is a single shared endpoint
for both pages — segregation for attribution is done by tagging, not by
separate forms: each submission carries a `landing_page` field (visible as
its own column in the Formspree dashboard/CSV export) and a distinct
`_subject` line per page.

Run `/test-webhooks` to POST sample payloads at all three endpoints without
touching the live form. Run `/verify-attribution` to grep-check that each
page still points at its own webhook/tag before deploying.

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
