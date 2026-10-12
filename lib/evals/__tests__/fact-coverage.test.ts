import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  factCoverage,
  validateFactCoverage,
  factCoverageCall,
  type FactCoverageItem,
  type FactCoverageVerdict,
} from '../judges/fact-coverage';

const item: FactCoverageItem = {
  question: 'Hoe lang is een offerte geldig?',
  context: 'Onze offertes zijn 60 dagen geldig. Bij projecten boven € 25.000 is dat 30 dagen.',
  facts: [
    { id: 'f1', text: 'offerte 60 dagen geldig', required: true },
    { id: 'f2', text: 'boven € 25.000: 30 dagen', required: true },
  ],
  answer: 'Een offerte is 60 dagen geldig. Voor grote projecten boven € 25.000 geldt 30 dagen.',
};

const oracle: FactCoverageVerdict = {
  facts: [
    { id: 'f1', status: 'present', answer_quote: 'Een offerte is 60 dagen geldig' },
    { id: 'f2', status: 'present', answer_quote: 'boven € 25.000 geldt 30 dagen' },
  ],
  errors: [],
};

test('oracle-oordeel is geldig en scoort 1', () => {
  assert.deepEqual(validateFactCoverage(item, oracle), []);
  assert.equal(factCoverage(item, oracle), 1);
});

test('leeg antwoord: alles absent → geldig en 0', () => {
  const empty = { ...item, answer: 'Daar heb ik geen informatie over.' };
  const v: FactCoverageVerdict = {
    facts: item.facts.map((f) => ({ id: f.id, status: 'absent' as const, answer_quote: '' })),
    errors: [],
  };
  assert.deepEqual(validateFactCoverage(empty, v), []);
  assert.equal(factCoverage(empty, v), 0);
});

test('verzonnen citaat, ontbrekend of dubbel feit en vals bron-citaat → ongeldig', () => {
  const bad: FactCoverageVerdict = {
    facts: [
      { id: 'f1', status: 'present', answer_quote: 'offertes zijn 90 dagen geldig' },
      { id: 'f1', status: 'absent', answer_quote: '' },
    ],
    errors: [
      { severity: 'kritiek', type: 'verzonnen_feit', answer_quote: 'niet in antwoord', source_quote: 'ook niet in bron', explanation: '' },
    ],
  };
  const p = validateFactCoverage(item, bad).join(' | ');
  assert.match(p, /f1: citaat niet in antwoord/);
  assert.match(p, /f1 dubbel/);
  assert.match(p, /f2 ontbreekt/);
  assert.match(p, /antwoord-citaat/);
  assert.match(p, /bron-citaat/);
});

test('judge-prompt zet antwoord en bronnen in nonce-tags, item buiten de system prompt', () => {
  const c = factCoverageCall(item);
  assert.match(c.user, /<antwoord-[0-9a-f]{12}>/);
  assert.match(c.user, /<bronnen-[0-9a-f]{12}>/);
  assert.ok(!c.system.includes(item.answer));
});
