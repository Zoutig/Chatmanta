// Run: node --import tsx --test tests/v0/source-links.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl,
  buildAllowedUrlSet,
  sanitizeSourceLinks,
} from '../../lib/v0/server/source-links';

const REAL = 'https://v0-demo1-website.vercel.app/over-ons';

test('normalizeUrl strips trailing slash + lowercases host, behoudt query', () => {
  assert.equal(normalizeUrl('https://EXAMPLE.com/a/'), 'https://example.com/a');
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com/');
  assert.equal(normalizeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
});

test('normalizeUrl weigert niet-http(s) en onparsebaar', () => {
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUrl('mailto:a@b.nl'), null);
  assert.equal(normalizeUrl('/relatief/pad'), null);
  assert.equal(normalizeUrl('niet eens een url'), null);
});

test('aangeleverde URL blijft een klikbare link', () => {
  const allowed = buildAllowedUrlSet([REAL]);
  const out = sanitizeSourceLinks(`Zie onze [over ons-pagina](${REAL}).`, allowed);
  assert.equal(out, `Zie onze [over ons-pagina](${REAL}).`);
});

test('verzonnen URL wordt teruggestreken naar platte tekst (label blijft)', () => {
  const allowed = buildAllowedUrlSet([REAL]);
  const fake = 'https://v0-demo1-website.vercel.app/diensten/corporate';
  const out = sanitizeSourceLinks(`Bekijk [Diensten](${fake}) voor meer.`, allowed);
  assert.equal(out, 'Bekijk Diensten voor meer.');
});

test('trailing-slash-variant van een toegestane URL matcht alsnog', () => {
  const allowed = buildAllowedUrlSet([REAL]);
  const out = sanitizeSourceLinks(`[over ons](${REAL}/)`, allowed);
  assert.equal(out, `[over ons](${REAL}/)`); // link behouden (originele tekst), want genormaliseerd gelijk
});

test('javascript:-link wordt nooit een link, label blijft (scheme-rejectie)', () => {
  const allowed = buildAllowedUrlSet([REAL]);
  // Paren-vrije javascript-URL: toetst de scheme-weigering zonder de bekende
  // paren-in-url-beperking (zie comment bij MD_LINK_RE).
  const out = sanitizeSourceLinks('Klik [hier](javascript:stealCookies) maar.', allowed);
  assert.equal(out, 'Klik hier maar.');
});

test('numerieke [n]-citaties blijven onaangeroerd (geen link-syntax)', () => {
  const allowed = buildAllowedUrlSet([REAL]);
  const out = sanitizeSourceLinks('Dit klopt [1] en dat ook [2].', allowed);
  assert.equal(out, 'Dit klopt [1] en dat ook [2].');
});

test('lege allowlist → alle links naar platte tekst', () => {
  const out = sanitizeSourceLinks(`[A](${REAL}) en [B](https://x.nl/y).`, new Set());
  assert.equal(out, 'A en B.');
});

test('tekst zonder links blijft identiek (snelle uitweg)', () => {
  const s = 'Gewoon een antwoord zonder enige link erin.';
  assert.equal(sanitizeSourceLinks(s, buildAllowedUrlSet([REAL])), s);
});

test('mix: toegestaan behouden, verzonnen gestript, in één tekst', () => {
  const allowed = buildAllowedUrlSet([REAL]);
  const fake = 'https://v0-demo1-website.vercel.app/portfolio/projecten';
  const out = sanitizeSourceLinks(
    `Meer op [over ons](${REAL}) en [projecten](${fake}).`,
    allowed,
  );
  assert.equal(out, `Meer op [over ons](${REAL}) en projecten.`);
});
