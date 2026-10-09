# ArtBoost AI Free-tier product contract — draft

Owner-approved requirements:
- Free accounts: $0, one supported social platform selected by the user, five manually scheduled posts per month.
- Free accounts CANNOT add, connect, import, sync, refresh, or scan artwork stores. No store credentials, store OAuth connections, store records, or store-scanning jobs may be created for Free users.
- All store features, store scanners, and automation workflows require an active paid subscription.
- Free accounts cannot enable recurring campaigns, auto-posting from stores, automatic artwork selection, or other background automation. A manually scheduled one-time post is permitted.
- Paid customers retain existing store and scheduling capabilities.

Backend requirements before release:
1. Enforce subscription entitlements on every store-connect, OAuth callback, add/import, scan, refresh, sync, and background job entrypoint; UI-only hiding is insufficient.
2. Use server-side verified subscription state; never trust a tier submitted by the client.
3. Enforce one persisted social-platform selection and a monthly five-post quota atomically.
4. Return a consistent upgrade-required error for blocked Free actions.
5. Verify iOS, Android, and website compatibility before enabling enforcement.

Still to decide: how often Free users may change their selected social platform; which manual-post platforms are actually supported; whether the monthly quota counts created campaigns or published posts.

Status: SPECIFICATION ONLY. No production entitlement changes or migrations are authorized by this document.

## Verified route inventory (2026-10-08)
Dedicated `backend/routes/stores.js` entry points:
- `GET /` lists stores (read-only; product policy must decide whether Free accounts see legacy stores).
- `POST /:storeId/sync-background`, `POST /:storeId/sync`: store scans/synchronization; paid-only.
- `POST /universal/import`, `POST /redbubble/import`, `POST /fine-art-america/import`: imports; paid-only.
- `POST /:storeId/disconnect`: allow users to remove old connections, even after downgrading.
- `GET /import-jobs/:jobId`: read-only progress; protect ownership, avoid creating new jobs.
- `POST /sync-due/run`: internal background scheduler; requires separate service authentication and paid-tier checks per job, not merely a client middleware gate.

Also audit `backend/routes/automations.js` creation/update/resume/run routes, `backend/server.js` legacy Etsy/Shopify and `/api/v2/store-connections` routes, OAuth callbacks, and catalog import workers. Do not consider Free restrictions complete until all entry points and workers are covered.

Security: `backend/middleware/auth.js` already provides `resolveRequestUserId` with strict authentication in production. Subscription verification must use the resolved identity, not an unverified `userId` body/query parameter.

Implementation status: inventory only; no store entitlement gate active.
