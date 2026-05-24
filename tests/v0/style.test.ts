// Unit-tests voor lib/v0/style.ts en lib/v0/style-types.ts
//
// Run: node --import tsx --test tests/v0/style.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildStyleSuffix,
  buildSystemPrompt,
  describeStyle,
  normalizeStyle,
} from '../../lib/v0/style';
import {
  DEFAULT_LENGTH,
  DEFAULT_TONE,
  isLength,
  isTone,
  LENGTHS,
  TONES,
} from '../../lib/v0/style-types';

test('isTone / isLength accept all canonical values', () => {
  for (const t of TONES) assert.equal(isTone(t), true);
  for (const l of LENGTHS) assert.equal(isLength(l), true);
});

test('isTone / isLength reject invalid input', () => {
  for (const v of [null, undefined, 0, '', 'shouting', 'long', {}, []]) {
    assert.equal(isTone(v), false);
    assert.equal(isLength(v), false);
  }
});

test('normalizeStyle returns canonical values when valid', () => {
  assert.deepEqual(normalizeStyle({ tone: 'formal', length: 'short' }), {
    tone: 'formal',
    length: 'short',
  });
  assert.deepEqual(normalizeStyle({ tone: 'casual', length: 'detailed' }), {
    tone: 'casual',
    length: 'detailed',
  });
});

test('normalizeStyle falls back to defaults for invalid / missing', () => {
  const cases = [
    {},
    { tone: null, length: null },
    { tone: undefined, length: undefined },
    { tone: 'shouty', length: 'epic' },
    { tone: 42, length: true },
    { tone: 'NEUTRAL', length: 'MEDIUM' }, // case-sensitive
  ];
  for (const input of cases) {
    assert.deepEqual(normalizeStyle(input), {
      tone: DEFAULT_TONE,
      length: DEFAULT_LENGTH,
    });
  }
});

test('normalizeStyle defaults each axis independently', () => {
  assert.deepEqual(normalizeStyle({ tone: 'formal', length: 'bogus' }), {
    tone: 'formal',
    length: DEFAULT_LENGTH,
  });
  assert.deepEqual(normalizeStyle({ tone: 'bogus', length: 'detailed' }), {
    tone: DEFAULT_TONE,
    length: 'detailed',
  });
});

test('buildSystemPrompt appends suffix and does not mutate base', () => {
  const base = 'Je bent een test-bot.';
  const out = buildSystemPrompt(base, { tone: 'neutral', length: 'medium' });
  assert.equal(base, 'Je bent een test-bot.', 'base should be unchanged');
  assert.ok(out.startsWith(base), 'output should start with base');
  assert.ok(out.includes('\n\nSTIJL:\n'), 'output should contain STIJL: marker');
});

test('buildSystemPrompt covers all 9 tone × length combinations', () => {
  const base = 'BASE';
  for (const tone of TONES) {
    for (const length of LENGTHS) {
      const out = buildSystemPrompt(base, { tone, length });
      // Tone-zin moet aanwezig zijn
      const toneSnippet = {
        formal: 'formele, zakelijke toon',
        neutral: 'warme, vriendelijke toon',
        casual: 'losse, informele toon',
      }[tone];
      assert.ok(
        out.includes(toneSnippet),
        `expected tone snippet for ${tone}: ${toneSnippet}`,
      );
      // Length-zin moet aanwezig zijn
      const lengthSnippet = {
        short: 'maximaal 2 zinnen',
        medium: 'één korte alinea',
        detailed: 'uitgebreid antwoord',
      }[length];
      assert.ok(
        out.includes(lengthSnippet),
        `expected length snippet for ${length}: ${lengthSnippet}`,
      );
    }
  }
});

test('buildStyleSuffix returns just the suffix without leading newlines', () => {
  const suffix = buildStyleSuffix({ tone: 'casual', length: 'short' });
  assert.equal(suffix.startsWith('STIJL:\n'), true);
  assert.ok(suffix.includes('losse, informele toon'));
  assert.ok(suffix.includes('maximaal 2 zinnen'));
});

test('describeStyle returns the same instruction strings used in the prompt', () => {
  const desc = describeStyle({ tone: 'formal', length: 'detailed' });
  const full = buildSystemPrompt('BASE', { tone: 'formal', length: 'detailed' });
  assert.ok(full.includes(desc.tone));
  assert.ok(full.includes(desc.length));
});

test('buildSystemPrompt outputStyleVersion v1 returns existing strings', () => {
  const out = buildSystemPrompt('BASE', { tone: 'neutral', length: 'short' }, 'v1');
  assert.ok(out.includes('maximaal 2 zinnen'));
});

test('buildSystemPrompt outputStyleVersion v2 returns new short instruction', () => {
  const out = buildSystemPrompt('BASE', { tone: 'neutral', length: 'short' }, 'v2');
  assert.ok(out.includes('ULTRA-kort'));
  assert.ok(!out.includes('maximaal 2 zinnen'));
});

test('buildSystemPrompt outputStyleVersion v2 returns new medium instruction', () => {
  const out = buildSystemPrompt('BASE', { tone: 'neutral', length: 'medium' }, 'v2');
  assert.ok(out.includes('minimum dat compleet is'));
  assert.ok(!out.includes('één korte alinea'));
});

test('buildSystemPrompt outputStyleVersion v2 returns new detailed instruction', () => {
  const out = buildSystemPrompt('BASE', { tone: 'neutral', length: 'detailed' }, 'v2');
  assert.ok(out.includes('Meer structuur'));
  assert.ok(!out.includes('uitgebreid antwoord van meerdere alineas'));
});

test('buildSystemPrompt defaults to v1 when version param omitted', () => {
  const out = buildSystemPrompt('BASE', { tone: 'neutral', length: 'short' });
  assert.ok(out.includes('maximaal 2 zinnen'));
});

test('buildStyleSuffix accepts outputStyleVersion v2', () => {
  const suffix = buildStyleSuffix({ tone: 'neutral', length: 'detailed' }, 'v2');
  assert.ok(suffix.includes('Meer structuur'));
});

test('buildSystemPrompt outputStyleVersion v3 softens the short instruction', () => {
  const out = buildSystemPrompt('BASE', { tone: 'neutral', length: 'short' }, 'v3');
  assert.ok(out.includes('meestal 1-3 zinnen'));
  assert.ok(!out.includes('ULTRA-kort'), 'v3 short mag niet langer ULTRA-kort zijn');
});

test('buildSystemPrompt outputStyleVersion v3 medium preserves needed context', () => {
  const out = buildSystemPrompt('BASE', { tone: 'neutral', length: 'medium' }, 'v3');
  assert.ok(out.includes('compleet én bruikbaar'));
  assert.ok(out.includes('stel eerst één gerichte wedervraag'));
});

test('buildSystemPrompt outputStyleVersion v3 detailed equals v2 detailed', () => {
  const out = buildSystemPrompt('BASE', { tone: 'neutral', length: 'detailed' }, 'v3');
  assert.ok(out.includes('Meer structuur'));
});

test('buildStyleSuffix accepts outputStyleVersion v3', () => {
  const suffix = buildStyleSuffix({ tone: 'neutral', length: 'medium' }, 'v3');
  assert.ok(suffix.includes('stel eerst één gerichte wedervraag'));
});
