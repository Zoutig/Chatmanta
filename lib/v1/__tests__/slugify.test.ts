import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, withSuffix } from '../slugify';

// De organizations.slug CHECK (0001): lowercase alnum + interior hyphens,
// start/eind alfanumeriek, lengte 2..64.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
function valid(s: string) {
  return SLUG_RE.test(s) && s.length >= 2 && s.length <= 64;
}

test('slugify produceert een geldige slug voor gewone namen', () => {
  assert.equal(slugify('Manta Bakkerij'), 'manta-bakkerij');
  assert.equal(slugify('Jorion Solutions B.V.'), 'jorion-solutions-b-v');
  assert.ok(valid(slugify('Manta Bakkerij')));
});

test('slugify strips accenten en rare tekens', () => {
  assert.equal(slugify('Café Crème'), 'cafe-creme');
  assert.equal(slugify('  Acme   &   Co  '), 'acme-co');
  assert.ok(valid(slugify('Café Crème')));
});

test('slugify voldoet aan de min-lengte (floor naar "org")', () => {
  assert.equal(slugify('A'), 'org');
  assert.equal(slugify('!'), 'org');
  assert.equal(slugify(''), 'org');
  assert.ok(valid(slugify('A')));
});

test('slugify eindigt nooit op een hyphen en blijft <=56', () => {
  const long = 'x'.repeat(200);
  const s = slugify(long);
  assert.ok(s.length <= 56);
  assert.ok(!s.endsWith('-'));
  assert.ok(valid(s));
});

test('withSuffix blijft geldig en eindigt niet op hyphen', () => {
  assert.equal(withSuffix('acme', 1), 'acme');
  assert.equal(withSuffix('acme', 2), 'acme-2');
  const s = withSuffix('x'.repeat(56), 12);
  assert.ok(s.length <= 64);
  assert.ok(!s.endsWith('-'));
  assert.ok(valid(s));
});
