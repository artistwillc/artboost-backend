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
