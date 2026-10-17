import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bouwOpvolgmail, standaardInvoer, type OpvolgInvoer } from '../opvolgmail';
import type { Afzender } from '../types';

const AFZ: Afzender = {
  naam: 'Test Beller',
  voornaam: 'Test',
  functie: 'Oprichter',
  telefoon: '06 12345678',
  email: 'test@example.com',
  fotoUrl: 'https://www.chatmanta.nl/mail/foto.png',
};

const basis: OpvolgInvoer = {
  ...standaardInvoer(),
  naam: 'Jan',
  bedrijf: 'Bouwbedrijf Jansen',
  dagdeel: 'vanmiddag',
};

test('info (je): onderwerp, aanhef, haakje vet, twee knoppen, handtekening', () => {
  const m = bouwOpvolgmail({ ...basis, haakje: 'planning en beschikbaarheid' }, AFZ);
  assert.equal(m.onderwerp, 'Ons gesprek van vanmiddag');
  assert.match(m.html, /Hoi Jan,/);
  assert.match(m.html, /<strong>planning en beschikbaarheid<\/strong>/);
  assert.match(m.html, /knop-demo-hoofd\.png/);
  assert.match(m.html, /knop-kennismaking\.png/);
  assert.match(m.html, /Leuk dat ik je vanmiddag even kon spreken\./);
  assert.match(m.html, /Test Beller/);
  assert.match(m.html, /foto\.png/);
  assert.deepEqual(m.ontbreekt, []);
  assert.match(m.tekst, /Hoi Jan,/);
  assert.match(m.tekst, /Bekijk de demo: https:\/\/www\.chatmanta\.nl\/voorbeeld\?utm_source=opvolgmail/);
});

test('u-vorm', () => {
  const m = bouwOpvolgmail({ ...basis, vorm: 'u', naam: 'meneer Jansen' }, AFZ);
  assert.match(m.html, /Beste meneer Jansen,/);
  assert.match(m.html, /Fijn dat ik u vanmiddag even kon spreken\./);
  assert.match(m.html, /uw eigen website/);
});

test('alle situaties bouwen zonder fout en hebben het juiste onderwerp', () => {
  assert.equal(bouwOpvolgmail({ ...basis, situatie: 'test' }, AFZ).onderwerp, 'Ons gesprek van vanmiddag');
  assert.equal(bouwOpvolgmail({ ...basis, situatie: 'kennis' }, AFZ).onderwerp, 'Ons gesprek van vanmiddag');
  assert.equal(
    bouwOpvolgmail({ ...basis, situatie: 'klaar', link: 'https://x.example/bot' }, AFZ).onderwerp,
    'Jullie testversie van ChatManta staat klaar',
  );
  const her = bouwOpvolgmail({ ...basis, situatie: 'herinnering' }, AFZ);
  assert.equal(her.onderwerp, 'Re: Ons gesprek van vanmiddag');
  assert.doesNotMatch(her.html, /logo\.png/); // kaal: zonder logo
});

test('ontbreekt: naam, bedrijf en https-link bij klaar', () => {
  const m = bouwOpvolgmail({ ...basis, naam: '', bedrijf: '' }, AFZ);
  assert.deepEqual(m.ontbreekt.map((x) => x.veld), ['naam', 'bedrijf']);
  assert.match(m.html, /\[naam\]/);
  const k = bouwOpvolgmail({ ...basis, situatie: 'klaar', link: 'http://onveilig.example' }, AFZ);
  assert.deepEqual(k.ontbreekt.map((x) => x.veld), ['link']);
});

test('alle vrije tekst wordt ge-escaped', () => {
  const m = bouwOpvolgmail(
    {
      ...basis,
      naam: '<b>Jan</b>',
      bedrijf: 'A&B "Bouw"',
      haakje: '<script>x</script>',
      eigen: '<img src=x>',
      ps: '<i>ps</i>',
    },
    { ...AFZ, naam: '<x>', telefoon: '06"1' },
  );
  assert.doesNotMatch(m.html, /<b>Jan<\/b>|<script>|<img src=x>|<i>ps<\/i>|<x>/);
  assert.match(m.html, /&lt;b&gt;Jan&lt;\/b&gt;/);
  assert.match(m.html, /A&amp;B &quot;Bouw&quot;/);
});

test('zonder foto geen foto-cel', () => {
  const m = bouwOpvolgmail(basis, { ...AFZ, fotoUrl: null });
  assert.doesNotMatch(m.html, /foto\.png/);
});

test('P.S. krijgt geen dubbel "P.S."', () => {
  const m = bouwOpvolgmail({ ...basis, ps: 'P.S. mooie foto’s' }, AFZ);
  assert.match(m.html, /P\.S\. mooie foto’s/);
  assert.doesNotMatch(m.html, /P\.S\. P\.S\./);
});

test('alle situaties x je/u: geen placeholders bij ingevulde velden, onderwerp gevuld', () => {
  for (const situatie of ['info', 'test', 'kennis', 'klaar', 'herinnering'] as const) {
    for (const vorm of ['je', 'u'] as const) {
      const m = bouwOpvolgmail({ ...basis, situatie, vorm, link: 'https://x.example/bot', haakje: 'planning' }, AFZ);
      assert.ok(m.onderwerp.trim().length > 0, `${situatie}/${vorm} onderwerp`);
      assert.doesNotMatch(m.html, /\[naam\]|\[bedrijfsnaam\]/, `${situatie}/${vorm} html`);
      assert.doesNotMatch(m.tekst, /\[naam\]|\[bedrijfsnaam\]/, `${situatie}/${vorm} tekst`);
      assert.deepEqual(m.ontbreekt, [], `${situatie}/${vorm} ontbreekt`);
    }
  }
});

test('onveilige link en fotoUrl worden genegeerd', () => {
  const m = bouwOpvolgmail(
    { ...basis, situatie: 'klaar', link: 'javascript:alert(1)' },
    { ...AFZ, fotoUrl: 'javascript:alert(1)' },
  );
  assert.doesNotMatch(m.html, /javascript:/);
  assert.match(m.html, /href="#"/);
  assert.doesNotMatch(m.html, /width="56"/);
});

test('platte tekst begint met de aanhef, zonder logo-link of nbsp', () => {
  const m = bouwOpvolgmail(basis, AFZ);
  assert.ok(m.tekst.startsWith('Hoi Jan,'), m.tekst.slice(0, 40));
});
