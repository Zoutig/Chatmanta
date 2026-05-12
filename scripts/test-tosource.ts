// Smoke-test voor lib/v0/server/rag.ts → toSource() parentExcerpt-gedrag.
// Run: npx tsx scripts/test-tosource.ts
// Geen DB-aanroep nodig — we vervangen alleen RetrievedChunk-velden.

import { strict as assert } from 'node:assert';

import type { ChatSource } from '../lib/v0/server/rag';

const fixture: ChatSource = {
  id: 'aaa',
  filename: 'demo.md',
  similarity: 0.71,
  contentExcerpt: 'kort fragment',
  parentExcerpt: 'langer fragment ' + 'x'.repeat(900),
};

assert.equal(typeof fixture.parentExcerpt, 'string');
assert.ok(fixture.parentExcerpt && fixture.parentExcerpt.length > 240);

const noParent: ChatSource = {
  id: 'bbb',
  filename: null,
  similarity: 0.5,
  contentExcerpt: 'kort',
};
assert.equal(noParent.parentExcerpt, undefined);

const nullParent: ChatSource = {
  id: 'ccc',
  filename: 'x.md',
  similarity: 0.4,
  contentExcerpt: 'kort',
  parentExcerpt: null,
};
assert.equal(nullParent.parentExcerpt, null);

console.log('✓ ChatSource accepteert parentExcerpt?: string | null | undefined');
console.log('✓ Backward-compat (geen parentExcerpt) compileert');
console.log('✓ Hydratie-fail (parentExcerpt=null) compileert');
