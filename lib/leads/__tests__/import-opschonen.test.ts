import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdresgids, verwerkImport, leesCsv, besluitHerimport, SCAN_VELDEN, type NielsLead, type BestaandeLead } from '../import-opschonen';

const L = (x: Partial<NielsLead>): NielsLead => ({
  url: 'https://jansen-bouw.nl/',
  bedrijfsnaam: 'Bouwbedrijf Jansen',
  niche: 'installateur',
  woorden: 1200,
  emails: ['info@jansen-bouw.nl'],
  telefoons: ['06 12345678'],
  heeft_chatbot: false,
  chatbot_naam: null,
  platform: 'wordpress',
  fout: null,
  google_score: 4.5,
  google_reviews: 10,
  plaats: 'Ede',
  provincie: 'Gelderland',
  score: 9,
  max_score: 14,
  knockout: null,
  redenen: ['Contentomvang 1/2'],
  ...x,
});

test('normaliseert URL, telefoon en e-mail; neemt score voorlopig over', () => {
  const r = verwerkImport([L({ url: 'http://www.jansen-bouw.nl/?utm_source=g' })]);
  assert.equal(r.leads.length, 1);
  const l = r.leads[0];
  assert.equal(l.domein, 'jansen-bouw.nl');
  assert.equal(l.website_url, 'http://www.jansen-bouw.nl/');
  assert.equal(l.telefoon, '+31612345678');
  assert.equal(l.email, 'info@jansen-bouw.nl');
  assert.equal(l.score, 9);
  assert.equal(l.score_voorlopig, true);
  assert.equal(l.status, 'open');
  assert.equal(l.bron, 'import_niels');
});

test('mailto:-adressen worden opgeschoond', () => {
  const r = verwerkImport([L({ emails: ['mailto:Info@Jansen-Bouw.nl?subject=x', 'kapot'] })]);
  assert.equal(r.leads[0].email, 'info@jansen-bouw.nl');
  assert.deepEqual(r.leads[0].emails_gevonden, ['info@jansen-bouw.nl']);
  assert.equal(r.rapport.emailsAfgekeurd, 1);
});

test('Google-nummer uit de CSV wordt hoofdnummer, max 3 extra', () => {
  const csv = new Map([['jansen-bouw.nl', '026 123 4567']]);
  const r = verwerkImport([L({ telefoons: ['06 12345678', '06 22222222', '06 33333333', '06 44444444', '06 55555555'] })], { googleTelefoon: csv });
  assert.equal(r.leads[0].telefoon, '+31261234567');
  assert.deepEqual(r.leads[0].telefoons_extra, ['+31612345678', '+31622222222', '+31633333333']);
});

test('adresgidsen eruit, kapotte e-mails eruit, knock-outs blijven met label', () => {
  const r = verwerkImport([
    L({ url: 'https://nlmappoint.org/x', telefoons: ['06 11111111'] }),
    L({ url: 'https://a.nl', emails: ['0612345678', ''], telefoons: ['06 22222222'], knockout: 'geen e-mailadres gevonden' }),
    L({ url: 'https://b.nl', telefoons: ['06 33333333'], fout: 'timeout', knockout: 'niet gescand: website niet bereikbaar' }),
    L({ url: 'https://c.nl', telefoons: ['06 44444444'], woorden: 120, knockout: 'te weinig content (120 woorden)' }),
  ]);
  assert.equal(r.rapport.adresgids, 1);
  assert.deepEqual(r.leads.map((l) => l.domein), ['a.nl', 'b.nl', 'c.nl']);
  assert.equal(r.leads[0].email, null);
  assert.deepEqual(r.leads[1].labels, ['site_onbereikbaar']);
  assert.deepEqual(r.leads[2].labels, ['weinig_tekst']);
});

test('chatbot → eigen status; vestiging → keten; generieke naam → label', () => {
  const r = verwerkImport([
    L({ url: 'https://a.nl', telefoons: ['06 11111111'], heeft_chatbot: true, chatbot_naam: 'Trengo' }),
    L({ url: 'https://keten.nl/vestiging/ede', telefoons: ['06 22222222'] }),
    L({ url: 'https://c.nl', telefoons: ['06 33333333'], bedrijfsnaam: 'Dakdekker Ede', niche: 'dakdekker' }),
  ]);
  assert.equal(r.leads[0].status, 'heeft_chatbot');
  assert.equal(r.leads[0].chatbot_naam, 'Trengo');
  assert.deepEqual(r.leads[1].labels, ['keten']);
  assert.deepEqual(r.leads[2].labels, ['generieke_naam']);
});

