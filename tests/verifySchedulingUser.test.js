import test from "node:test";
import assert from "node:assert/strict";
import { verifySchedulingUser } from "../services/verifySchedulingUser.js";
const client = user => ({ auth: { getUser: async () => ({ data: { user }, error: null }) } });
test("missing bearer token rejected", async () => {
  assert.equal((await verifySchedulingUser(client({ id: "a" }), "", "a")).status, 401);
});
test("valid owner accepted", async () => {
  assert.deepEqual(await verifySchedulingUser(client({ id: "a" }), "Bearer token", "a"), { ok: true, userId: "a" });
});
test("cross-account request rejected", async () => {
  assert.equal((await verifySchedulingUser(client({ id: "a" }), "Bearer token", "b")).status, 403);
});
test("invalid session rejected", async () => {
  assert.equal((await verifySchedulingUser(client(null), "Bearer token", "a")).status, 401);
});

test("malformed or multiple bearer tokens are rejected before auth lookup", async () => {
  let calls = 0;
  const guarded = { auth: { getUser: async () => { calls++; return { data: { user: { id: "a" } }, error: null }; } } };
  for (const authorization of ["Basic abc", "Bearer", "Bearer first second", "Bearer first\\nsecond"]) {
    assert.equal((await verifySchedulingUser(guarded, authorization, "a")).status, 401);
  }
  assert.equal(calls, 0);
});
test("expired session errors fail closed", async () => {
  const expired = { auth: { getUser: async () => ({ data: { user: null }, error: { message: "expired" } }) } };
  assert.equal((await verifySchedulingUser(expired, "Bearer expired", "a")).status, 401);
});
test("missing claimed account is rejected", async () => {
  assert.equal((await verifySchedulingUser(client({ id: "a" }), "Bearer token", undefined)).status, 403);
});
test("authorization scheme is case insensitive and token is passed unchanged", async () => {
  let received;
  const guarded = { auth: { getUser: async token => { received = token; return { data: { user: { id: "a" } }, error: null }; } } };
  assert.equal((await verifySchedulingUser(guarded, "bEaReR opaque-token", "a")).ok, true);
  assert.equal(received, "opaque-token");
});
