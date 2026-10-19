import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAQ_ITEMS, faqJsonLd } from '../faq-data';

test('FAQ: 6 vragen, letterlijk volgens COPY.md §12', () => {
  assert.equal(FAQ_ITEMS.length, 6);
  assert.equal(FAQ_ITEMS[0]?.q, 'Heb ik technische kennis nodig?');
  assert.equal(FAQ_ITEMS[5]?.q, 'Kan ik opzeggen?');
  assert.equal(FAQ_ITEMS[5]?.a, 'Ja, maandelijks opzegbaar. En de eerste 14 dagen probeer je gratis.');
});

test('FAQ belooft geen bronlinks en geen bot die zelf om gegevens vraagt (V1 doet dat niet)', () => {
  const all = FAQ_ITEMS.map((i) => `${i.q} ${i.a}`).join(' ').toLowerCase();
  assert.ok(!/\bbron(link|vermelding)?\b/.test(all), 'geen bron-belofte');
  assert.ok(!all.includes('vraagt de chatbot om'), 'contact loopt via de knop, niet via de bot');
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
