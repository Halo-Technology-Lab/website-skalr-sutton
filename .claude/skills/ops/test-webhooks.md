---
name: test-webhooks
description: Verify the Zapier and Formspree lead-capture endpoints for both landing pages without submitting the real form
user_invocable: true
category: ops
---

# Test webhooks

Both landing pages POST a lead to a Zapier webhook first, falling back to
Formspree only if Zapier fails. Use these commands to confirm each endpoint
is wired to the correct page before or after a deploy, without filling in
the live form.

## 1. Google Ads LP → Zapier ("Google Ads LP to Boxly")

`index.html` (`/`) must post here — **not** the Meta hook below.

```bash
curl -X POST https://hooks.zapier.com/hooks/catch/26496932/4um6lf6/ \
  -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{
    "name": "Jefferson Butalid",
    "email": "jefferson@skalragency.com",
    "phone": "441231231312",
    "need": "several",
    "time": "morning",
    "consent": "on",
    "ga4_client_id": "1422515378.1783412983",
    "landing_page": "google_ads"
  }'
```
Expect a 200 with `{"status":"success", ...}`. Check the Zap's task history in Zapier to confirm the payload arrived.

## 2. Meta Ads LP → Zapier ("Meta Ads LP to Boxly")

`meta-ads.html` (`/meta-ads`) must post here.

```bash
curl -X POST https://hooks.zapier.com/hooks/catch/26496932/4u5j25n/ \
  -H "Content-Type: text/plain;charset=UTF-8" \
  -d '{
    "name": "Jefferson Butalid",
    "email": "jefferson@skalragency.com",
    "phone": "441231231312",
    "need": "several",
    "time": "morning",
    "consent": "on",
    "ga4_client_id": "1422515378.1783412983",
    "landing_page": "meta_ads"
  }'
```

## 3. Formspree fallback (shared endpoint, both pages)

```bash
curl -X POST https://formspree.io/f/xkoddegp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+447700900123",
    "need": "full-arch",
    "time": "morning",
    "consent": "on",
    "ga4_client_id": "1422515378.1783412983",
    "landing_page": "google_ads",
    "_subject": "New Google Ads enquiry — Sutton Smiles"
  }'
```
Expect `{"ok": true, ...}`. Re-run with `"landing_page": "meta_ads"` and the
Meta `_subject` line to check the other page's tag, then confirm both show
up distinctly in the Formspree dashboard/CSV export.

## Regression check

If `index.html` ever starts using the `4u5j25n` hook or `meta-ads.html` the
`4um6lf6` hook, Google and Meta leads will land in the wrong Zap — this is
the exact bug fixed in this repo's first pass. See `verify-attribution` for
an automated check.
