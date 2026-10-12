import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendLedger, assertRunAllowed, monthSpendUsd, RunBudget, BudgetExceededError } from '../ledger';

process.env.CHATMANTA_LEDGER_PATH = join(mkdtempSync(join(tmpdir(), 'ledger-')), 'l.jsonl');

test('ledger telt de lopende maand en blokkeert boven het plafond', () => {
  assert.equal(monthSpendUsd(), 0);
  appendLedger({ runId: 'r', purpose: 't', model: 'claude-opus-5-5', usd: 80, calls: 1, batch: false });
  assert.equal(monthSpendUsd(), 80);
  assert.doesNotThrow(() => assertRunAllowed({ estimateUsd: 5 }));
  assert.throws(() => assertRunAllowed({ estimateUsd: 15 }), /plafond/);
});

test('RunBudget stopt boven de run-cap', () => {
  const b = new RunBudget('r2', 't', 1);
  b.record('claude-opus-5-5', 0.6, false);
  assert.throws(() => b.record('claude-opus-5-5', 0.6, false), BudgetExceededError);
});
