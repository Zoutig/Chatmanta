// Run: node --import tsx --test lib/v1/admin/__tests__/internal-orgs.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterInternalOrgs, isInternalOrg, parseShowInternal } from '../internal-orgs';
import { DEMO_ORG_SLUG } from '@/lib/voorbeeld/constants';
import { evalOrgSlug } from '@/lib/evals/eval-orgs';

test('eval-, seed-, test- en demo-orgs zijn intern', () => {
  for (const slug of [
    evalOrgSlug('acme-corp', 'v1'),
    'seed-org',
    'seed-org-b',
    'testbedrijf-1',
    'testbedrijf-1-2',
    'testbedrijf-niels',
    'test-org',
    'demo-bakkerij',
    DEMO_ORG_SLUG,
  ]) {
    assert.equal(isInternalOrg({ slug }), true, slug);
  }
});

test('gewone klant-slugs zijn niet intern', () => {
  for (const slug of ['manta-bakkerij', 'testo-b-v', 'evaluatiebureau-x', 'seedwinkel', 'demontage-bv', 'voorbeeldbedrijf']) {
    assert.equal(isInternalOrg({ slug }), false, slug);
  }
});

test('expliciete klantstatus wint van het slug-patroon', () => {
  assert.equal(isInternalOrg({ slug: 'testbedrijf-echt', explicitCommercialStatus: 'active' }), false);
  assert.equal(isInternalOrg({ slug: 'testbedrijf-echt', explicitCommercialStatus: 'trial' }), false);
  // 'internal_test' (ook de default) maakt een gewone slug níet intern.
  assert.equal(isInternalOrg({ slug: 'manta-bakkerij', explicitCommercialStatus: 'internal_test' }), false);
  assert.equal(isInternalOrg({ slug: 'seed-org', explicitCommercialStatus: 'internal_test' }), true);
});

test('filterInternalOrgs telt de verborgen orgs', () => {
  const items = [{ slug: 'seed-org' }, { slug: 'klant-a' }, { slug: DEMO_ORG_SLUG }];
  const hidden = filterInternalOrgs(items, (i) => i, false);
  assert.deepEqual(hidden.visible.map((i) => i.slug), ['klant-a']);
  assert.equal(hidden.hiddenCount, 2);
  const all = filterInternalOrgs(items, (i) => i, true);
  assert.equal(all.visible.length, 3);
  assert.equal(all.hiddenCount, 0);
});

test('parseShowInternal', () => {
  assert.equal(parseShowInternal('1'), true);
  assert.equal(parseShowInternal(['1']), true);
  assert.equal(parseShowInternal(undefined), false);
  assert.equal(parseShowInternal('0'), false);
});
