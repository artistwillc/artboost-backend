ArtBoost AI — TikTok Production Review Repair
Generated: August 31, 2026

PURPOSE
This package directly addresses the TikTok reviewer findings:
1. Insufficient Privacy Policy
2. Insufficient Terms of Service
3. App icon mismatch between TikTok Basic Info and the website/browser tab

FILES
- privacy.html        Expanded production-grade privacy disclosure with a dedicated TikTok data/scopes section.
- terms.html          Expanded production-grade Terms of Service with TikTok/third-party integration terms.
- faq.html            Updated support content, including TikTok connection, permissions, disconnect, and deletion guidance.
- app-icon.png        Exact canonical ArtBoost AI icon supplied for this repair.
- favicon.png         256x256 derivative of the exact canonical icon.
- apple-touch-icon.png 180x180 derivative of the exact canonical icon.
- _redirects          Existing clean-URL routing rules, preserved.

INSTALL
Replace the corresponding files in:
E:\ArtBoostAI\backend\website

Add:
app-icon.png
favicon.png
apple-touch-icon.png

Keep _redirects in that same directory.

DEPLOYMENT
The supplied project note states Cloudflare Pages publishes backend/website and the next commit to main deploys these pages.

BEFORE TIKTOK RESUBMISSION
1. Deploy these website files.
2. Open the live /privacy and /terms URLs in a private/incognito browser and verify they load without login.
3. Confirm the browser tab uses the new ArtBoost AI favicon.
4. Confirm the visible website header uses the same ArtBoost AI app icon.
5. In TikTok Developer Portal > Basic Info, upload app-icon.png as the app icon.
6. Compare the TikTok icon and live website/favicon visually before resubmitting.
7. Resubmit the same TikTok products/scopes unless TikTok provides a new scope-specific objection.

IMPORTANT
These legal pages are drafted to address the reviewer’s stated insufficiency and to describe the ArtBoost functionality evidenced by the supplied source files and prior TikTok configuration. They are not a substitute for advice from a licensed attorney.
