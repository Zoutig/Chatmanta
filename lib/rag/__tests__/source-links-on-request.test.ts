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
  const out = sanitizeLinksOnRequest(`[A](${PDF}) en ${PDF}`, new Map());
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


// --- Regressies uit de adversarial review (2026-10-14) ----------------------

test('geneste links kunnen geen nieuwe, ongecontroleerde link vormen', () => {
  assert.equal(sanitizeLinksOnRequest('[[x](https://evil.com)](https://evil.com)', allowed()), 'x');
  assert.equal(
    sanitizeLinksOnRequest('[[Handleiding](https://evil.com/a)](https://evil.com/phish)', allowed()),
    'Handleiding',
  );
  // Ook genest rond een TOEGESTANE link: buitenste (vreemde) link wint nooit.
  const out = sanitizeLinksOnRequest(`[[Ace](${PDF})](https://evil.com)`, allowed());
  assert.doesNotMatch(out, /evil\.com/);
});

test('ongebalanceerde haakjes: renderer-link naar vreemde host wordt platte tekst', () => {
  assert.equal(sanitizeLinksOnRequest('[klik](https://evil.com/a(b)', allowed()), 'klik');
  assert.equal(sanitizeLinksOnRequest('- [Handleiding](https://evil.com/x(y)', allowed()), '- Handleiding');
});

test('uitvoer gebruikt de canonieke allowlist-URL, niet de spelling van het model', () => {
  const out = sanitizeLinksOnRequest(`[Ace](${PDF.replace('www.example-shop.nl', 'WWW.EXAMPLE-SHOP.NL')}#p2)`, allowed());
  assert.equal(out, `[Ace](${PDF})`);
});

test('userinfo in de URL wordt nooit geaccepteerd', () => {
  assert.equal(sanitizeLinksOnRequest(`[x](https://evil@www.example-shop.nl/fuji-frenic-ace)`, allowed()), 'x');
});

test('extractSameHostLinks: geen redirect via het pad of dubbel-gecodeerde query', () => {
  const text = `[a](${SITE}/out/https://evil.com) [b](${SITE}/r?u=https%253A%252F%252Fevil.com) [c](${SITE}/go//evil.com) [d](${SITE}/files/a.pdf)`;
  assert.deepEqual(extractSameHostLinks(text, PAGE), [`${SITE}/files/a.pdf`]);
});

test('"[tekst](geen url)" blijft gewone tekst', () => {
  const s = 'Zie [optioneel](zie onder) en a[0](1).';
  assert.equal(sanitizeLinksOnRequest(s, allowed()), s);
});

test('opschonen alleen rond een verwijderde URL, rest van de tekst onaangeroerd', () => {
  assert.equal(
    sanitizeLinksOnRequest('Kosten : zie https://evil.com, of bel  ons.', allowed()),
    'Kosten : zie, of bel  ons.',
  );
  assert.equal(sanitizeLinksOnRequest('Wacht ... https://evil.com klaar', allowed()), 'Wacht ... klaar');
});

test('twee aaneengeplakte kale URLs: toegestane blijft, vreemde gaat weg', () => {
  const out = sanitizeLinksOnRequest(`${PDF})(https://evil.com`, allowed());
  assert.equal(out, `[Fuji-FRENIC-Ace-User-Manual-English.pdf](${PDF}))(`);
});
