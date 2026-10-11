import { test } from 'node:test';
import assert from 'node:assert/strict';
import { embedModelFor, isIndexVersion, ragOverridesFor } from '../index-version';
import { chunkForIndex } from '../ingest';
import { chunkParentsAndChildren } from '../chunker';

test('v1 = ongewijzigd: geen overrides, 3-small', () => {
  assert.deepEqual(ragOverridesFor('v1'), {});
  assert.equal(embedModelFor('v1'), 'text-embedding-3-small');
});

test('v2 = 3-large + context tot 18k tekens', () => {
  const o = ragOverridesFor('v2');
  assert.equal(embedModelFor('v2'), 'text-embedding-3-large');
  assert.equal(o.embeddingModel, 'text-embedding-3-large');
  assert.equal(o.maxContextChars, 18000);
  assert.equal(o.retrievalTopK, 60);
  assert.equal(o.finalContextMaxChunks, 60);
});

test('isIndexVersion is strikt', () => {
  assert.ok(isIndexVersion('v1') && isIndexVersion('v2'));
  assert.ok(!isIndexVersion('v3') && !isIndexVersion(null) && !isIndexVersion(undefined));
});

test('chunkForIndex v1 = byte-identiek aan de oude knipper, vector = kale content', () => {
  const text = 'Lorem ipsum dolor sit amet. '.repeat(400);
  const old = chunkParentsAndChildren(text);
  const r = chunkForIndex(text, 'x.md', {}, 'v1');
  assert.deepEqual(r.parents, old.parents);
  assert.deepEqual(r.children.map(({ parentIndex, content }) => ({ parentIndex, content })), old.children);
  assert.ok(r.children.every((c) => c.embedText === c.content));
});

test('chunkForIndex v2: Q&A-items zonder titel-kruimel, pagina met H1 wel', () => {
  const qa = chunkForIndex('Vraag: Open op zondag?\n\nAntwoord: Nee.', 'qa-open-op-zondag.txt', { origin: 'manual_qa' }, 'v2');
  assert.equal(qa.children[0].embedText, qa.children[0].content);
  const page = chunkForIndex('# Contact\n\nBel ons op 010-1234567.', 'contact', { source_title: 'Contact | Bedrijf' }, 'v2');
  assert.ok(page.children[0].embedText.startsWith('Contact\n\n'));
  const noH1 = chunkForIndex('Bel ons op 010-1234567.', 'https://x.nl/contact', { source_title: 'Contact | Bedrijf' }, 'v2');
  assert.ok(noH1.children[0].embedText.startsWith('Contact | Bedrijf\n\n'));
});
