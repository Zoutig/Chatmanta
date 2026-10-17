import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodeGrenzen, pct, verschilAantal, verschilPunten } from '../periode';

// 2026-10-16 is een vrijdag, zomertijd (UTC+2). Wintertijd vanaf zondag 2026-10-25 03:00.
const VR_1030 = new Date('2026-10-16T08:30:00Z'); // vr 10:30 Amsterdam

test('vandaag: vorige = gisteren van 0:00 tot hetzelfde tijdstip', () => {
  const g = periodeGrenzen('vandaag', VR_1030);
  assert.equal(g.van.toISOString(), '2026-10-15T22:00:00.000Z');
  assert.equal(g.tot.toISOString(), '2026-10-16T22:00:00.000Z');
  assert.equal(g.vorige?.van.toISOString(), '2026-10-14T22:00:00.000Z');
  assert.equal(g.vorige?.tot.toISOString(), '2026-10-15T08:30:00.000Z'); // do 10:30
});

test('week: vorige week van maandag tot dezelfde verstreken duur', () => {
  const g = periodeGrenzen('week', VR_1030);
  assert.equal(g.van.toISOString(), '2026-10-11T22:00:00.000Z'); // ma 12 okt 0:00
  assert.equal(g.vorige?.van.toISOString(), '2026-10-04T22:00:00.000Z'); // ma 5 okt 0:00
  assert.equal(g.vorige?.tot.toISOString(), '2026-10-09T08:30:00.000Z'); // vr 9 okt 10:30
});

test('maand: vorige maand over dezelfde duur, nooit voorbij het begin van deze maand', () => {
  const g = periodeGrenzen('maand', VR_1030);
  assert.equal(g.van.toISOString(), '2026-09-30T22:00:00.000Z'); // 1 okt 0:00
  assert.equal(g.vorige?.van.toISOString(), '2026-08-31T22:00:00.000Z'); // 1 sep 0:00
  assert.equal(g.vorige?.tot.toISOString(), '2026-09-16T08:30:00.000Z');
  // 31 maart: februari is korter, dus de vergelijking stopt op 1 maart.
  const m = periodeGrenzen('maand', new Date('2026-03-31T10:00:00Z'));
  assert.ok(m.vorige);
  assert.ok(m.vorige.tot.getTime() <= m.van.getTime());
  assert.equal(m.vorige.tot.toISOString(), m.van.toISOString());
});

test('vandaag over de wintertijd-overgang: vorige dag begint om 0:00 lokale tijd', () => {
  const ma = new Date('2026-10-26T09:00:00Z'); // ma 10:00 (UTC+1)
  const g = periodeGrenzen('vandaag', ma);
  assert.equal(g.van.toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(g.vorige?.van.toISOString(), '2026-10-24T22:00:00.000Z'); // zo 0:00 (nog UTC+2)
});

test('alles: geen vorige periode', () => {
  assert.equal(periodeGrenzen('alles', VR_1030).vorige, null);
});

test('pct en verschillen respecteren het minimum van 10', () => {
  assert.equal(pct(3, 9), '–');
  assert.equal(pct(3, 10), '30%');
  assert.equal(verschilAantal(5, undefined), undefined);
  assert.equal(verschilAantal(5, 3), '+2 t.o.v. vorige periode');
  assert.equal(verschilAantal(3, 3), 'gelijk aan vorige periode');
  assert.equal(verschilPunten({ teller: 5, noemer: 10 }, { teller: 3, noemer: 9 }), undefined);
  assert.equal(verschilPunten({ teller: 5, noemer: 10 }, { teller: 3, noemer: 10 }), '+20 procentpunt t.o.v. vorige periode');
  assert.equal(verschilPunten({ teller: 2, noemer: 10 }, { teller: 4, noemer: 20 }), 'gelijk aan vorige periode');
});
