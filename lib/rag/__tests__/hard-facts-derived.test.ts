// v0.13 rekenbewuste verifier: vraag-getallen + getoonde rekenstappen gegrond,
// kale verzonnen bedragen niet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHardFacts, groundedDerivedValues, hardFactsSupportedBySources } from '../hard-facts';

const SRC = ['Vpb-tarief: 19% over de eerste € 200.000 winst, 25,8% over het meerdere.'];
const Q = ['Hoeveel Vpb betaal ik bij € 250.000 winst?'];

test('Vpb-som met tussenstappen is volledig gegrond', () => {
  const ans =
    'Over € 250.000 winst: 19% over € 200.000 = € 38.000, plus 25,8% over € 50.000 = € 12.900: samen **€ 50.900**.';
  const g = groundedDerivedValues(ans, SRC, Q);
  const s = hardFactsSupportedBySources(extractHardFacts(ans), SRC, { numericFallback: false, extraGrounded: g });
  assert.equal(s.supported, true, s.missing.join(','));
});

test('kaal fout totaal zonder stappen blijft ongegrond', () => {
  const ans = 'U betaalt **€ 60.500** Vpb.';
  const g = groundedDerivedValues(ans, SRC, Q);
  const s = hardFactsSupportedBySources(extractHardFacts(ans), SRC, { numericFallback: false, extraGrounded: g });
  assert.equal(s.supported, false);
});

test('verzonnen bedrag dat toevallig som van brongetallen is, blijft ongegrond zonder getoonde operanden', () => {
  const src = ['Inspectie € 95. Reparatie € 150.'];
  const ans = 'Een nieuw dak kost € 245.';
  const g = groundedDerivedValues(ans, src, ['Wat kost een nieuw dak?']);
  assert.equal(g.has('245'), false);
});

test('getal uit de vraag citeren is gegrond', () => {
  const ans = 'Bij 40 m² EPDM à € 95 per m² komt u op € 3.800.';
  const g = groundedDerivedValues(ans, ['EPDM: € 95–115 per m².'], ['Wat kost 40 m2 EPDM?']);
  assert.ok(g.has('40'));
  assert.ok(g.has('3800'));
});
