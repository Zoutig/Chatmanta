import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAQ_ITEMS, faqJsonLd } from '../faq-data';

test('FAQ: 8 vragen, letterlijk volgens COPY.md §12', () => {
  assert.equal(FAQ_ITEMS.length, 8);
  assert.equal(FAQ_ITEMS[0]?.q, 'Verzint de chatbot weleens iets?');
  assert.equal(FAQ_ITEMS[7]?.q, 'Kan ik opzeggen?');
  assert.equal(FAQ_ITEMS[7]?.a, 'Ja, maandelijks opzegbaar. En de eerste 14 dagen probeer je gratis.');
});

test('FAQPage-JSON-LD spiegelt de zichtbare vragen exact', () => {
  const ld = faqJsonLd();
  assert.equal(ld['@type'], 'FAQPage');
  assert.equal(ld.mainEntity.length, FAQ_ITEMS.length);
  ld.mainEntity.forEach((e, i) => {
    assert.equal(e['@type'], 'Question');
    assert.equal(e.name, FAQ_ITEMS[i]?.q);
    assert.equal(e.acceptedAnswer.text, FAQ_ITEMS[i]?.a);
  });
});

test('JSON-LD-serialisatie bevat geen ruwe "<" (XSS-scrub zoals in faq.tsx)', () => {
  const html = JSON.stringify(faqJsonLd()).replace(/</g, '\\u003c');
  assert.ok(!html.includes('<'));
});
