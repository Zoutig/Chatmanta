// Assertie-set voor het V1 embed-token (HMAC, fail-closed). Draait mee via
// `npm run test:unit` in de react-server-pass — embed-token importeert `server-only`.
// Los draaien:
//   node --conditions=react-server --import tsx --test lib/v1/widget/__tests__/embed-token.test.ts
//
// De module leest de secret lazy (in secret(), per aanroep), dus het volstaat de
// env vóór de eerste aanroep te zetten — ná de gehoiste import is prima.

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createEmbedToken, verifyEmbedToken } from '../embed-token';

process.env.EMBED_TOKEN_SECRET = 'test-secret-16chars-minimum';

test('round-trip: vers token verifieert tegen dezelfde slug', () => {
  assert.equal(verifyEmbedToken(createEmbedToken('acme'), 'acme'), true);
});

test('verkeerde slug → false (org-binding)', () => {
  assert.equal(verifyEmbedToken(createEmbedToken('acme'), 'globex'), false);
});

test('geknoeid token (laatste char gemuteerd) → false', () => {
  const t = createEmbedToken('acme');
  const last = t.at(-1);
  const tampered = t.slice(0, -1) + (last === 'A' ? 'B' : 'A');
  assert.equal(verifyEmbedToken(tampered, 'acme'), false);
});

test('verlopen token → false', () => {
  assert.equal(verifyEmbedToken(createEmbedToken('acme', -10), 'acme'), false);
});

test('lege/onzin-input → false (geen throw)', () => {
  assert.equal(verifyEmbedToken(null, 'acme'), false);
  assert.equal(verifyEmbedToken('', 'acme'), false);
  assert.equal(verifyEmbedToken('geen-punt', 'acme'), false);
});

test('zonder secret: verify → false, create → throw (fail-closed)', () => {
  const saved = process.env.EMBED_TOKEN_SECRET;
  delete process.env.EMBED_TOKEN_SECRET;
  try {
    assert.equal(verifyEmbedToken(createEmbedTokenWithSecret(saved!, 'acme'), 'acme'), false);
    assert.throws(() => createEmbedToken('acme'));
  } finally {
    process.env.EMBED_TOKEN_SECRET = saved;
  }
});

// Maakt een token mét secret zodat we een geldige wire-vorm hebben om vervolgens
// zónder secret te verifiëren (verify moet dan alsnog false geven — niet throwen).
function createEmbedTokenWithSecret(secret: string, slug: string): string {
  const prev = process.env.EMBED_TOKEN_SECRET;
  process.env.EMBED_TOKEN_SECRET = secret;
  try {
    return createEmbedToken(slug);
  } finally {
    if (prev === undefined) delete process.env.EMBED_TOKEN_SECRET;
    else process.env.EMBED_TOKEN_SECRET = prev;
  }
}
