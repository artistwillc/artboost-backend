ARTBOOST AI — DEDICATED MOBILE WEBSITE BUILD
Built: August 11, 2026

THIS IS A SEPARATE MOBILE BUILD.
It does not replace or modify the approved desktop build.

RECOMMENDED DEPLOYMENT
1. Create this folder in the ArtBoost website:
   backend/website/mobile/

2. Copy ALL files from this ZIP into:
   backend/website/mobile/

3. Your dedicated mobile page will then be:
   https://artboostai.com/mobile/

4. If you want phones to automatically open the mobile build, use the code in:
   OPTIONAL_DESKTOP_MOBILE_REDIRECT.html
   Place that snippet in the <head> of the existing desktop index.html.

WHAT WORKS
- Mobile hamburger navigation
- Create Account
- Sign In
- Start Free
- View Plans & Pricing
- Free / Starter / Pro / Business plan actions
- Existing Stripe website checkout routes for Starter, Pro and Business
- All 12 Creator Tool tabs
- Create / Schedule / Connect workflow cards
- Shopify / Redbubble / Etsy / ArtPal connection cards
- Pinterest / Facebook / Instagram / X links
- FAQ / Privacy / Terms / Support
- AI Content Generator demo button
- Bottom-sheet mobile modals
- ArtBoost app deep-link: artboostai://

PRICING ROUTES
Starter:
https://artboost-ai.onrender.com/subscribe/starter

Pro:
https://artboost-ai.onrender.com/subscribe/pro

Business:
https://artboost-ai.onrender.com/subscribe/business

SUGGESTED GIT COMMANDS
cd /d E:\ArtBoostAI
git add backend/website/mobile
git add backend/website/index.html
git commit -m "Add dedicated ArtBoost mobile website"
git push

IMPORTANT
If you do NOT want automatic mobile redirection yet, do not modify the desktop index.html.
You can first test the mobile build directly at /mobile/.
