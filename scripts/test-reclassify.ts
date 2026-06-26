// Smoke-test voor lib/v0/server/reclassify.ts.
// Test alleen de pure parser — niet de OpenAI-call.
// Run: npx tsx scripts/test-reclassify.ts

import { strict as assert } from 'node:assert';
import {
  parseReclassifyOutput,
  RECLASSIFY_SYSTEM,
  DOMAIN_ALLOWLIST,
} from '../lib/rag/reclassify-pure';

// Test happy paths
assert.equal(parseReclassifyOutput('GENERAL'), 'general');
assert.equal(parseReclassifyOutput('OFF_TOPIC'), 'off_topic');
assert.equal(parseReclassifyOutput('FALLBACK'), 'fallback');

// Test whitespace tolerance
assert.equal(parseReclassifyOutput('  GENERAL  '), 'general');
assert.equal(parseReclassifyOutput('GENERAL\n'), 'general');

// Test with trailing text
assert.equal(parseReclassifyOutput('GENERAL — algemene kennis'), 'general');
assert.equal(parseReclassifyOutput('OFF_TOPIC.\nUitleg: ...'), 'off_topic');

// Test case insensitivity
assert.equal(parseReclassifyOutput('general'), 'general');
assert.equal(parseReclassifyOutput('off_topic'), 'off_topic');

// Test variant spellings
assert.equal(parseReclassifyOutput('OFFTOPIC'), 'off_topic');
assert.equal(parseReclassifyOutput('OFF-TOPIC'), 'off_topic');

// Test invalid inputs
assert.equal(parseReclassifyOutput(''), null);
assert.equal(parseReclassifyOutput('JA'), null);
assert.equal(parseReclassifyOutput('Misschien wel general'), null);

// Verify DOMAIN_ALLOWLIST is in RECLASSIFY_SYSTEM
for (const term of ['MKB', 'SaaS', 'RAG', 'ChatManta', 'Jorion Solutions']) {
  assert.ok(
    RECLASSIFY_SYSTEM.includes(term),
    `RECLASSIFY_SYSTEM mist de allowlist-term "${term}"`,
  );
}

// Verify DOMAIN_ALLOWLIST has minimum entries
assert.ok(DOMAIN_ALLOWLIST.length >= 8, 'DOMAIN_ALLOWLIST te kort');

console.log('✓ parseReclassifyOutput happy paths (GENERAL, OFF_TOPIC, FALLBACK)');
console.log('✓ whitespace + trailing-text + case-insensitive parsen correct');
console.log('✓ off_topic varianten (OFFTOPIC, OFF-TOPIC) parsen correct');
console.log('✓ ongeldige inputs geven null');
console.log('✓ RECLASSIFY_SYSTEM bevat alle allowlist-termen');
