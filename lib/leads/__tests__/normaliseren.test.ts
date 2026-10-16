import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseerDomein,
  schoneWebsiteUrl,
  normaliseerTelefoon,
  toonTelefoon,
  isGeldigEmail,
  telLink,
} from '../normaliseren';

test('normaliseerDomein: kleine letters, zonder www, pad, query of poort', () => {
  assert.equal(normaliseerDomein('https://www.Jansen-Bouw.nl/contact?utm_source=x'), 'jansen-bouw.nl');
  assert.equal(normaliseerDomein('jansen-bouw.nl'), 'jansen-bouw.nl');
  assert.equal(normaliseerDomein('http://jansen-bouw.nl:8080/'), 'jansen-bouw.nl');
  assert.equal(normaliseerDomein('  '), null);
  assert.equal(normaliseerDomein(null), null);
  assert.equal(normaliseerDomein('geen domein'), null);
});

test('schoneWebsiteUrl: haalt query en hash weg, houdt host en pad', () => {
  assert.equal(
    schoneWebsiteUrl('http://www.jansen-bouw.nl/?utm_source=google&utm_medium=cpc#top'),
    'http://www.jansen-bouw.nl/',
  );
  assert.equal(schoneWebsiteUrl('jansen-bouw.nl/vestiging/ede'), 'https://jansen-bouw.nl/vestiging/ede');
  assert.equal(schoneWebsiteUrl(''), null);
});

test('normaliseerTelefoon: NL-nummers naar +31', () => {
  assert.equal(normaliseerTelefoon('06 12345678'), '+31612345678');
  assert.equal(normaliseerTelefoon('06-12 34 56 78'), '+31612345678');
  assert.equal(normaliseerTelefoon('+31 6 12345678'), '+31612345678');
  assert.equal(normaliseerTelefoon('0031612345678'), '+31612345678');
  assert.equal(normaliseerTelefoon('026 123 4567'), '+31261234567');
  assert.equal(normaliseerTelefoon('(026) 1234567'), '+31261234567');
});

test('normaliseerTelefoon: onzin en te kort wordt null, buitenlands blijft', () => {
  assert.equal(normaliseerTelefoon('1234'), null);
  assert.equal(normaliseerTelefoon('bel ons'), null);
  assert.equal(normaliseerTelefoon(''), null);
  assert.equal(normaliseerTelefoon('+49 30 1234567'), '+49301234567');
});

test('toonTelefoon: leesbaar en tel-link', () => {
  assert.equal(toonTelefoon('+31612345678'), '06 12 34 56 78');
  assert.equal(toonTelefoon('+31261234567'), '026 123 4567');
  assert.equal(toonTelefoon('+49301234567'), '+49301234567');
  assert.equal(telLink('+31612345678'), 'tel:+31612345678');
});

test('isGeldigEmail', () => {
  assert.equal(isGeldigEmail('jan@jansen-bouw.nl'), true);
  assert.equal(isGeldigEmail('info@jansen-bouw.co.uk'), true);
  assert.equal(isGeldigEmail('0612345678'), false);
  assert.equal(isGeldigEmail(''), false);
  assert.equal(isGeldigEmail('jan@jansen'), false);
  assert.equal(isGeldigEmail('jan @jansen.nl'), false);
  assert.equal(isGeldigEmail('afbeelding@2x.png'), false);
});
