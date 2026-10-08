# Atomic scheduling rollout checklist (draft PR #42)

**Current status:** development only. Do not deploy or enable flags until all items are verified.

## Before merging
- [x] Isolated PostgreSQL quota, monthly-reset, rejection, and concurrent-request tests pass.
- [x] Subscription resolution and ownership-verification unit tests pass.
- [x] Backend scheduling compatibility structure tests pass.
- [x] Fail-closed feature activation gate is tested.
- [ ] Verify every published iOS, Android, and web scheduling client sends a Supabase access token as `Authorization: Bearer <token>` on create, list, delete, and lifecycle requests. Current source inspection is insufficient to confirm this.
- [ ] Verify all existing scheduling entrypoints, background jobs, and server-side callers remain compatible with ownership enforcement.
- [ ] Verify the exact live Stripe price IDs and subscription tier mapping.
- [ ] Complete migration review: live column types, RLS policies and absence of the RPC were inspected read-only; production permissions, complete migration effects and staging execution still need verification.

## Staged release (requires explicit authorization)
1. Keep `ENABLE_ATOMIC_SCHEDULE_QUOTA`, `ATOMIC_SCHEDULE_MIGRATION_VERIFIED`, and `SCHEDULE_CLIENT_AUTH_VERIFIED` unset/false.
2. Test released clients against a nonproduction backend with authentication enforced; confirm successful create, list, pause, resume, and delete for each client. Test expired tokens and cross-account denial.
3. Confirm the SQL migration against a representative staging schema; verify grants and service-role execution.
4. After explicit production approval, apply the reviewed migration, verify it, then set `ATOMIC_SCHEDULE_MIGRATION_VERIFIED=true` only.
5. After independently confirming client compatibility, set `SCHEDULE_CLIENT_AUTH_VERIFIED=true` only.
6. Enable `ENABLE_ATOMIC_SCHEDULE_QUOTA=true` during a monitored release window. Check real create/list/delete/lifecycle requests and quota counters.
7. If unexpected failures occur, turn off `ENABLE_ATOMIC_SCHEDULE_QUOTA` to restore the legacy scheduling path; investigate before retrying. Disabling the flag does **not** reverse database changes.

**Caution:** This gate protects the atomic scheduling feature; it does not substitute for a full audit of all other account-scoped endpoints. No production migration, merge, or deployment is performed by this checklist.

## Client source discovery (2026-10-08)
- Accessible repositories: `artistwillc/artboost-backend` and `artistwillc/artboost-ai`.
- Search of `artistwillc/artboost-ai` for `schedule-campaign` and `scheduled-campaigns` returned no matching indexed files; its root `package.json` identifies a backend package, not a verified mobile client.
- **Unverified:** released iOS and Android source versions, authorization headers on scheduling requests, and compatibility with the protected routes.
- Do not mark `SCHEDULE_CLIENT_AUTH_VERIFIED` true based on repository search or backend tests alone. Obtain exact mobile/web client source or capture authorized requests in a nonproduction environment and test all four operations.

## Verification evidence (2026-10-08)
- Subscription tier backend run #56 succeeded; isolated PostgreSQL quota and RPC-permission run #34 succeeded.
- Connected GitHub owner repository listing returned only `artistwillc/artboost-backend` and `artistwillc/artboost-ai`.
- Indexed searches across both repositories for `supabase.auth.getSession`, `schedule-campaign`, `Authorization`, and `expo` returned no matching files. Search index absence is **not** proof that a client omits bearer tokens.
- **Release blocker remains:** locate the exact source/build corresponding to currently published iOS and Android versions, or run authorized nonproduction request captures, then validate bearer tokens on create/list/delete/lifecycle before enabling either authentication enforcement or atomic scheduling.
- Never set `ENFORCE_SCHEDULE_AUTH=true` solely on the strength of backend unit tests: older clients could receive authentication failures.

## CI verification update (2026-10-08)
- Commit `522973b8e14d686a277e1df7708544f63ab9dcee`: backend workflow run #68 succeeded and isolated PostgreSQL run #46 succeeded.
- Backend workflow now **explicitly runs** `backend/tests/schedulingIdentityContract.test.js` and watches it in the pull-request path filter. The preceding green run #67 did not include this new test; do not cite #67 as evidence for that suite.
- Behavioral coverage verifies the shared identity helper against mocked asynchronous Supabase responses. It is **not** a full end-to-end HTTP test against a released iOS, Android, or web client.
- Outstanding release blockers remain: published-client bearer token compatibility, backend callers, Stripe Price IDs, and representative production schema/migration review. No merge or production activation authorized.

## Production RLS read-only audit (2026-10-08)
- Confirmed `public.profiles` and `public.scheduled_campaigns` both have RLS enabled.
- Profile authenticated SELECT/UPDATE policies restrict rows with `auth.uid() = id`.
- Scheduled-campaign authenticated SELECT/INSERT/UPDATE/DELETE policies restrict rows with `auth.uid() = user_id`; INSERT has an explicit ownership `WITH CHECK`.
- Existing UPDATE policies show `with_check = NULL` in `pg_policies`. PostgreSQL may reuse a policy's USING expression as WITH CHECK when omitted; verify effective behavior and plan an explicit WITH CHECK hardening migration if appropriate. Do not claim the existing policies permit reassignment without a behavioral test.
- Service-role policies allow backend access; confirm actual function EXECUTE grants in isolated PostgreSQL CI before applying the RPC.
- Live database does not yet have `public.schedule_campaign_with_quota(uuid,jsonb)`; expected while migration remains unapplied.
- This audit made no production database modifications.

