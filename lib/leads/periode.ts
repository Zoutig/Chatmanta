// Periodes van het inzichtdashboard en de vergelijking met de vorige periode. Puur en getest.

import { beginVanDag, beginVanMaand, beginVanMorgen, beginVanWeek } from './werkdagen';

export type Periode = 'vandaag' | 'week' | 'maand' | 'alles';
export const PERIODES: { id: Periode; label: string }[] = [
  { id: 'vandaag', label: 'Vandaag' },
  { id: 'week', label: 'Deze week' },
  { id: 'maand', label: 'Deze maand' },
  { id: 'alles', label: 'Alles' },
];

export type PeriodeGrenzen = {
  van: Date;
  tot: Date;
  /** Vorige periode over dezelfde verstreken duur (null bij 'alles'). */
  vorige: { van: Date; tot: Date } | null;
};

const UUR = 3600_000;

/**
 * De lopende periode loopt van `van` tot nu (tot = begin van morgen, de toekomst is leeg).
 * De vergelijking pakt hetzelfde stuk van de vorige periode: vorigeVan tot vorigeVan + (nu - van),
 * zodat een halve week niet tegen een volle week wordt gezet. Kalendergrenzen in Amsterdamse tijd
 * (DST-veilig: het begin van de vorige periode komt uit de kalender, niet uit "min 24 uur").
 */
export function periodeGrenzen(p: Periode, nu = new Date()): PeriodeGrenzen {
  const tot = beginVanMorgen(nu);
  if (p === 'alles') return { van: new Date('2026-01-01T00:00:00Z'), tot, vorige: null };
  const van = p === 'vandaag' ? beginVanDag(nu) : p === 'week' ? beginVanWeek(nu) : beginVanMaand(nu);
  const netVoor = new Date(van.getTime() - UUR);
  const vorigeVan = p === 'vandaag' ? beginVanDag(netVoor) : p === 'week' ? beginVanWeek(netVoor) : beginVanMaand(netVoor);
  const verstreken = Math.max(0, nu.getTime() - van.getTime());
  // Een kortere vorige maand: niet voorbij het begin van de huidige periode.
  const vorigeTot = new Date(Math.min(vorigeVan.getTime() + verstreken, van.getTime()));
  return { van, tot, vorige: { van: vorigeVan, tot: vorigeTot } };
}

/** Percentage alleen bij genoeg data (spec: minimaal 10). */
export function pct(teller: number, noemer: number, minimum = 10): string {
  if (noemer < minimum) return '–';
  return `${Math.round((teller / noemer) * 100)}%`;
}

/** Verschil in aantallen t.o.v. de vorige periode, als tekst. */
export function verschilAantal(nu: number, vorige: number | undefined): string | undefined {
  if (vorige === undefined) return undefined;
  const d = nu - vorige;
  return d === 0 ? 'gelijk aan vorige periode' : `${d > 0 ? '+' : ''}${d} t.o.v. vorige periode`;
}

/**
 * Verschil van een ratio in procentpunten t.o.v. de vorige periode. Undefined als een van beide
 * ratio's te weinig data heeft (zelfde minimum als pct).
 */
export function verschilPunten(
  nu: { teller: number; noemer: number },
  vorige: { teller: number; noemer: number } | undefined,
  minimum = 10,
): string | undefined {
  if (!vorige || nu.noemer < minimum || vorige.noemer < minimum) return undefined;
  const d = Math.round((nu.teller / nu.noemer) * 100) - Math.round((vorige.teller / vorige.noemer) * 100);
  return d === 0 ? 'gelijk aan vorige periode' : `${d > 0 ? '+' : ''}${d} procentpunt t.o.v. vorige periode`;
}
