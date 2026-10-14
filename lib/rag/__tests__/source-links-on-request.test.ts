// Run: node --import tsx --test lib/rag/__tests__/source-links-on-request.test.ts
// Linkknoppen-modus (sourceLinksMode 'on-request'): allowlist uit pagina-inhoud,
// robuuste URL-vergelijking, kale URL's en canonieke uitvoer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLinkAllowlist,
  canonicalLinkUrl,
  extractSameHostLinks,
  linkMatchKey,
  sanitizeLinksOnRequest,
  stripMarkdownLinks,
} from '../source-links';

const SITE = 'https://www.example-shop.nl';
const PAGE = `${SITE}/fuji-frenic-ace`;
const PDF = `${SITE}/sites/default/files/product-information/Fuji-FRENIC-Ace-User-Manual-English.pdf`;
// Zoals Firecrawl hem levert: haakjes en spaties gecodeerd.
const PDF_PARENS = `${SITE}/sites/default/files/product-information/Fuji-FRENIC-Mini-%28C2%29-User-manual-English.pdf`;
const PDF_SPACE = `${SITE}/sites/default/files/product-information/Fuji-FRENIC-Lift%20LM2-Catalogues-English.pdf`;

const CHUNK = [
  '# Fuji FRENIC Ace',
  'Product information',
  `[Fuji-FRENIC-Ace-User-Manual-English.pdf](${PDF})`,
  `[Fuji-FRENIC-Mini-(C2)-User-manual-English.pdf](${PDF_PARENS})`,
  `[Fuji-FRENIC-Lift LM2-Catalogues-English.pdf](${PDF_SPACE})`,
  '[Externe leverancier](https://www.fujielectric.com/manuals)',
  '[Contact](https://example-shop.nl/contact)',
].join('\n');

const allowed = () => buildLinkAllowlist([PAGE, ...extractSameHostLinks(CHUNK, PAGE)]);

test('extractSameHostLinks: alleen links op hetzelfde domein (www. genegeerd)', () => {
  const links = extractSameHostLinks(CHUNK, PAGE);
  assert.deepEqual(links, [PDF, PDF_PARENS, PDF_SPACE, 'https://example-shop.nl/contact']);
});

test('extractSameHostLinks: geen open redirect via een query met een URL', () => {
  const text = `[a](${SITE}/redirect?url=https://evil.example) [b](${SITE}/r?to=%2F%2Fevil.example) [c](${SITE}/p?id=3)`;
  assert.deepEqual(extractSameHostLinks(text, PAGE), [`${SITE}/p?id=3`]);
});

test('extractSameHostLinks: ongeldige bron-URL → niets', () => {
  assert.deepEqual(extractSameHostLinks(CHUNK, 'geen url'), []);
});

test('linkMatchKey: gecodeerd en ongecodeerd zijn dezelfde URL', () => {
  assert.equal(linkMatchKey(PDF_PARENS), linkMatchKey(PDF_PARENS.replace('%28', '(').replace('%29', ')')));
  assert.equal(linkMatchKey(PDF_SPACE), linkMatchKey(PDF_SPACE.replace('%20', ' ')));
  assert.equal(linkMatchKey('javascript:alert(1)'), null);
});

test('canonicalLinkUrl: geen spaties of haakjes in de uitvoer', () => {
  const c = canonicalLinkUrl(`${SITE}/files/Mini-(C2) manual.pdf#p3`);
  assert.equal(c, 'https://www.example-shop.nl/files/Mini-%28C2%29%20manual.pdf');
});

test('toegestane PDF-link blijft klikbaar (canoniek)', () => {
  const out = sanitizeLinksOnRequest(`Hier is hij:\n- [User Manual (EN)](${PDF})`, allowed());
  assert.equal(out, `Hier is hij:\n- [User Manual (EN)](${PDF})`);
});

test('model decodeert haakjes/spaties → nog steeds herkend, canoniek terug', () => {
  const decoded = PDF_PARENS.replace('%28', '(').replace('%29', ')');
  const out = sanitizeLinksOnRequest(`- [Mini C2 manual](${decoded})`, allowed());
  assert.equal(out, `- [Mini C2 manual](${PDF_PARENS})`);
  const spaced = PDF_SPACE.replace('%20', ' ');
  assert.equal(sanitizeLinksOnRequest(`[LM2](${spaced})`, allowed()), `[LM2](${PDF_SPACE})`);
});

test('verzonnen URL op het eigen domein → alleen label', () => {
  const out = sanitizeLinksOnRequest(`Zie [Mega manual](${SITE}/files/Mega-Manual.pdf).`, allowed());
  assert.equal(out, 'Zie Mega manual.');
});

test('link naar ander domein (ook al staat hij op de pagina) → alleen label', () => {
  const out = sanitizeLinksOnRequest('Zie [Fuji](https://www.fujielectric.com/manuals).', allowed());
  assert.equal(out, 'Zie Fuji.');
});

test('javascript:/data:-link → alleen label', () => {
  assert.equal(sanitizeLinksOnRequest('[klik](javascript:alert(1))', allowed()), 'klik');
  assert.equal(sanitizeLinksOnRequest('[klik](data:text/html,x)', allowed()), 'klik');
});

test('kale toegestane URL → link met bestandsnaam als label', () => {
  const out = sanitizeLinksOnRequest(`Download: ${PDF}.`, allowed());
  assert.equal(out, `Download: [Fuji-FRENIC-Ace-User-Manual-English.pdf](${PDF}).`);
});

test('kale verzonnen URL → verwijderd, zin blijft netjes', () => {
  const out = sanitizeLinksOnRequest('Kijk op https://evil.example/x of bel ons.', allowed());
  assert.equal(out, 'Kijk op of bel ons.');
});

test('URL in het label van een afgewezen link verdwijnt ook', () => {
  const out = sanitizeLinksOnRequest('[https://evil.example/x](https://evil.example/x)', allowed());
  assert.equal(out, '');
});

test('lege allowlist → geen link of URL overleeft', () => {
  const out = sanitizeLinksOnRequest(`[A](${PDF}) en ${PDF}`, new Set());
  assert.equal(out, 'A en');
});

test('tekst zonder links/URLs blijft identiek (ook dubbele spaties)', () => {
  const s = 'Bel ons  gerust : wij helpen graag.';
  assert.equal(sanitizeLinksOnRequest(s, allowed()), s);
});

test('[n]-citaties en losse haken blijven staan', () => {
  const s = 'Dit klopt [1] en [zie boven] (echt).';
  assert.equal(sanitizeLinksOnRequest(s, allowed()), s);
});

test('link met titel → canoniek zonder titel', () => {
  assert.equal(sanitizeLinksOnRequest(`[Ace](${PDF} "Manual")`, allowed()), `[Ace](${PDF})`);
});

test('uitvoer is compatibel met stripMarkdownLinks (verify-pad)', () => {
  const out = sanitizeLinksOnRequest(`- [Mini](${PDF_PARENS.replace('%28', '(').replace('%29', ')')})`, allowed());
  assert.equal(stripMarkdownLinks(out), '- Mini');
});

test('link tussen haakjes in een zin', () => {
  const out = sanitizeLinksOnRequest(`De handleiding ([Ace manual](${PDF})) staat online.`, allowed());
  assert.equal(out, `De handleiding ([Ace manual](${PDF})) staat online.`);
});
