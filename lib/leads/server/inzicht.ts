import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';
import { beginVanDag, beginVanMaand, beginVanMorgen, beginVanWeek } from '../werkdagen';
import { voornamen } from './db';

export type Periode = 'vandaag' | 'week' | 'maand' | 'alles';
export const PERIODES: { id: Periode; label: string }[] = [
  { id: 'vandaag', label: 'Vandaag' },
  { id: 'week', label: 'Deze week' },
  { id: 'maand', label: 'Deze maand' },
  { id: 'alles', label: 'Alles' },
];

type Rij = { naam: string; belletjes: number; opgenomen: number; interesse: number; voorraad: number };

export type Inzicht = {
  belpogingen: number;
  bedrijven: number;
  opgenomen: number;
  interesse: number;
  kennismakingen: number;
  klanten: number;
  mails: number;
  mail_naar_kans: number;
  per_dag: { dag: string; belletjes: number; opgenomen: number; interesse: number }[];
  heatmap: { dow: number; uur: number; n: number; opgenomen: number }[];
  per_niche: Rij[];
  per_plaats: Rij[];
  bezwaren: { bezwaar: string; n: number }[];
  per_beller: { user_id: string; naam?: string; belletjes: number; opgenomen: number; interesse: number; kennismakingen: number }[];
  pijplijn: Record<string, number>;
};

export function periodeGrenzen(p: Periode, nu = new Date()): { van: Date; tot: Date; vorigeVan: Date | null } {
  const tot = beginVanMorgen(nu);
  if (p === 'alles') return { van: new Date('2026-01-01T00:00:00Z'), tot, vorigeVan: null };
  const van = p === 'vandaag' ? beginVanDag(nu) : p === 'week' ? beginVanWeek(nu) : beginVanMaand(nu);
  const lengte = p === 'vandaag' ? 24 * 3600_000 : p === 'week' ? 7 * 24 * 3600_000 : null;
  const vorigeVan = lengte
    ? new Date(van.getTime() - lengte)
    : beginVanMaand(new Date(van.getTime() - 24 * 3600_000));
  return { van, tot, vorigeVan };
}

async function haal(db: SupabaseClient, van: Date, tot: Date, userId: string | null): Promise<Inzicht> {
  const { data, error } = await db.rpc('leads_inzicht', { p_van: van.toISOString(), p_tot: tot.toISOString(), p_user: userId });
  if (error) throw new AppError('INTERNAL', { message: `inzicht ophalen faalde: ${error.message}` });
  return data as Inzicht;
}

export async function haalInzicht(db: SupabaseClient, p: Periode, userId: string | null) {
  const g = periodeGrenzen(p);
  const [nu, vorige] = await Promise.all([
    haal(db, g.van, g.tot, userId),
    g.vorigeVan ? haal(db, g.vorigeVan, g.van, userId) : Promise.resolve(null),
  ]);
  const namen = await voornamen(db, nu.per_beller.map((b) => b.user_id));
  nu.per_beller = nu.per_beller.map((b) => ({ ...b, naam: namen.get(b.user_id) ?? 'onbekend' }));
  return { nu, vorige };
}

export async function bellers(db: SupabaseClient): Promise<{ id: string; naam: string }[]> {
  const { data } = await db.from('users').select('id, email, full_name').eq('is_jorion_admin', true);
  const ids = (data ?? []).map((u) => u.id as string);
  const namen = await voornamen(db, ids);
  return ids.map((id) => ({ id, naam: namen.get(id) ?? id }));
}

/** Percentage alleen bij genoeg data (spec: minimaal 10 belpogingen). */
export function pct(teller: number, noemer: number, minimum = 10): string {
  if (noemer < minimum) return '–';
  return `${Math.round((teller / noemer) * 100)}%`;
}
