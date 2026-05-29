import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeFingerprint, normalize, topFrameOf } from '../fingerprint';

test('normalize collapses ids/uuids/numbers/quotes', () => {
  assert.equal(normalize('user 4821 not found'), 'user #n not found');
  assert.equal(normalize('id chm_a1b2c3d4 failed'), 'id #id failed');
  assert.equal(normalize('row 550e8400-e29b-41d4-a716-446655440000'), 'row #uuid');
  assert.equal(normalize('msg "secret value"'), 'msg #s');
});

test('computeFingerprint collapses message-getalvarianten tot één hash', () => {
  const a = computeFingerprint({ surface: 'chatbot', code: 'INTERNAL', organizationId: 'org1', message: 'user 1 not found' });
  const b = computeFingerprint({ surface: 'chatbot', code: 'INTERNAL', organizationId: 'org1', message: 'user 9999 not found' });
  assert.equal(a, b);
});

test('computeFingerprint verschilt per org en per code', () => {
  const base = { surface: 'chatbot' as const, code: 'INTERNAL', message: 'boom' };
  assert.notEqual(
    computeFingerprint({ ...base, organizationId: 'a' }),
    computeFingerprint({ ...base, organizationId: 'b' }),
  );
  assert.notEqual(
    computeFingerprint({ ...base, organizationId: 'a' }),
    computeFingerprint({ ...base, code: 'LLM_TIMEOUT', organizationId: 'a' }),
  );
});

test('topFrameOf strips abs pad en :regel:kolom', () => {
  const stack =
    'Error: boom\n    at doThing (C:\\Users\\x\\app\\lib\\rag.ts:123:45)\n    at next (D:\\y\\route.ts:1:1)';
  const tf = topFrameOf(stack);
  assert.match(tf, /rag\.ts/);
  assert.doesNotMatch(tf, /123:45/);
  assert.doesNotMatch(tf, /Users/);
});
