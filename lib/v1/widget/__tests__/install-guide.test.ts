// Run: node --import tsx --test lib/v1/widget/__tests__/install-guide.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINISH_STEPS,
  INSTALL_PLATFORMS,
  NO_SIGNAL_CHECKLIST,
  buildDomainRequestMailto,
  buildEmbedCode,
  buildMailto,
  buildWebbouwerMessage,
} from '../install-guide';

test('embed-code is exact het bestaande contract', () => {
  assert.equal(
    buildEmbedCode('https://www.chatmanta.nl', 'acme'),
    '<script src="https://www.chatmanta.nl/widget-v1.js" data-org="acme" defer></script>',
  );
});

test('alle gevraagde platforms staan erin, met unieke ids en stappen', () => {
  const ids = INSTALL_PLATFORMS.map((p) => p.id);
  for (const id of ['wordpress', 'drupal', 'wix', 'squarespace', 'shopify', 'webflow', 'joomla', 'gtm', 'other']) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length);
  for (const p of INSTALL_PLATFORMS) assert.ok(p.steps.length > 0, p.id);
});

test('WordPress wijst naar WPCode en waarschuwt tegen de thema-editor', () => {
  const wp = INSTALL_PLATFORMS.find((p) => p.id === 'wordpress')!;
  assert.match(wp.steps.join(' '), /WPCode/);
  assert.match(wp.note ?? '', /thema-editor/);
});

test('GTM: DOM Ready / Window Loaded, niet de standaard Page View', () => {
  const gtm = INSTALL_PLATFORMS.find((p) => p.id === 'gtm')!.steps.join(' ');
  assert.match(gtm, /DOM Ready/);
  assert.match(gtm, /Window Loaded/);
  assert.match(gtm, /niet de standaardtrigger/);
});

test('elke instructie eindigt met cache legen en testen', () => {
  assert.match(FINISH_STEPS[0], /cache/i);
  assert.match(FINISH_STEPS[FINISH_STEPS.length - 1], /^Test/);
});

test('geen-signaal-checklist dekt de bekende oorzaken', () => {
  const all = NO_SIGNAL_CHECKLIST.join(' ');
  for (const w of ['elke pagina', 'data-org', 'cache', 'Toegestane domeinen', 'cookiebanner']) assert.ok(all.includes(w), w);
});

test('webbouwer-tekst bevat de code, plek, cache, CSP en domeinen', () => {
  const code = buildEmbedCode('https://www.chatmanta.nl', 'acme');
  const msg = buildWebbouwerMessage({ code, origin: 'https://www.chatmanta.nl', allowedDomains: ['klant.nl', ''] });
  assert.ok(msg.includes(code));
  assert.match(msg, /<\/body>/);
  assert.match(msg, /cache/);
  assert.match(msg, /script-src en frame-src/);
  assert.match(msg, /klant\.nl\./);
  const noDomains = buildWebbouwerMessage({ code, origin: 'https://www.chatmanta.nl', allowedDomains: [] });
  assert.doesNotMatch(noDomains, /De chatbot werkt op/);
});

test('mailto codeert onderwerp en body', () => {
  const href = buildMailto({ subject: 'A & B', body: 'regel 1\n<script>' });
  assert.equal(href, 'mailto:?subject=A%20%26%20B&body=regel%201%0A%3Cscript%3E');
});

test('domein-aanvraag gaat naar het supportadres met slug', () => {
  const href = buildDomainRequestMailto({ supportEmail: 'info@example.com', slug: 'acme', allowedDomains: [] });
  assert.ok(href.startsWith('mailto:info@example.com?subject='));
  const body = decodeURIComponent(href.split('&body=')[1]);
  assert.match(body, /Organisatie: acme/);
  assert.match(body, /nog niets ingesteld/);
});
