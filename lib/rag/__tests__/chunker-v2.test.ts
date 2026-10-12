import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkByHeadings, documentTitle, boundedSplit } from '../chunker-v2';

const PAGE = `# Tarieven

Welkom bij onze tarievenpagina.

## Losse lessen

| Les | Prijs |
|---|---|
| Rijles 60 min | € 62 |
| Rijles 90 min | € 93 |

## Veelgestelde vragen

### Kan ik in termijnen betalen?

Ja, pakket B kun je in 5 termijnen betalen.

### Accepteren jullie contant geld?

Nee, contant betalen accepteren we niet.
`;

test('documentTitle: eerste H1, anders bestandsnaam zonder volgnummer/extensie', () => {
  assert.equal(documentTitle(PAGE, '03-tarieven.md'), 'Tarieven');
  assert.equal(documentTitle('geen kop hier', '12-contact.md'), 'contact');
  assert.equal(documentTitle('geen kop', 'brochure.pdf'), 'brochure');
});

test('content blijft letterlijke brontekst; kruimelpad alleen in embedText', () => {
  const { children } = chunkByHeadings(PAGE, 'Tarieven');
  assert.ok(children.length > 0);
  for (const c of children) {
    assert.ok(!c.content.includes(' › '), 'kruimelpad lekt in content');
    assert.ok(c.embedText.endsWith(c.content));
    assert.ok(c.embedText.startsWith('Tarieven'));
  }
});

test('FAQ-vraag en antwoord blijven samen in één child', () => {
  const { children } = chunkByHeadings(PAGE, 'Tarieven');
  const faq = children.find((c) => c.content.includes('termijnen betalen?'));
  assert.ok(faq);
  assert.ok(faq.content.includes('5 termijnen'));
});

test('kruimelpad bevat de sectiekop boven de chunk (lange secties)', () => {
  const iso = 'Isolatie houdt de warmte binnen en verlaagt de energierekening. '.repeat(30);
  const pv = 'Montage van panelen gebeurt met dakhaken zonder te boren. '.repeat(30);
  const doc = `# Diensten

## Dakisolatie

${iso}

## Zonnepanelen

### Wat kost montage?

${pv}`;
  const { children } = chunkByHeadings(doc, 'Diensten');
  const zp = children.find((c) => c.content.includes('Wat kost montage?'));
  assert.ok(zp);
  assert.ok(zp.embedText.startsWith('Diensten › Zonnepanelen › Wat kost montage?'));
  const isoChunk = children.find((c) => c.content.includes('## Dakisolatie'));
  assert.ok(isoChunk && isoChunk.embedText.startsWith('Diensten'));
});

test('tabel staat met kopregel in één child', () => {
  const { children } = chunkByHeadings(PAGE, 'Tarieven');
  const t = children.find((c) => c.content.includes('Rijles 60 min'));
  assert.ok(t);
  assert.ok(t.content.includes('| Les | Prijs |'));
});

test('lange tabel → rijgroepen die elk de kopregel herhalen', () => {
  const rows = Array.from({ length: 80 }, (_, i) => `| Dienst ${i} met een wat langere omschrijving | € ${100 + i},00 |`).join('\n');
  const { children } = chunkByHeadings(`# Prijzen\n\n## Lijst\n\n| Dienst | Prijs |\n|---|---|\n${rows}\n`, 'Prijzen');
  const parts = children.filter((c) => c.content.includes('| Dienst |'));
  assert.ok(parts.length > 1);
  assert.ok(children.every((c) => c.content.length <= 1300));
});

test('tekst zonder kopjes (PDF/DOCX) wordt op grootte geknipt en verliest niets', () => {
  const zin = 'Dit is een gewone zin uit een geüpload document zonder markdown-kopjes. ';
  const text = zin.repeat(200);
  const { parents, children } = chunkByHeadings(text, 'brochure');
  assert.ok(parents.length > 1);
  assert.ok(children.every((c) => c.content.length <= 1200));
  assert.ok(children.every((c) => c.embedText.startsWith('brochure\n\n')));
});

test('Q&A-document blijft één child met de Vraag/Antwoord-vorm intact', () => {
  const qa = 'Vraag: Zijn jullie op zaterdag open?\n\nAntwoord: Ja, van 9 tot 13 uur.';
  const { parents, children } = chunkByHeadings(qa, 'Vraag');
  assert.equal(parents.length, 1);
  assert.equal(children.length, 1);
  assert.equal(children[0].content, qa);
});

test('leeg document → geen chunks', () => {
  assert.deepEqual(chunkByHeadings('   \n\n ', 'x').children, []);
});

test('boundedSplit: knipt op zinsgrenzen binnen de maat', () => {
  const t = 'Eerste zin hier. '.repeat(100);
  const parts = boundedSplit(t, 200, 0);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 200 && p.endsWith('.')));
});
