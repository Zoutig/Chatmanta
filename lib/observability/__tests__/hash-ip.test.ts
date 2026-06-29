import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hashIp } from '../hash-ip';

test('hashIp: null/lege input → null, anders 16 hex-chars deterministisch', () => {
  assert.equal(hashIp(null), null);
  assert.equal(hashIp(undefined), null);
  assert.equal(hashIp('   '), null);
  assert.equal(hashIp('1.2.3.4')!.length, 16);
  assert.match(hashIp('1.2.3.4')!, /^[0-9a-f]{16}$/);
  assert.equal(hashIp('1.2.3.4'), hashIp('1.2.3.4')); // deterministisch
  assert.notEqual(hashIp('1.2.3.4'), hashIp('1.2.3.5')); // verschillende IPs verschillen
});
