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
