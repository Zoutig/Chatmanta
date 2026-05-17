// Smoke-test voor lib/v0/server/hard-facts.ts (V0.6.1 PR-A).
// Run: npx tsx scripts/test-v06-hard-facts.ts
//
// Geen test-framework — alleen node:assert. Output: ✓ regels per pass,
// process.exit(1) bij eerste fail.

import { strict as assert } from 'node:assert';
import {
  extractHardFacts,
  hardFactsSupportedBySources,
  containsHardFacts,
} from '../lib/v0/server/hard-facts';

function show(label: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${label}`);
  } catch (err) {
    console.error(`✗ ${label}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Extract per categorie
// ---------------------------------------------------------------------------

show('money: €50 / EUR 50 / 50 euro → "50"', () => {
  const a = extractHardFacts('Onze prijs is €50 per maand.');
  const b = extractHardFacts('Onze prijs is EUR 50 per maand.');
  const c = extractHardFacts('Onze prijs is 50 euro per maand.');
  assert.deepEqual(a.money, ['50']);
  assert.deepEqual(b.money, ['50']);
  assert.deepEqual(c.money, ['50']);
});

show('money: €50,00 / €50.00 → "50" (trailing zeros gestript)', () => {
  const a = extractHardFacts('Het kost €50,00 per maand.');
  const b = extractHardFacts('Het kost €50.00 per maand.');
  assert.deepEqual(a.money, ['50']);
  assert.deepEqual(b.money, ['50']);
});

show('money: €1.234,56 → "1234.56" (thousands strip, decimal normalize)', () => {
  const f = extractHardFacts('Totaal €1.234,56 inclusief btw.');
  assert.deepEqual(f.money, ['1234.56']);
});

show('money: €1.000 → "1000" (3-cijfer fracPart = thousands)', () => {
  const f = extractHardFacts('Investering van €1.000 per kwartaal.');
  assert.deepEqual(f.money, ['1000']);
});

show('percentages: "5%" / "5,5%" / "100 %" → "5" / "5.5" / "100"', () => {
  const f = extractHardFacts('Korting van 5% bij jaarafname, BTW 21%, marge 5,5% over 100 %.');
  assert.ok(f.percentages.includes('5'));
  assert.ok(f.percentages.includes('21'));
  assert.ok(f.percentages.includes('5.5'));
  assert.ok(f.percentages.includes('100'));
});

show('datesOrYears: DD-MM-YYYY / DD/MM/YYYY / DD.M.YY + jaartal', () => {
  const f = extractHardFacts(
    'Opgericht op 15-3-2024. Eerste release 1/8/2025. Update 3.6.26. Sinds 1998.',
  );
  assert.ok(f.datesOrYears.includes('15-3-2024'));
  assert.ok(f.datesOrYears.includes('1-8-2025'));
  assert.ok(f.datesOrYears.includes('3-6-26'));
  assert.ok(f.datesOrYears.includes('1998'));
});

show('datesOrYears: alleen 19xx / 20xx als losse jaren', () => {
  const f = extractHardFacts('Sinds 2024. Voor 1850 niet relevant. In 2100 misschien.');
  assert.ok(f.datesOrYears.includes('2024'));
  assert.ok(!f.datesOrYears.includes('1850'));
  assert.ok(!f.datesOrYears.includes('2100'));
});

show('numbers: ≥2 cijfers, NIET overlappend met money/date/percent', () => {
  const f = extractHardFacts('In 2024 hebben we 49 documenten en €50 omzet en 80%.');
  assert.ok(f.numbers.includes('49'));
  assert.ok(!f.numbers.includes('50'), '50 zit in money, niet in numbers');
  assert.ok(!f.numbers.includes('80'), '80 zit in percent, niet in numbers');
  assert.ok(!f.numbers.includes('2024'), '2024 zit in datesOrYears');
});

show('emails: extract + lowercase + trailing punctuation strip', () => {
  const f = extractHardFacts('Mail naar Info@Voorbeeld.nl, of bel.');
  assert.deepEqual(f.emails, ['info@voorbeeld.nl']);
});

show('urls: http + www, trailing slash gestript, lowercased', () => {
  const f = extractHardFacts('Zie HTTPS://Chatmanta.nl/ en www.example.com.');
  assert.ok(f.urls.includes('https://chatmanta.nl'));
  assert.ok(f.urls.includes('www.example.com'));
});

show('phones: NL formaten — cijfers-only normalisatie', () => {
  const f = extractHardFacts('Bel 06-12345678 of +31 6 12345678 of 010-1234567.');
  assert.ok(f.phones.includes('0612345678'));
  assert.ok(f.phones.includes('+31612345678'));
  assert.ok(f.phones.includes('0101234567'));
});

show('empty / niet-string input → lege output', () => {
  assert.deepEqual(extractHardFacts('').money, []);
  // @ts-expect-error testing defensive guard
  assert.deepEqual(extractHardFacts(null).money, []);
});

// ---------------------------------------------------------------------------
// Supported-by-sources — happy path
// ---------------------------------------------------------------------------

show('supported: alle facts in één source → supported=true', () => {
  const answer = 'ChatManta kost €50 per maand. Mail info@chatmanta.nl.';
  const facts = extractHardFacts(answer);
  const sources = ['Onze prijs: 50 euro per maand. Contact: info@chatmanta.nl.'];
  const r = hardFactsSupportedBySources(facts, sources);
  assert.equal(r.supported, true);
  assert.deepEqual(r.missing, []);
});

show('supported: cross-format money — €50 ≈ 50 euro ≈ EUR 50', () => {
  const facts = extractHardFacts('Prijs €50.');
  const sources1 = ['Tarief: 50 euro per maand.'];
  const sources2 = ['Cost: EUR 50/mo.'];
  assert.equal(hardFactsSupportedBySources(facts, sources1).supported, true);
  assert.equal(hardFactsSupportedBySources(facts, sources2).supported, true);
});

show('unsupported: bedrag NIET in source — missing met categorie-prefix', () => {
  const answer = 'ChatManta kost €500 per maand.'; // hallucinatie
  const facts = extractHardFacts(answer);
  const sources = ['Onze prijs is €50 per maand.']; // andere waarde
  const r = hardFactsSupportedBySources(facts, sources);
  assert.equal(r.supported, false);
  assert.ok(r.missing.includes('money:500'));
});

show('unsupported: verzonnen email', () => {
  const facts = extractHardFacts('Contact: verzonnen@bot.com.');
  const sources = ['Echte mail: info@chatmanta.nl.'];
  const r = hardFactsSupportedBySources(facts, sources);
  assert.equal(r.supported, false);
  assert.ok(r.missing.includes('email:verzonnen@bot.com'));
});

show('unsupported: verzonnen telefoonnummer', () => {
  const facts = extractHardFacts('Bel 06-99999999.');
  const sources = ['Bel 06-12345678 voor info.'];
  const r = hardFactsSupportedBySources(facts, sources);
  assert.equal(r.supported, false);
  assert.ok(r.missing.includes('phone:0699999999'));
});

show('unsupported: verkeerd jaartal', () => {
  const facts = extractHardFacts('Opgericht in 2020.');
  const sources = ['ChatManta is opgericht in 2024.'];
  const r = hardFactsSupportedBySources(facts, sources);
  assert.equal(r.supported, false);
  assert.ok(r.missing.includes('date:2020'));
});

show('geen facts in answer → supported=true (niets te bewijzen)', () => {
  const facts = extractHardFacts('Dat regelen we graag voor je.');
  const r = hardFactsSupportedBySources(facts, ['willekeurige chunk']);
  assert.equal(r.supported, true);
  assert.deepEqual(r.missing, []);
});

show('geen sources + facts in answer → supported=false', () => {
  const facts = extractHardFacts('Het kost €50.');
  const r = hardFactsSupportedBySources(facts, []);
  assert.equal(r.supported, false);
  assert.ok(r.missing.length > 0);
});

show('multiple chunks: fact mag in WILLEKEURIG welke source staan', () => {
  const facts = extractHardFacts('Prijs €50, mail info@chatmanta.nl.');
  const sources = [
    'Onze tarieven beginnen vanaf 50 euro.', // dekt money
    'Voor vragen: info@chatmanta.nl.', // dekt email
  ];
  const r = hardFactsSupportedBySources(facts, sources);
  assert.equal(r.supported, true);
});

show('fallback: money-waarde als generic number in source ook OK', () => {
  // Antwoord heeft money:50, source heeft kale 50 zonder valuta-teken
  const facts = extractHardFacts('Prijs €50.');
  const sources = ['We rekenen 50 per maand.'];
  const r = hardFactsSupportedBySources(facts, sources);
  // Money-fallback: cross-check tegen generic numbers
  assert.equal(r.supported, true);
});

// ---------------------------------------------------------------------------
// containsHardFacts helper
// ---------------------------------------------------------------------------

show('containsHardFacts: true voor antwoord met getal / valuta', () => {
  assert.equal(containsHardFacts('Het kost €50.'), true);
  assert.equal(containsHardFacts('Sinds 2024.'), true);
  assert.equal(containsHardFacts('Mail info@x.nl.'), true);
});

show('containsHardFacts: false voor pure conversatie', () => {
  assert.equal(containsHardFacts('Leuk dat je het vraagt!'), false);
  assert.equal(containsHardFacts(''), false);
});

console.log('\n✓ All hard-facts smoke tests passed.');