test('dubbel domein en dubbel telefoonnummer worden één lead (meeste reviews wint)', () => {
  const r = verwerkImport([
    L({ url: 'https://a.nl', telefoons: ['06 11111111'], google_reviews: 3 }),
    L({ url: 'https://www.a.nl/contact', telefoons: ['06 99999999'] }),
    L({ url: 'https://b.nl', telefoons: ['06 11111111'], google_reviews: 30 }),
  ]);
  assert.equal(r.leads.length, 1);
  assert.equal(r.leads[0].domein, 'b.nl');
  assert.deepEqual(r.leads[0].bron_data.andere_domeinen, ['a.nl']);
  assert.equal(r.rapport.dubbelDomein, 1);
  assert.equal(r.rapport.samengevoegdTelefoon, 1);
});

test('zonder telefoon én domein wordt overgeslagen', () => {
  const r = verwerkImport([L({ url: '', telefoons: [] })]);
  assert.equal(r.leads.length, 0);
  assert.equal(r.rapport.zonderSleutel, 1);
});

test('status.json: uitkomsten en activiteiten', () => {
  const r = verwerkImport(
    [
      L({ url: 'https://a.nl', telefoons: ['06 11111111'] }),
      L({ url: 'https://b.nl', telefoons: ['06 22222222'] }),
      L({ url: 'https://c.nl', telefoons: ['06 33333333'] }),
    ],
    {
      status: {
        'a.nl': { gebeld: '2026-10-16', uitkomst: 'geen interesse', notitie: 'te duur' },
        'b.nl': { mail_verstuurd: '2026-10-15', uitkomst: 'demo gepland' },
        'c.nl': { niet_benaderen: true },
      },
    },
  );
  const [a, b, c] = r.leads;
  assert.equal(a.status, 'geen_interesse');
  assert.equal(a.notitie, 'te duur');
  assert.equal(b.status, 'kans');
  assert.equal(c.status, 'niet_bellen');
  const actA = r.activiteiten.get('a.nl')!;
  assert.deepEqual(actA.map((x) => x.soort), ['import']);
  assert.equal(actA[0].details.gebeld, '2026-10-16');
  assert.equal(r.activiteiten.get('b.nl')![0].details.mail_verstuurd, '2026-10-15');
});

test('leesCsv: kop + komma-gescheiden + aanhalingstekens', () => {
  const rijen = leesCsv('url,niche,bedrijfsnaam,telefoon\nhttps://a.nl,hovenier,"Groen, en Zo",06 11111111\n');
  assert.deepEqual(rijen, [{ url: 'https://a.nl', niche: 'hovenier', bedrijfsnaam: 'Groen, en Zo', telefoon: '06 11111111' }]);
});

test('kloon-gidsen worden herkend, ook op een onbekend domein', () => {
  assert.equal(isAdresgids('https://nlmapway.org/details/x-hoveniers-ChIJabc', 'nlmapway.org'), true);
  assert.equal(isAdresgids('https://nieuwe-kloon.example/details/x-hoveniers-ChIJabc', 'nieuwe-kloon.example'), true);
  assert.equal(isAdresgids('https://vhg.org/', 'vhg.org'), true);
  assert.equal(isAdresgids('https://jansen-bouw.nl/contact', 'jansen-bouw.nl'), false);
});

test('kloon-gids-vermelding blijft als lead zonder domein/website, met telefoon uit lead of CSV', () => {
  const gids = 'https://nlmapway.org/details/groen-hoveniers-ChIJabc';
  const r = verwerkImport(
    [
      L({ url: gids, telefoons: ['06 11111111'] }),
      L({ url: 'https://nlzoommap.org/details/blauw-ChIJdef', telefoons: [] }),
      L({ url: 'https://nlmappoint.org/x', telefoons: ['06 99999999'] }),
      L({ url: 'https://vhg.org/', telefoons: ['06 88888888'] }),
    ],
    { googleTelefoon: new Map([['nlzoommap.org', '06 22222222']]) },
  );
  assert.equal(r.rapport.uitGids, 2);
  assert.equal(r.rapport.adresgids, 2);
  assert.equal(r.rapport.zonderSleutel, 0);
  assert.equal(r.leads.length, 2);
  for (const l of r.leads) {
    assert.equal(l.domein, null);
    assert.equal(l.website_url, null);
    assert.ok(l.telefoon);
  }
  assert.equal(r.leads[0].telefoon, '+31611111111');
});

