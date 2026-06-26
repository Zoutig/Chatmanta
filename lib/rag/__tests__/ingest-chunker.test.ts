import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkSliding, chunkParentsAndChildren } from '../chunker';

test('chunkSliding: lege/whitespace input → []', () => {
  assert.deepEqual(chunkSliding('   ', 100, 10), []);
});

test('chunkSliding: korte tekst → één getrimde chunk', () => {
  assert.deepEqual(chunkSliding('  hallo  ', 100, 10), ['hallo']);
});

test('chunkSliding: lange tekst → meerdere chunks, elk ≤ size', () => {
  const text = 'x'.repeat(250);
  const chunks = chunkSliding(text, 100, 20); // stride 80 → starts 0,80,160,240
  assert.equal(chunks.length, 4);
  assert.ok(chunks.every((c) => c.length <= 100));
});

test('chunkParentsAndChildren: children dragen een geldige parentIndex', () => {
  const text = 'a'.repeat(7000); // 3200/400 → stride 2800 → >1 parent
  const { parents, children } = chunkParentsAndChildren(text);
  assert.ok(parents.length >= 2, 'verwacht meerdere parents');
  assert.ok(children.every((c) => c.parentIndex >= 0 && c.parentIndex < parents.length));
  assert.ok(children.filter((c) => c.parentIndex === 0).length >= 1);
});

test('chunkParentsAndChildren: lege input → geen parents/children', () => {
  const { parents, children } = chunkParentsAndChildren('   ');
  assert.deepEqual(parents, []);
  assert.deepEqual(children, []);
});
