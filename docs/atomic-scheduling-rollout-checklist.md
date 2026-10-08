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
- [ ] Review production schema, policies, existing functions, and migration effects before applying any SQL.

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