test('kloon-gids-lead zonder telefoon telt als zonder sleutel, en botst niet met dubbel telefoonnummer', () => {
  const r = verwerkImport([
    L({ url: 'https://nlmapway.org/details/a-ChIJ1', telefoons: [] }),
    L({ url: 'https://nlmapway.org/details/b-ChIJ2', telefoons: ['06 11111111'], google_reviews: 3 }),
    L({ url: 'https://eigen-site.nl/', telefoons: ['06 11111111'], google_reviews: 50 }),
  ]);
  assert.equal(r.rapport.zonderSleutel, 1);
  assert.equal(r.rapport.uitGids, 2 - 1);
  assert.equal(r.rapport.samengevoegdTelefoon, 1);
  assert.equal(r.leads.length, 1);
  assert.equal(r.leads[0].domein, 'eigen-site.nl');
  const telefoons = r.leads.map((l) => l.telefoon);
  assert.equal(new Set(telefoons).size, telefoons.length);
});

test('kloon-gids-CSV-nummer wordt niet gedeeld door meerdere vermeldingen op hetzelfde gids-domein', () => {
  const r = verwerkImport(
    [
      L({ url: 'https://nlzoommap.org/details/a-ChIJ1', telefoons: [] }),
      L({ url: 'https://nlzoommap.org/details/b-ChIJ2', telefoons: [] }),
    ],
    { googleTelefoon: new Map([['nlzoommap.org', '06 22222222']]) },
  );
  assert.equal(r.leads.length, 0);
  assert.equal(r.rapport.zonderSleutel, 2);
});

// ── herimport ───────────────────────────────────────────────────────────

const importLead = () => verwerkImport([L({})]).leads[0];
/** Bestaande rij zoals de database hem teruggeeft: zelfde scanvelden, jsonb-sleutels in andere volgorde. */
function bestaand(x: Partial<BestaandeLead> = {}): BestaandeLead {
  const l = importLead();
  const scan = Object.fromEntries(SCAN_VELDEN.map((k) => [k, l[k]]));
  const bd = l.bron_data;
  return { id: 'x', status: 'open', bedrijfsnaam: l.bedrijfsnaam, ...scan, bron_data: { knockout: bd.knockout, url: bd.url }, ...x };
}

test('herimport: niets veranderd → ongewijzigd (geen update, bewaarklok blijft)', () => {
  assert.deepEqual(besluitHerimport(bestaand(), importLead(), false), { soort: 'ongewijzigd' });
});

test('herimport: alleen echt gewijzigde scanvelden in de patch', () => {
  const b = besluitHerimport(bestaand({ score: 3, labels: ['oud'] }), importLead(), false);
  assert.equal(b.soort, 'bijwerken');
  assert.deepEqual(b.soort === 'bijwerken' && Object.keys(b.patch).sort(), ['labels', 'score']);
});

test('herimport: afgesloten of geanonimiseerde leads blijven onaangeroerd', () => {
  for (const status of ['niet_bellen', 'geen_interesse', 'archief'] as const) {
    assert.deepEqual(besluitHerimport(bestaand({ status, score: 1 }), importLead(), false), { soort: 'overslaan' });
  }
  assert.deepEqual(besluitHerimport(bestaand({ bedrijfsnaam: '(verwijderd)', score: 1 }), importLead(), false), { soort: 'overslaan' });
});

test('herimport: niet benaderen zet een bestaande lead op niet_bellen, behalve als hij dat al is', () => {
  for (const status of ['open', 'kans', 'archief', 'geen_interesse'] as const) {
    assert.deepEqual(besluitHerimport(bestaand({ status }), importLead(), true), { soort: 'niet_bellen' });
  }
  assert.deepEqual(besluitHerimport(bestaand({ status: 'niet_bellen' }), importLead(), true), { soort: 'overslaan' });
});
