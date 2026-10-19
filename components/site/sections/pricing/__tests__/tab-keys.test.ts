import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tabIndexForKey } from '../tab-keys';

test('pijltjes wisselen met omloop', () => {
  assert.equal(tabIndexForKey('ArrowRight', 0, 3), 1);
  assert.equal(tabIndexForKey('ArrowRight', 2, 3), 0);
  assert.equal(tabIndexForKey('ArrowLeft', 0, 3), 2);
  assert.equal(tabIndexForKey('ArrowLeft', 1, 3), 0);
});

test('Home/End springen naar eerste/laatste', () => {
  assert.equal(tabIndexForKey('Home', 2, 3), 0);
  assert.equal(tabIndexForKey('End', 0, 3), 2);
});

test('andere toetsen en lege lijst doen niets', () => {
  assert.equal(tabIndexForKey('Enter', 1, 3), null);
  assert.equal(tabIndexForKey('ArrowDown', 1, 3), null);
  assert.equal(tabIndexForKey('ArrowRight', 0, 0), null);
});