## Final verification checkpoint (2026-10-08)
- Commit `7f2a284255b857258940ef947303cd47c54852b5`: backend CI run #75 and isolated PostgreSQL CI run #53 both passed.
- The isolated PostgreSQL workflow now runs `tests/sql/rls_ownership_assertions.sql`, verifying that an UPDATE policy with an owner-only USING expression and omitted WITH CHECK rejects ownership reassignment in the tested configuration. This does not replace a production RLS permission audit.
- Read-only production schema inspection confirmed required profile/campaign column names and types; live function lookup confirmed the proposed RPC has not been installed. No production SQL modifications were made.
- **Ready:** draft PR code and currently configured automated tests. **Not release-ready:** published-client token verification, background caller audit, live Stripe price IDs, and complete staging/permission checks.
- **Release decision: HOLD.** Do not merge, deploy, apply SQL, or enable flags until the unresolved items are verified and the owner explicitly authorizes the rollout.

## Production deployment topology verified (2026-10-08)
- Render service `artboost-ai` (`srv-d7vm9cl7vvec73djg4og`) tracks GitHub `artistwillc/artboost-backend`, branch `main`, root directory `backend`, command `node server.js`.
- **Auto-deploy is enabled on commits to `main`.** Merging PR #42 would initiate a production deploy even if atomic quota flags remain disabled. Therefore merging is a production change and requires explicit approval after all checks.
- PR branch remains isolated from the Render production deploy branch.
- No live Render environment variables were modified; do not activate `ENFORCE_SCHEDULE_AUTH` or atomic scheduling flags until published-client compatibility and migration readiness are independently verified.

## Exact client compatibility contract (2026-10-08)
Production entrypoint `backend/server.js` expects all four client operations to identify the account and, after auth enforcement, provide a **Supabase user access token** in the `Authorization: Bearer <token>` header:
1. `POST /schedule-campaign`: JSON body `userId`, `title`, `description`, `publishAt`, and campaign details.
2. `GET /scheduled-campaigns?userId=<uuid>`: user ID in query string.
3. `DELETE /scheduled-campaigns/:id?userId=<uuid>`: campaign ID in URL, user ID in query string.
4. `PATCH /scheduled-campaigns/:id/lifecycle`: JSON body `userId` and `campaignStatus` (active/paused/ended/saved).
The protected routes compare the Supabase-authenticated user ID against the claimed `userId` and scope database reads/writes to that user. The public mobile and website builds have **not** been observed sending these headers; do not enable the flags without validating actual client traffic or published source.
Backend CI run #76 and isolated PostgreSQL run #54 succeeded at commit `f36530c63a54ac902c18e7a2039009de58a0300f`. The production Render service auto-deploys `main`; PR merge is a production deploy.

## Post-synchronization CI checkpoint (2026-10-08)
- Root and backend copies of `subscriptionTier.js` and `verifySchedulingUser.js` now use identical hardened logic.
- Root and backend unit tests are aligned, including partial Stripe line items, malformed auth headers, thrown auth-provider errors and malformed account IDs.
- Latest commit `b9984a1dd61aad17965d7857e3e316f70af58f33`: backend CI run #82 passed; isolated PostgreSQL run #60 passed.
- **Approval remains conditional** on published client compatibility, Stripe price mapping and staging validation; green unit tests alone do not authorize deployment.

## Live production baseline (2026-10-08)
- Render deployment `dep-db3qu18473hc73bt77og` reports status `live` for commit `9a5a06649abc5879bda4aa998079e04d01311074` on `main` (Google Play download badge correction).
- The currently live code is **not** draft PR #42. Preserve this commit as the known deployed baseline for comparison and rollback planning.
- Production service has auto-deploy enabled on `main`; do not merge this PR as a surrogate for isolated testing.
- Next gate: obtain and verify real published-client scheduling requests and Stripe Price ID mappings without exposing user tokens or secrets. No configuration changes were made during this check.

## Additional rollout blocker: monthly quota reset semantics (2026-10-08)
- Inspected `backend/server.js` legacy `checkCampaignLimit`: compares `new Date()` against `new Date(profile.campaign_reset_date)`, and advances reset using JavaScript `setMonth` then writes an ISO timestamp.
- Live `profiles.campaign_reset_date` column is PostgreSQL `date` (no time of day), while draft atomic RPC computes `today_utc` and advances by `interval '1 month'` on a date.
- **Behavioral parity is not established** for month-end dates, timezone boundaries, and dates previously written from JavaScript. Before rollout, create boundary-case tests and agree on the canonical reset rule; avoid silently changing renewal timing for customers.
- The atomic function's supported scheduling platforms (`pinterest`, `facebook`, `instagram`, `x`) match the current create-route allowlist, but do not imply support for all ArtBoost connected posting platforms.
- Keep release on HOLD until this boundary behavior is tested in addition to published-client auth, Stripe price mapping, and staging checks.
