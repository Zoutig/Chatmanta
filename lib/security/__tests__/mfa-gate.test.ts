// Unit-test voor de AAL2-step-up-beslissing (security-audit 2026-10, #6).
// Run: node --import tsx --test lib/security/__tests__/mfa-gate.test.ts

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { countVerifiedFactors, requiresAal2StepUp } from '../mfa-gate';

test('countVerifiedFactors telt alleen verified', () => {
  assert.equal(countVerifiedFactors(undefined), 0);
  assert.equal(countVerifiedFactors(null), 0);
  assert.equal(countVerifiedFactors([]), 0);
  assert.equal(countVerifiedFactors([{ status: 'unverified' }]), 0);
  assert.equal(countVerifiedFactors([{ status: 'verified' }, { status: 'unverified' }]), 1);
});

test('zonder MFA nooit blokkeren (niemand buitengesloten)', () => {
  assert.equal(requiresAal2StepUp({ verifiedFactorCount: 0, currentLevel: 'aal1' }), false);
  assert.equal(requiresAal2StepUp({ verifiedFactorCount: 0, currentLevel: null }), false);
});

test('met MFA: aal1-sessie blokkeren, aal2-sessie doorlaten', () => {
  assert.equal(requiresAal2StepUp({ verifiedFactorCount: 1, currentLevel: 'aal1' }), true);
  assert.equal(requiresAal2StepUp({ verifiedFactorCount: 1, currentLevel: undefined }), true);
  assert.equal(requiresAal2StepUp({ verifiedFactorCount: 2, currentLevel: 'aal2' }), false);
});
