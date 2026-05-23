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
