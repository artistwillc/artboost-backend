const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(require('node:path').join(__dirname, '../server.js'), 'utf8');
const route = (method, path) => {
  const start = source.indexOf(`app.${method}("${path}", async (req, res) => {`);
  assert.notEqual(start, -1, `Missing route ${method} ${path}`);
  const next = source.indexOf('\napp.', start + 5);
  return source.slice(start, next < 0 ? undefined : next);
};
const securityFlags = /process\.env\.ENFORCE_SCHEDULE_AUTH === "true"\s*\|\|\s*process\.env\.ENABLE_ATOMIC_SCHEDULE_QUOTA === "true"/;

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
  assert.match(body, /process\.env\.ENABLE_ATOMIC_SCHEDULE_QUOTA !== "true"/);
  assert.match(body, /checkCampaignLimit\(userId, normalizedPlatform\)/);
});
