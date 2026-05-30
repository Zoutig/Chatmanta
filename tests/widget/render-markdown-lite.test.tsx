// Run: node --import tsx --test tests/widget/render-markdown-lite.test.tsx
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdownLite } from '../../lib/widget/render-markdown-lite';

function html(input: string): string {
  return renderToStaticMarkup(renderMarkdownLite(input) as React.ReactElement);
}

test('plain text passes through unchanged', () => {
  assert.match(html('Hallo wereld'), /Hallo wereld/);
  assert.doesNotMatch(html('Hallo wereld'), /<ul/);
});

test('**bold** renders as <strong>', () => {
  const out = html('We zijn open **9-17 uur**.');
  assert.match(out, /<strong>9-17 uur<\/strong>/);
});

test('strips leaked <thinking> tags', () => {
  const out = html('<thinking>internal</thinking>\nAntwoord');
  assert.doesNotMatch(out, /<thinking>/);
  assert.doesNotMatch(out, /internal/);
  assert.match(out, /Antwoord/);
});

test('hides an OPEN <thinking> with no closing tag (mid-stream)', () => {
  // Tijdens het streamen heeft het model wel <thinking> geopend maar nog niet
  // gesloten. De rauwe redenering mag niet zichtbaar zijn.
  const out = html('<thinking>ik denk na over welke chunk relevant is');
  assert.doesNotMatch(out, /thinking/i);
  assert.doesNotMatch(out, /ik denk na/);
});

test('open <thinking> gevolgd door beginnend antwoord toont alleen het antwoord', () => {
  const out = html('<thinking>redenering</thinking>\n<answer>Het antwoord begint');
  assert.doesNotMatch(out, /redenering/);
  assert.doesNotMatch(out, /answer/i);
  assert.match(out, /Het antwoord begint/);
});

test('knipt een halve trailing tag af tijdens streaming', () => {
  // Buffer eindigt midden in een tag ("<a" voor <answer>) — mag niet als
  // zichtbare tekst flikkeren.
  const out = html('Wij zijn open van 9-17 uur <a');
  assert.doesNotMatch(out, /&lt;a/);
  assert.match(out, /9-17 uur/);
});

test('strips een nog-open <confidence>-staart', () => {
  const out = html('Het kost €50 per maand. <confidence>0.82');
  assert.match(out, /€50 per maand\./);
  assert.doesNotMatch(out, /confidence/i);
  assert.doesNotMatch(out, /0\.82/);
});

test('knipt alle metadata na </answer> weg, ook zonder <confidence>-tag', () => {
  // Spiegelt parseStreamingV03: alles na </answer> is metadata, geen antwoord.
  const out = html('<answer>Het kost €50 per maand.</answer>\nconfidence: 0.92');
  assert.match(out, /€50 per maand\./);
  assert.doesNotMatch(out, /confidence/i);
  assert.doesNotMatch(out, /0\.92/);
});

test('strips [n] citations', () => {
  const out = html('Het kost €50 [1] per maand [2][3].');
  assert.doesNotMatch(out, /\[1\]/);
  assert.doesNotMatch(out, /\[2\]/);
  assert.match(out, /€50 per maand\./);
});

test('blank line produces paragraph-break', () => {
  const out = html('Eerste regel.\n\nTweede regel.');
  // Should contain a spacer div between the two lines.
  assert.match(out, /Eerste regel[\s\S]*<div[^>]*aria-hidden[^>]*>[\s\S]*Tweede regel/);
});

test('- bullets collapse into one <ul> with <li> items', () => {
  const out = html('Opties:\n- Bellen\n- Mailen\n- Formulier');
  assert.match(out, /<ul[^>]*>/);
  assert.match(out, /<li[^>]*>Bellen<\/li>/);
  assert.match(out, /<li[^>]*>Mailen<\/li>/);
  assert.match(out, /<li[^>]*>Formulier<\/li>/);
});

test('* bullets render same as - bullets', () => {
  const outA = html('* A\n* B');
  const outB = html('- A\n- B');
  // Should both produce a <ul> with two <li>
  assert.match(outA, /<ul[^>]*>[\s\S]*<li[^>]*>A<\/li>[\s\S]*<li[^>]*>B<\/li>[\s\S]*<\/ul>/);
  assert.match(outB, /<ul[^>]*>[\s\S]*<li[^>]*>A<\/li>[\s\S]*<li[^>]*>B<\/li>[\s\S]*<\/ul>/);
});

test('bold inside bullets still works', () => {
  const out = html('- Bellen op **020-1234567**');
  assert.match(out, /<li[^>]*>Bellen op <strong>020-1234567<\/strong><\/li>/);
});

test('mixed: heading-bold + bullets + paragraph', () => {
  const input = '**Openingstijden**\n\n- Ma-vr: 9-17u\n- Za: 10-14u\n\nBel voor afspraken.';
  const out = html(input);
  assert.match(out, /<strong>Openingstijden<\/strong>/);
  assert.match(out, /<li[^>]*>Ma-vr: 9-17u<\/li>/);
  assert.match(out, /Bel voor afspraken\./);
});

test('[tekst](https://…) rendert als veilige <a> (nieuw tabblad, noopener)', () => {
  const out = html('Zie onze [over ons](https://example.com/over-ons).');
  assert.match(out, /<a[^>]*href="https:\/\/example\.com\/over-ons"/);
  assert.match(out, /target="_blank"/);
  assert.match(out, /rel="noopener noreferrer"/);
  assert.match(out, />over ons<\/a>/);
});

test('javascript:-link wordt nooit een <a> — alleen label-tekst', () => {
  const out = html('Klik [hier](javascript:stealCookies) maar.');
  assert.doesNotMatch(out, /<a[^>]*href/);
  assert.match(out, /Klik hier maar\./);
});

test('link werkt binnen een bullet', () => {
  const out = html('- Lees meer op [de site](https://example.com)');
  assert.match(out, /<li[^>]*>Lees meer op <a[^>]*href="https:\/\/example\.com"[^>]*>de site<\/a><\/li>/);
});

test('bold en link in dezelfde regel', () => {
  const out = html('**Tip**: bezoek [ons portfolio](https://example.com/portfolio).');
  assert.match(out, /<strong>Tip<\/strong>/);
  assert.match(out, /<a[^>]*href="https:\/\/example\.com\/portfolio"[^>]*>ons portfolio<\/a>/);
});

test('[n]-citatie-strip breekt een link met niet-numeriek label niet', () => {
  const out = html('Meer info: [Diensten](https://example.com/diensten).');
  assert.match(out, /<a[^>]*href="https:\/\/example\.com\/diensten"[^>]*>Diensten<\/a>/);
});

test('tijdens streaming (linkify=false) blijft een link kale label-tekst', () => {
  const out = renderToStaticMarkup(
    renderMarkdownLite(
      'Zie [over ons](https://example.com/over-ons).',
      undefined,
      false,
    ) as React.ReactElement,
  );
  assert.doesNotMatch(out, /<a[^>]*href/);
  assert.match(out, /Zie over ons\./);
});
