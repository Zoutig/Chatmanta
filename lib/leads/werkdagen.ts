// Alle tijdrekening van het leads-dashboard in Europe/Amsterdam, zonder library.
// Kalenderrekenen gebeurt op datum-niveau in UTC (geen DST-gedoe), het omzetten
// naar een echt tijdstip via amsTijdstip (corrigeert de offset iteratief).

const TZ = 'Europe/Amsterdam';
const WEEKDAG: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
});

export type Delen = { jaar: number; maand: number; dag: number; uur: number; minuut: number; weekdag: number };

export function amsDelen(d: Date): Delen {
  const p: Record<string, string> = {};
  for (const x of FMT.formatToParts(d)) p[x.type] = x.value;
  return {
    jaar: Number(p.year),
    maand: Number(p.month),
    dag: Number(p.day),
    uur: Number(p.hour),
    minuut: Number(p.minute),
    weekdag: WEEKDAG[p.weekday],
  };
}

/** Het echte tijdstip van een Amsterdamse wandkloktijd. */
export function amsTijdstip(jaar: number, maand: number, dag: number, uur: number, minuut = 0): Date {
  const doel = Date.UTC(jaar, maand - 1, dag, uur, minuut);
  let t = doel;
  for (let i = 0; i < 3; i++) {
    const p = amsDelen(new Date(t));
    const diff = Date.UTC(p.jaar, p.maand - 1, p.dag, p.uur, p.minuut) - doel;
    if (diff === 0) break;
    t -= diff;
  }
  return new Date(t);
}

type Kalenderdag = { jaar: number; maand: number; dag: number; weekdag: number };

function kalender(jaar: number, maand: number, dag: number, plus: number): Kalenderdag {
  const d = new Date(Date.UTC(jaar, maand - 1, dag + plus));
  return { jaar: d.getUTCFullYear(), maand: d.getUTCMonth() + 1, dag: d.getUTCDate(), weekdag: d.getUTCDay() };
}

const isWerkdag = (k: Kalenderdag) => k.weekdag !== 0 && k.weekdag !== 6;

/** n werkdagen na vandaag (ma-vr, feestdagen genegeerd), om `uur`:00. */
export function plusWerkdagenOm(nu: Date, n: number, uur: number): Date {
  const v = amsDelen(nu);
  let k = kalender(v.jaar, v.maand, v.dag, 0);
  let plus = 0;
  let gezien = 0;
  while (gezien < n) {
    plus++;
    k = kalender(v.jaar, v.maand, v.dag, plus);
    if (isWerkdag(k)) gezien++;
  }
  return amsTijdstip(k.jaar, k.maand, k.dag, uur);
}

export function volgendeWerkdagOm(nu: Date, uur: number): Date {
  return plusWerkdagenOm(nu, 1, uur);
}

export function plusMaandenOm(nu: Date, n: number, uur: number): Date {
  const v = amsDelen(nu);
  const eerste = new Date(Date.UTC(v.jaar, v.maand - 1 + n, 1));
  const jaar = eerste.getUTCFullYear();
  const maand = eerste.getUTCMonth() + 1;
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  return amsTijdstip(jaar, maand, Math.min(v.dag, laatste), uur);
}

export function isOchtend(d: Date): boolean {
  return amsDelen(d).uur < 12;
}

export function beginVanDag(nu: Date): Date {
  const v = amsDelen(nu);
  return amsTijdstip(v.jaar, v.maand, v.dag, 0);
}

/** Begin van morgen = einde (exclusief) van vandaag. */
export function beginVanMorgen(nu: Date): Date {
  const v = amsDelen(nu);
  const k = kalender(v.jaar, v.maand, v.dag, 1);
  return amsTijdstip(k.jaar, k.maand, k.dag, 0);
}

/** Maandag 0:00 van deze week. */
export function beginVanWeek(nu: Date): Date {
  const v = amsDelen(nu);
  const terug = (v.weekdag + 6) % 7;
  const k = kalender(v.jaar, v.maand, v.dag, -terug);
  return amsTijdstip(k.jaar, k.maand, k.dag, 0);
}

export function beginVanMaand(nu: Date): Date {
  const v = amsDelen(nu);
  return amsTijdstip(v.jaar, v.maand, 1, 0);
}

export type Dagdeel = 'vanochtend' | 'vanmiddag' | 'vandaag' | 'gisteren';

/** Voor "Ons gesprek van …" in de opvolgmail, op basis van de laatste belpoging. */
export function dagdeelVoorMail(poging: Date | null, nu: Date): Dagdeel {
  if (!poging) return 'vandaag';
  const p = amsDelen(poging);
  const n = amsDelen(nu);
  if (p.jaar === n.jaar && p.maand === n.maand && p.dag === n.dag) return p.uur < 12 ? 'vanochtend' : 'vanmiddag';
  const g = kalender(n.jaar, n.maand, n.dag, -1);
  if (p.jaar === g.jaar && p.maand === g.maand && p.dag === g.dag) return 'gisteren';
  return 'vandaag';
}

/** "vr 16 okt 14:00" voor in lijsten. */
export function toonMoment(iso: string | null, nu: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const v = amsDelen(d);
  const n = amsDelen(nu);
  const morgen = kalender(n.jaar, n.maand, n.dag, 1);
  const tijd = `${String(v.uur).padStart(2, '0')}:${String(v.minuut).padStart(2, '0')}`;
  if (v.jaar === n.jaar && v.maand === n.maand && v.dag === n.dag) return `vandaag ${tijd}`;
  if (v.jaar === morgen.jaar && v.maand === morgen.maand && v.dag === morgen.dag) return `morgen ${tijd}`;
  const datum = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return `${datum} ${tijd}`;
}

/** Herinnering sturen? Ja vanaf het begin (0:00) van de 3e werkdag na de opvolgmail. */
export function herinneringNodig(gestuurdOp: string | Date | null, nu: Date): boolean {
  if (!gestuurdOp) return false;
  const g = new Date(gestuurdOp);
  if (Number.isNaN(g.getTime())) return false;
  return nu.getTime() >= plusWerkdagenOm(g, 3, 0).getTime();
}
