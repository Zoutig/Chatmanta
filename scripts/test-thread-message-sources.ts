// Self-check voor de pure bron-helpers (WP4.3). Geen framework.
// Draai: npx tsx scripts/test-thread-message-sources.ts
import assert from 'node:assert/strict';
import {
  toThreadMessageSources,
  parseThreadMessageSources,
} from '../lib/v1/conversations/sources';

// --- toThreadMessageSources: sorteert desc, url alleen indien aanwezig, similarity afgerond.
{
  const mapped = toThreadMessageSources([
    { filename: 'a.pdf', similarity: 0.4123 },
    { filename: null, url: 'https://x/y', similarity: 0.9876 },
    { filename: '  ', similarity: 0.5 },
  ]);
  assert.equal(mapped.length, 3);
  // Hoogste similarity eerst; lege/null filename → 'Bron'; url behouden; afgerond op 3 dec.
  assert.deepEqual(mapped[0], { title: 'Bron', url: 'https://x/y', similarity: 0.988 });
  assert.equal(mapped[1].title, 'Bron'); // '  '.trim() || 'Bron'
  // Laagste komt laatst; geen url → geen url-key.
  assert.equal(mapped[2].title, 'a.pdf');
  assert.equal(mapped[2].similarity, 0.412);
  assert.ok(!('url' in mapped[2]));
}

// --- Cap op 6.
{
  const many = Array.from({ length: 9 }, (_, i) => ({ filename: `f${i}`, similarity: i / 10 }));
  assert.equal(toThreadMessageSources(many).length, 6);
  // De sterkste (hoogste similarity) overleven de cap.
  assert.equal(toThreadMessageSources(many)[0].title, 'f8');
}

// --- parseThreadMessageSources: defensief.
assert.equal(parseThreadMessageSources(null), null);
assert.equal(parseThreadMessageSources([]), null);
assert.equal(parseThreadMessageSources('nope'), null);
assert.equal(parseThreadMessageSources([{ title: 'x' }]), null); // similarity ontbreekt → gefilterd → null
{
  const parsed = parseThreadMessageSources([
    { title: 'faq.pdf', url: 'https://z', similarity: 0.8 },
    { junk: true }, // ongeldig → overgeslagen
    { title: 'p2', similarity: 0.6 },
  ]);
  assert.deepEqual(parsed, [
    { title: 'faq.pdf', url: 'https://z', similarity: 0.8 },
    { title: 'p2', similarity: 0.6 },
  ]);
}

console.log('OK — thread-message-sources helpers');
