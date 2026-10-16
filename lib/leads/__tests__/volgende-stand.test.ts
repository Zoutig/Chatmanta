import { test } from 'node:test';
import assert from 'node:assert/strict';
import { volgendeStand, naMailVerstuurd, handmatigeStatus, isLaatstePoging, MAX_POGINGEN } from '../volgende-stand';
import type { Stand } from '../types';

const VR_1030 = new Date('2026-10-16T08:30:00Z');
const VR_1500 = new Date('2026-10-16T13:00:00Z');

const open: Stand = {
  status: 'open',
  status_reden: null,
  volgende_actie_op: null,
  volgende_actie_notitie: null,
  pogingen_niet_opgenomen: 0,
  laatste_poging_op: null,
  kennismaking_op: null,
  opvolgmail_gestuurd_op: null,
  opvolgmail_situatie: null,
};

test('niet opgenomen in de ochtend → volgende werkdag 13:00', () => {
  const r = volgendeStand(open, { uitkomst: 'niet_opgenomen', voicemail: true }, VR_1030);
  assert.equal(r.stand.status, 'open');
  assert.equal(r.stand.pogingen_niet_opgenomen, 1);
  assert.equal(r.stand.volgende_actie_op, '2026-10-19T11:00:00.000Z');
  assert.equal(r.stand.laatste_poging_op, VR_1030.toISOString());
  assert.deepEqual(r.details, { voicemail: true, poging: 1 });
  assert.equal(r.opentMail, null);
});

test('niet opgenomen in de middag → volgende werkdag 9:00', () => {
  const r = volgendeStand(open, { uitkomst: 'niet_opgenomen' }, VR_1500);
  assert.equal(r.stand.volgende_actie_op, '2026-10-19T07:00:00.000Z');
});

test('een gemiste terugbelafspraak wordt weer open', () => {
  const r = volgendeStand({ ...open, status: 'terugbellen' }, { uitkomst: 'niet_opgenomen' }, VR_1500);
  assert.equal(r.stand.status, 'open');
});

test('derde keer niet opgenomen vraagt een keuze', () => {
  const twee = { ...open, pogingen_niet_opgenomen: MAX_POGINGEN - 1 };
  assert.equal(isLaatstePoging(twee), true);
  assert.equal(isLaatstePoging(open), false);
  assert.throws(() => volgendeStand(twee, { uitkomst: 'niet_opgenomen' }, VR_1500), /keuze/);
  const mail = volgendeStand(twee, { uitkomst: 'niet_opgenomen', naDerde: 'mail' }, VR_1500);
  assert.equal(mail.stand.status, 'opvolgen');
  assert.equal(mail.opentMail, 'info');
  const arch = volgendeStand(twee, { uitkomst: 'niet_opgenomen', naDerde: 'archief' }, VR_1500);
  assert.equal(arch.stand.status, 'archief');
  assert.equal(arch.stand.status_reden, '3x niet opgenomen');
  assert.equal(arch.stand.volgende_actie_op, null);
});

test('terugbellen eist een moment in de toekomst', () => {
  assert.throws(() => volgendeStand(open, { uitkomst: 'terugbellen', op: '2026-10-16T07:00:00Z' }, VR_1030), /toekomst/);
  const r = volgendeStand(open, { uitkomst: 'terugbellen', op: '2026-10-19T12:00:00Z', notitie: ' vraag naar Jan ' }, VR_1030);
  assert.equal(r.stand.status, 'terugbellen');
  assert.equal(r.stand.volgende_actie_op, '2026-10-19T12:00:00.000Z');
  assert.equal(r.stand.volgende_actie_notitie, 'vraag naar Jan');
});

test('wil een mail → opvolgen, +3 werkdagen, mail-pop-up info', () => {
  const r = volgendeStand(open, { uitkomst: 'wil_mail' }, VR_1030);
  assert.equal(r.stand.status, 'opvolgen');
  assert.equal(r.stand.volgende_actie_op, '2026-10-21T08:00:00.000Z'); // wo 10:00
  assert.equal(r.opentMail, 'info');
});

