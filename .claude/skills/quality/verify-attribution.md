---
name: verify-attribution
description: Grep both landing pages to confirm each posts leads to its own Zapier webhook and Formspree tag, not the other page's
user_invocable: true
category: quality
---

# Verify attribution

Guards against the exact regression already found and fixed once in this
repo: `index.html` (Google Ads) posting to the Meta Ads Zapier hook instead
of its own. Run this after touching either `submitForm` function, and before
any deploy.

## Checks

```bash
# index.html must contain the Google hook, and must NOT contain the Meta hook
grep -q "4um6lf6" index.html && echo "OK: index.html has Google hook" || echo "FAIL: index.html missing Google hook"
grep -q "4u5j25n" index.html && echo "FAIL: index.html has the Meta hook" || echo "OK: index.html does not have Meta hook"

# meta-ads.html must contain the Meta hook, and must NOT contain the Google hook
grep -q "4u5j25n" meta-ads.html && echo "OK: meta-ads.html has Meta hook" || echo "FAIL: meta-ads.html missing Meta hook"
grep -q "4um6lf6" meta-ads.html && echo "FAIL: meta-ads.html has the Google hook" || echo "OK: meta-ads.html does not have Google hook"

# Formspree segregation tags must be page-correct
grep -q "landing_page', 'google_ads'" index.html && echo "OK: index.html tags google_ads" || echo "FAIL: index.html landing_page tag wrong/missing"
grep -q "landing_page', 'meta_ads'" meta-ads.html && echo "OK: meta-ads.html tags meta_ads" || echo "FAIL: meta-ads.html landing_page tag wrong/missing"
```

All six lines must print `OK:`. Any `FAIL:` means a lead will be
mis-attributed or land in the wrong Zap/Formspree bucket — fix before
deploying.
