// Run: node --import tsx --test tests/v0/source-links.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUrl,
  buildAllowedUrlSet,
  sanitizeSourceLinks,
  stripMarkdownLinks,
} from '../../lib/rag/source-links';

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

test('markdown-link met titel: verzonnen → label, toegestaan → canoniek (zonder titel)', () => {
  const allowed = buildAllowedUrlSet([REAL]);
  const fake = 'https://v0-demo1-website.vercel.app/diensten/corporate';
  assert.equal(
    sanitizeSourceLinks(`Zie [Diensten](${fake} "Onze diensten").`, allowed),
    'Zie Diensten.',
  );
  assert.equal(
    sanitizeSourceLinks(`Zie [over ons](${REAL} "Over ons").`, allowed),
    `Zie [over ons](${REAL}).`, // titel weggestript → renderer-vriendelijk
  );
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

// --- stripMarkdownLinks: bron-link-URLs uit verify-input halen --------------

test('stripMarkdownLinks reduceert link tot label, omringende tekst blijft', () => {
  assert.equal(
    stripMarkdownLinks(`Bekijk [Onze Diensten](${REAL}) voor meer.`),
    'Bekijk Onze Diensten voor meer.',
  );
});

test('stripMarkdownLinks verwijdert óók de URL bij een link-met-titel', () => {
  assert.equal(
    stripMarkdownLinks(`Zie [info](${REAL} "Titel").`),
    'Zie info.',
  );
});

test('stripMarkdownLinks behoudt proza-feiten (prijs/getal in label of tekst)', () => {
  // Het hele punt: de URL (geen content-feit) verdwijnt, maar een prijs in de
  // proza-tekst blijft staan en wordt dus nog steeds hard-fact-geverifieerd.
  assert.equal(
    stripMarkdownLinks(`Een pakket kost €50 per persoon. Zie [prijzen](${REAL}).`),
    'Een pakket kost €50 per persoon. Zie prijzen.',
  );
});

test('stripMarkdownLinks laat [n]-citaties en linkloze tekst ongemoeid', () => {
  assert.equal(stripMarkdownLinks('Dit klopt [1] en dat ook [2].'), 'Dit klopt [1] en dat ook [2].');
  const s = 'Gewoon een antwoord zonder enige link.';
  assert.equal(stripMarkdownLinks(s), s);
});

test('stripMarkdownLinks verwerkt meerdere links in één tekst', () => {
  const other = 'https://v0-demo1-website.vercel.app/team';
  assert.equal(
    stripMarkdownLinks(`Zie [diensten](${REAL}) en [team](${other}).`),
    'Zie diensten en team.',
  );
});

test('single-quoted titel wordt óók herkend (sanitize + strip)', () => {
  const allowed = buildAllowedUrlSet([REAL]);
  // sanitizeSourceLinks: toegestaan → canoniek zonder titel.
  assert.equal(
    sanitizeSourceLinks(`Zie [over ons](${REAL} 'Over ons').`, allowed),
    `Zie [over ons](${REAL}).`,
  );
  // stripMarkdownLinks: URL (+ single-quoted titel) helemaal weg, label blijft.
  assert.equal(
    stripMarkdownLinks(`Zie [over ons](${REAL} 'Over ons').`),
    'Zie over ons.',
  );
});
