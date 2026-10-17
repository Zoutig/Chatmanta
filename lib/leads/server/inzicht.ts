import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';
import { periodeGrenzen, type Periode } from '../periode';
import { voornamen } from './db';

export { PERIODES, pct, type Periode } from '../periode';

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

async function haal(db: SupabaseClient, van: Date, tot: Date, userId: string | null): Promise<Inzicht> {
  const { data, error } = await db.rpc('leads_inzicht', { p_van: van.toISOString(), p_tot: tot.toISOString(), p_user: userId });
  if (error) throw new AppError('INTERNAL', { message: `inzicht ophalen faalde: ${error.message}` });
  return data as Inzicht;
}

export async function haalInzicht(db: SupabaseClient, p: Periode, userId: string | null) {
  const g = periodeGrenzen(p);
  const [nu, vorige] = await Promise.all([
    haal(db, g.van, g.tot, userId),
    g.vorige ? haal(db, g.vorige.van, g.vorige.tot, userId) : Promise.resolve(null),
  ]);
  const namen = await voornamen(db, nu.per_beller.map((b) => b.user_id));
  nu.per_beller = nu.per_beller.map((b) => ({ ...b, naam: namen.get(b.user_id) ?? 'onbekend' }));
  return { nu, vorige };
}

export async function bellers(db: SupabaseClient): Promise<{ id: string; naam: string }[]> {
  const { data, error } = await db.from('users').select('id, email, full_name').eq('is_jorion_admin', true);
  if (error) throw new AppError('INTERNAL', { message: `bellers ophalen faalde: ${error.message}` });
  const ids = (data ?? []).map((u) => u.id as string);
  const namen = await voornamen(db, ids);
  return ids.map((id) => ({ id, naam: namen.get(id) ?? id }));
}
