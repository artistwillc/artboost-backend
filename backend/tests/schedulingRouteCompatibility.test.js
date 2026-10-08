import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../server.js'), 'utf8');
const route = (method, path) => {
  const start = source.indexOf(`app.${method}("${path}", async (req, res) => {`);
  assert.notEqual(start, -1, `Missing route ${method} ${path}`);
  const next = source.indexOf('\napp.', start + 5);
  return source.slice(start, next < 0 ? undefined : next);
};
const securityFlags = /process\.env\.ENFORCE_SCHEDULE_AUTH === "true"\s*\|\|\s*atomicSchedulingEnabled\(\)/;

test('schedule creation authenticates callers when atomic quota is enabled', () => {
  const body = route('post', '/schedule-campaign');
  assert.match(body, securityFlags);
  assert.match(body, /verifySchedulingUser\(supabase, req\.headers\.authorization, userId\)/);
  assert.match(body, /supabase\.rpc\("schedule_campaign_with_quota"/);
  assert.match(body, /success:\s*true,\s*campaign:\s*mapCampaignFromDb\(data\)/);
});
for (const [method, path] of [
  ['get', '/scheduled-campaigns'],
  ['delete', '/scheduled-campaigns/:id'],
  ['patch', '/scheduled-campaigns/:id/lifecycle'],
]) {
  test(`${method.toUpperCase()} ${path} requires ownership checks with either security flag`, () => {
    const body = route(method, path);
    assert.match(body, securityFlags);
    assert.match(body, /if \(!userId\) return res\.status\(400\)/);
    assert.match(body, /verifySchedulingUser\(supabase, req\.headers\.authorization, userId\)/);
  });
}
test('legacy scheduling remains available unless atomic flag is enabled', () => {
  const body = route('post', '/schedule-campaign');
  assert.match(body, /!atomicSchedulingEnabled\(\)/);
  assert.match(body, /checkCampaignLimit\(userId, normalizedPlatform\)/);
});

test('campaign management queries stay scoped to the authenticated account when enabled', () => {
  for (const [method, endpoint] of [
    ['get', '/scheduled-campaigns'],
    ['delete', '/scheduled-campaigns/:id'],
    ['patch', '/scheduled-campaigns/:id/lifecycle'],
  ]) {
    const body = route(method, endpoint);
    const verifiedAt = body.indexOf('verifySchedulingUser(supabase, req.headers.authorization, userId)');
    const scopedAt = body.indexOf('.eq("user_id", userId)');
    assert.ok(verifiedAt >= 0 && scopedAt > verifiedAt, `Missing ownership-scoped query for ${method} ${endpoint}`);
  }
});

test('requested but unverified atomic rollout rejects scheduling instead of silently falling back', () => {
  const body = route('post', '/schedule-campaign');
  assert.match(body, /process\.env\.ENABLE_ATOMIC_SCHEDULE_QUOTA === "true" && !atomicSchedulingEnabled\(\)/);
  assert.match(body, /return res\.status\(503\)\.json\(/);
  assert.ok(body.indexOf('return res.status(503).json(') < body.indexOf('checkCampaignLimit(userId, normalizedPlatform)'), 'Rollout check must precede legacy quota path');
});
