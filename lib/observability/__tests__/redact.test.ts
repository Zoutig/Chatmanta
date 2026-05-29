import assert from 'node:assert/strict';
import { test } from 'node:test';

import { detectPossiblePii } from '@/lib/controlroom/pii';
import { redactPii } from '../redact';

test('redactPii maskeert email/telefoon/iban/bsn', () => {
  assert.equal(redactPii('mail jan@firma.nl nu'), 'mail [email] nu');
  assert.match(redactPii('bel 06-12345678'), /\[telefoon\]/);
  assert.match(redactPii('iban NL91ABNA0417164300'), /\[iban\]/);
  assert.match(redactPii('bsn 123456789 hier'), /\[bsn\]/);
  assert.equal(redactPii(null), '');
  assert.equal(redactPii(undefined), '');
});

test('redactPii-output triggert de pii-detector niet meer (geen drift t.o.v. pii.ts)', () => {
  const samples = ['mail a@b.nl', 'bel 0612345678', 'NL91ABNA0417164300', 'bsn 123456789'];
  for (const s of samples) {
    assert.equal(detectPossiblePii(redactPii(s)), false, `nog steeds PII na redactie: "${s}"`);
  }
});
