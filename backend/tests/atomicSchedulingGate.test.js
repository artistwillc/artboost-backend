import test from 'node:test';
import assert from 'node:assert/strict';
import { atomicSchedulingEnabled } from '../services/atomicSchedulingGate.js';

test('atomic scheduling remains off by default', () => {
  assert.equal(atomicSchedulingEnabled({}), false);
});
test('all three explicit rollout approvals are required', () => {
  const ready = {
    ENABLE_ATOMIC_SCHEDULE_QUOTA: 'true',
    ATOMIC_SCHEDULE_MIGRATION_VERIFIED: 'true',
    SCHEDULE_CLIENT_AUTH_VERIFIED: 'true',
  };
  assert.equal(atomicSchedulingEnabled(ready), true);
  for (const key of Object.keys(ready)) {
    assert.equal(atomicSchedulingEnabled({ ...ready, [key]: 'false' }), false, key);
    assert.equal(atomicSchedulingEnabled({ ...ready, [key]: undefined }), false, key);
  }
});
