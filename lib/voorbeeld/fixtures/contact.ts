// Vaste voorbeelddata voor Contactverzoeken (Vakantiepark De Duinhoeve).
// Alle namen, e-mailadressen en nummers zijn fictief. Pure data + kleine
// helpers: veilig in zowel server- als client-componenten.
import type { V1ContactRequest } from '@/lib/v1/dashboard/contact-requests';

const TZ = 'Europe/Amsterdam';

/** Verschil tussen Amsterdamse wandkloktijd en UTC (ms) op moment `utcMs`. */
function amsterdamOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

/**
 * ISO-tijdstip `n` dagen geleden om `hour:minute` Amsterdamse tijd. Dag-granulariteit,
 * zodat server en client (vrijwel) altijd hetzelfde tijdstip uitrekenen.
 */
export function daysAgo(n: number, hour = 10, minute = 0): string {
  const now = Date.now();
  const local = new Date(now + amsterdamOffsetMs(now));
  const guess = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - n, hour, minute);
  return new Date(guess - amsterdamOffsetMs(guess)).toISOString();
}

/** Korte pauze zodat een "doe alsof"-actie voelt als een echte opslag. */
export function pretendDelay(min = 300, max = 600): Promise<void> {
  const ms = min + Math.round(Math.random() * (max - min));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Vaste contactverzoeken, recent eerst. Functie: datums relatief aan nu. */
export function getContactFixtures(): V1ContactRequest[] {
  return [
    {
      id: 'vb-cv-1',
      name: 'Marloes de Wit',
      email: 'marloes.dewit@example.com',
      phone: '06 0000 1234',
      preferredContact: 'call',
      subject: 'Groepsaccommodatie voor een familieweekend',
      message:
        'We zijn met 14 personen en zoeken een weekend in mei. Is de groepsaccommodatie dan nog vrij en kunnen we er ook een barbecue bij boeken?',
      status: 'new',
      notes: null,
      createdAt: daysAgo(0, 9, 12),
    },
    {
      id: 'vb-cv-2',
      name: 'Jeroen Bakker',
      email: 'j.bakker@example.nl',
      phone: null,
      preferredContact: 'email',
      subject: 'Twee honden in het tiny house',
      message:
        'Op de site lees ik dat er één hond mee mag in het tiny house. Wij hebben twee kleine honden. Kan dat in overleg?',
      status: 'new',
      notes: null,
      createdAt: daysAgo(1, 20, 41),
    },
    {
      id: 'vb-cv-3',
      name: 'Fatima el Amrani',
      email: 'fatima.elamrani@example.com',
      phone: '06 0000 5678',
      preferredContact: 'call',
      subject: 'Boshuis met een tillift',
      message:
        'Mijn vader zit in een rolstoel en heeft een tillift nodig. Kunnen jullie die regelen voor onze week in het Boshuis?',
      status: 'picked_up',
      notes: 'Teruggebeld. Tillift besteld bij de thuiszorgwinkel in Middelburg, wordt op de aankomstdag bezorgd.',
      createdAt: daysAgo(3, 14, 5),
    },
    {
      id: 'vb-cv-4',
      name: 'Tom Verhoeven',
      email: 'tom.verhoeven@example.nl',
      phone: null,
      preferredContact: 'email',
      subject: 'Later uitchecken op zondag',
      message: 'Is het mogelijk om op zondag na 10:00 uur uit te checken? We willen graag nog even naar het strand.',
      status: 'handled',
      notes: 'Late check-out tot 14:00 uur bevestigd, 35 euro op de rekening gezet.',
      createdAt: daysAgo(6, 11, 30),
    },
    {
      id: 'vb-cv-5',
      name: 'Sanne Jansen',
      email: 'sanne.j@example.com',
      phone: '06 0000 9012',
      preferredContact: 'email',
      subject: 'Kinderfeestje bij het zwembad',
      message: 'Kunnen we in de herfstvakantie een kinderfeestje houden bij het binnenzwembad, ook als we niet op het park verblijven?',
      status: 'handled',
      notes: null,
      createdAt: daysAgo(11, 16, 48),
    },
  ];
}
