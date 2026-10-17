import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amsDelen,
  amsTijdstip,
  plusWerkdagenOm,
  volgendeWerkdagOm,
  plusMaandenOm,
  isOchtend,
  beginVanDag,
  beginVanMorgen,
  beginVanWeek,
  beginVanMaand,
  dagdeelVoorMail,
  herinneringNodig,
} from '../werkdagen';

// 2026-10-16 is een vrijdag. Zomertijd (UTC+2) tot zondag 2026-10-25 03:00.
const VR_1030 = new Date('2026-10-16T08:30:00Z'); // vr 10:30 Amsterdam
const VR_1500 = new Date('2026-10-16T13:00:00Z'); // vr 15:00 Amsterdam

test('amsDelen en amsTijdstip zijn elkaars inverse', () => {
  const d = amsDelen(VR_1030);
  assert.deepEqual([d.jaar, d.maand, d.dag, d.uur, d.minuut, d.weekdag], [2026, 10, 16, 10, 30, 5]);
  assert.equal(amsTijdstip(2026, 10, 16, 10, 30).toISOString(), VR_1030.toISOString());
  // wintertijd (UTC+1)
  assert.equal(amsTijdstip(2026, 10, 26, 9).toISOString(), '2026-10-26T08:00:00.000Z');
});

test('volgendeWerkdagOm slaat het weekend over', () => {
  assert.equal(volgendeWerkdagOm(VR_1030, 13).toISOString(), '2026-10-19T11:00:00.000Z'); // ma 13:00
});

test('plusWerkdagenOm over de wissel naar wintertijd', () => {
  const vr = new Date('2026-10-23T08:00:00Z'); // vr 23 okt 10:00
  assert.equal(plusWerkdagenOm(vr, 1, 9).toISOString(), '2026-10-26T08:00:00.000Z'); // ma 9:00 CET
  assert.equal(plusWerkdagenOm(vr, 3, 10).toISOString(), '2026-10-28T09:00:00.000Z'); // wo 10:00 CET
});

test('plusMaandenOm klemt op de laatste dag van de maand', () => {
  const d = amsTijdstip(2026, 11, 30, 11);
  assert.equal(plusMaandenOm(d, 3, 10).toISOString(), amsTijdstip(2027, 2, 28, 10).toISOString());
});

test('isOchtend', () => {
  assert.equal(isOchtend(VR_1030), true);
  assert.equal(isOchtend(VR_1500), false);
});

test('periodes', () => {
  assert.equal(beginVanDag(VR_1500).toISOString(), '2026-10-15T22:00:00.000Z');
  assert.equal(beginVanMorgen(VR_1500).toISOString(), '2026-10-16T22:00:00.000Z');
  assert.equal(beginVanWeek(VR_1500).toISOString(), '2026-10-11T22:00:00.000Z'); // ma 12 okt 0:00
  assert.equal(beginVanMaand(VR_1500).toISOString(), '2026-09-30T22:00:00.000Z');
});

test('dagdeelVoorMail', () => {
  assert.equal(dagdeelVoorMail(VR_1030, VR_1500), 'vanochtend');
  assert.equal(dagdeelVoorMail(VR_1500, VR_1500), 'vanmiddag');
  assert.equal(dagdeelVoorMail(new Date('2026-10-15T13:00:00Z'), VR_1500), 'gisteren');
  assert.equal(dagdeelVoorMail(new Date('2026-10-10T13:00:00Z'), VR_1500), 'vandaag');
  assert.equal(dagdeelVoorMail(null, VR_1500), 'vandaag');
});

test('herinneringNodig: vanaf de 3e werkdag na de mail', () => {
  const ma = new Date('2026-10-12T08:00:00Z'); // ma 10:00
  assert.equal(herinneringNodig(ma, new Date('2026-10-14T21:59:00Z')), false); // wo 23:59
  assert.equal(herinneringNodig(ma, new Date('2026-10-14T22:00:00Z')), true); // do 0:00
  const vr = new Date('2026-10-16T13:00:00Z'); // vr 15:00
  assert.equal(herinneringNodig(vr, new Date('2026-10-20T10:00:00Z')), false); // di
  assert.equal(herinneringNodig(vr, new Date('2026-10-21T08:00:00Z')), true); // wo
  assert.equal(herinneringNodig(null, new Date()), false);
  assert.equal(herinneringNodig('geen datum', new Date()), false);
  assert.equal(herinneringNodig(ma.toISOString(), new Date('2026-10-15T08:00:00Z')), true);
});
