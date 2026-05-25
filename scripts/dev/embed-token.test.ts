// Standalone assertie-test voor het embed-token. Run met:
//   node --env-file=.env.local --conditions=react-server --import tsx scripts/dev/embed-token.test.ts
// Geen unit-framework in deze repo; dit script throwt bij de eerste mismatch.
import assert from 'node:assert/strict';
import { createEmbedToken, verifyEmbedToken } from '../../lib/v0/server/embed-token.ts';

// Eigen test-secret zodat de test niet van .env.local-inhoud afhangt. De module
// leest de secret lazy (in secret()), dus zetten ná de import is voldoende.
process.env.EMBED_TOKEN_SECRET = 'test-secret-at-least-32-chars-long-xxxxx';

// 1. Round-trip: vers token voor acme-corp verifieert tegen dezelfde slug.
const t = createEmbedToken('acme-corp');
assert.equal(verifyEmbedToken(t, 'acme-corp'), true, 'round-trip moet true zijn');

// 2. Verkeerde slug → false (org-binding).
assert.equal(verifyEmbedToken(t, 'globex-inc'), false, 'verkeerde slug moet false zijn');

// 3. Geknoeid token → false.
assert.equal(verifyEmbedToken(t.slice(0, -2) + 'xx', 'acme-corp'), false, 'tampered sig moet false zijn');

// 4. Verlopen token → false (ttl=-1 sec).
const expired = createEmbedToken('acme-corp', -1);
assert.equal(verifyEmbedToken(expired, 'acme-corp'), false, 'verlopen token moet false zijn');

// 5. Leeg/onzin token → false (geen throw).
assert.equal(verifyEmbedToken('', 'acme-corp'), false);
assert.equal(verifyEmbedToken('geen-punt', 'acme-corp'), false);

console.log('embed-token.test.ts: ALLE ASSERTIES GESLAAGD');