test('interesse met kennismaking → kans, actie op de kennismaking, mail "kennis"', () => {
  const km = '2026-10-20T08:00:00.000Z';
  const r = volgendeStand(open, { uitkomst: 'interesse', mail: true, kennismakingOp: km }, VR_1030);
  assert.equal(r.stand.status, 'kans');
  assert.equal(r.stand.kennismaking_op, km);
  assert.equal(r.stand.volgende_actie_op, km);
  assert.equal(r.opentMail, 'kennis');
  assert.equal(r.kennismaking, true);
});

test('interesse alleen mail → mail "info"; zonder keuze is fout', () => {
  const r = volgendeStand(open, { uitkomst: 'interesse', mail: true, kennismakingOp: null }, VR_1030);
  assert.equal(r.opentMail, 'info');
  assert.equal(r.kennismaking, false);
  assert.throws(() => volgendeStand(open, { uitkomst: 'interesse', mail: false, kennismakingOp: null }, VR_1030));
});

test('interesse alleen kennismaking → geen mail', () => {
  const r = volgendeStand(open, { uitkomst: 'interesse', mail: false, kennismakingOp: '2026-10-20T08:00:00Z' }, VR_1030);
  assert.equal(r.opentMail, null);
});

test('geen interesse: weg of over 3 maanden', () => {
  const weg = volgendeStand(open, { uitkomst: 'geen_interesse', bezwaar: 'te_duur', opnieuwOver3Maanden: false }, VR_1030);
  assert.equal(weg.stand.status, 'geen_interesse');
  assert.equal(weg.stand.status_reden, 'te_duur');
  assert.deepEqual(weg.details, { bezwaar: 'te_duur', opnieuw: false });
  const later = volgendeStand(open, { uitkomst: 'geen_interesse', bezwaar: null, opnieuwOver3Maanden: true }, VR_1030);
  assert.equal(later.stand.status, 'terugbellen');
  assert.equal(later.stand.volgende_actie_op, '2027-01-16T09:00:00.000Z');
});

test('niet bellen; heeft chatbot gaat naar zijn eigen tabblad', () => {
  assert.equal(volgendeStand(open, { uitkomst: 'niet_bellen', reden: 'verkeerd_nummer' }, VR_1030).stand.status, 'niet_bellen');
  assert.equal(volgendeStand(open, { uitkomst: 'niet_bellen', reden: 'heeft_chatbot' }, VR_1030).stand.status, 'heeft_chatbot');
});

test('naMailVerstuurd: open → opvolgen; kans blijft kans met actie op de kennismaking', () => {
  const a = naMailVerstuurd(open, 'info', VR_1030);
  assert.equal(a.status, 'opvolgen');
  assert.equal(a.opvolgmail_situatie, 'info');
  assert.equal(a.opvolgmail_gestuurd_op, VR_1030.toISOString());
  assert.equal(a.volgende_actie_op, '2026-10-21T08:00:00.000Z');
  const km = '2026-10-20T08:00:00.000Z';
  const b = naMailVerstuurd({ ...open, status: 'kans', kennismaking_op: km }, 'kennis', VR_1030);
  assert.equal(b.status, 'kans');
  assert.equal(b.volgende_actie_op, km);
});

test('handmatigeStatus: terug naar open reset pogingen en actie', () => {
  const r = handmatigeStatus({ ...open, status: 'archief', pogingen_niet_opgenomen: 3, volgende_actie_op: 'x' }, 'open');
  assert.equal(r.status, 'open');
  assert.equal(r.pogingen_niet_opgenomen, 0);
  assert.equal(r.volgende_actie_op, null);
  assert.equal(handmatigeStatus(open, 'archief', 'adresgids').status_reden, 'adresgids');
});
