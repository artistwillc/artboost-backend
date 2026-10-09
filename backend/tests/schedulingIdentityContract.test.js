import test from "node:test";
import assert from "node:assert/strict";
import { verifySchedulingUser } from "../services/verifySchedulingUser.js";

// Contract tests for the same verifier used by scheduling create/list/delete/lifecycle.
// This tests real async responses and token forwarding, not route source-text patterns.
const authorized = token => ({
  auth: {
    getUser: async received => {
      assert.equal(received, token);
      return { data: { user: { id: "owner-1" } }, error: null };
    },
  },
});

test("authenticated scheduling identity contract", async t => {
  await t.test("owner bearer token accepted", async () => {
    assert.deepEqual(
      await verifySchedulingUser(authorized("session-123"), "Bearer session-123", "owner-1"),
      { ok: true, userId: "owner-1" }
    );
  });
  await t.test("valid session cannot impersonate another account", async () => {
    assert.deepEqual(
      await verifySchedulingUser(authorized("session-123"), "Bearer session-123", "owner-2"),
      { ok: false, status: 403, reason: "Account mismatch" }
    );
  });
  await t.test("missing token never calls identity provider", async () => {
    const provider = { auth: { getUser: async () => { throw new Error("must not run"); } } };
    assert.equal((await verifySchedulingUser(provider, undefined, "owner-1")).status, 401);
  });
  await t.test("provider outage fails closed", async () => {
    const provider = { auth: { getUser: async () => { throw new Error("temporary outage"); } } };
    assert.deepEqual(
      await verifySchedulingUser(provider, "Bearer session-123", "owner-1"),
      { ok: false, status: 401, reason: "Invalid or expired session" }
    );
  });
});
