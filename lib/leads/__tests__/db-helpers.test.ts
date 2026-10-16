import { test } from 'node:test';
import assert from 'node:assert/strict';
import { veiligeZoekterm, isUuid } from '../server/db';

test('veiligeZoekterm haalt filter-tekens weg', () => {
  assert.equal(veiligeZoekterm('jansen,bouw'), 'jansen bouw');
  assert.equal(veiligeZoekterm(`a(b)c%d*e${String.fromCharCode(92)}f`), 'a b c d e f');
  assert.equal(veiligeZoekterm('  x.y)or(id.eq.1  '), 'x.y or id.eq.1');
});

test('veiligeZoekterm kapt af op 80 tekens', () => {
  assert.equal(veiligeZoekterm('a'.repeat(200)).length, 80);
});

test('isUuid accepteert alleen uuid-formaat', () => {
  assert.equal(isUuid('00000000-0000-0000-0000-000000000000'), true);
  assert.equal(isUuid('3f2b8c1e-9d4a-4b6e-8c7a-1a2b3c4d5e6f'), true);
  assert.equal(isUuid('abc'), false);
  assert.equal(isUuid('id.eq.1,status.eq.open'), false);
  assert.equal(isUuid(null), false);
  assert.equal(isUuid(123), false);
});
