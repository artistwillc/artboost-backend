import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../sql/drafts/social-publish-ownership-v2.DRAFT.sql", import.meta.url), "utf8");

test("v2 ownership claim returns an insert-only token", () => {
  assert.match(sql, /ON CONFLICT \(idempotency_key\) DO NOTHING\s+RETURNING \* INTO v_row;/);
  assert.match(sql, /IF FOUND THEN\s+RETURN QUERY SELECT 'claimed'/);
  assert.match(sql, /FOR UPDATE;/);
  assert.match(sql, /'in_progress'::text/);
});
test("v2 completion fences stale or expired workers", () => {
  assert.match(sql, /spa\.claim_token = p_claim_token/);
  assert.match(sql, /spa\.status = 'in_progress'/);
  assert.match(sql, /spa\.claim_expires_at > clock_timestamp\(\)/);
  assert.match(sql, /RETURN v_count = 1;/);
});
test("v2 functions cannot be executed by public application roles", () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.begin_social_publish_attempt_v2[^\n]+FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.finish_social_publish_attempt_v2[^\n]+FROM PUBLIC, anon, authenticated;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.begin_social_publish_attempt_v2[^\n]+TO service_role;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.finish_social_publish_attempt_v2[^\n]+TO service_role;/);
});
