// Control Room — windowed usage/activity reads over query_log + v0_threads.
//
// Bewust GOEDKOPE head-counts (count: 'exact', head: true → geen row-transfer)
// waar mogelijk, zodat de cross-org Overview snel blijft. De zwaardere
// klantendashboard-aggregators (getOverviewMetrics, getConversationSuccessRate)
// scannen rijen en zijn te duur voor een 5-orgs fan-out — daarom hier eigen,
// gerichte counts. V0-volume is klein; bij V1 wordt dit een SQL-aggregatie.

import 'server-only';

import { sb } from './db';

// V0-cap op de enige rij-scan (maand-kostensom). Klein op V0-volume.
const MAX_COST_ROWS = 20_000;

export function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Maandag-gebaseerde week-start (zelfde conventie als metrics.ts). */
export function startOfWeekIso(weeksAgo = 0): string {
  const d = new Date();
  const isoDow = (d.getDay() + 6) % 7; // 0 = maandag
  d.setDate(d.getDate() - isoDow - weeksAgo * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Aantal niet-verwijderde threads sinds `sinceIso` (of all-time als null). */
export async function getThreadCount(
  organizationId: string,
  sinceIso: string | null,
): Promise<number> {
  try {
    let q = sb()
      .from('v0_threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    if (sinceIso) q = q.gte('created_at', sinceIso);
    const { count, error } = await q;
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

/** Aantal actieve (niet-verwijderde) documenten van een org. */
export async function getDocumentCount(organizationId: string): Promise<number> {
  try {
    const { count, error } = await sb()
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('deleted_at', null);
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}

export type FallbackStats = { total: number; fallback: number };

/** Totaal aantal query_log-rijen + aantal met kind='fallback' sinds `sinceIso`. */
export async function getQueryLogStats(
  organizationId: string,
  sinceIso: string,
): Promise<FallbackStats> {
  try {
    const [totalRes, fbRes] = await Promise.all([
      sb()
        .from('query_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', sinceIso),
      sb()
        .from('query_log')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('kind', 'fallback')
        .gte('created_at', sinceIso),
    ]);
    return {
      total: totalRes.error ? 0 : (totalRes.count ?? 0),
      fallback: fbRes.error ? 0 : (fbRes.count ?? 0),
    };
  } catch {
    return { total: 0, fallback: 0 };
  }
}

/** Som van query_log.cost_usd voor deze kalendermaand (USD). */
export async function getMonthlyCostUsd(organizationId: string): Promise<number> {
  try {
    const { data, error } = await sb()
      .from('query_log')
      .select('cost_usd')
      .eq('organization_id', organizationId)
      .gte('created_at', startOfMonthIso())
      .limit(MAX_COST_ROWS);
    if (error || !data) return 0;
    return data.reduce((acc, r) => acc + (Number(r.cost_usd) || 0), 0);
  } catch {
    return 0;
  }
}

/** ISO-timestamp van de laatste query_log-rij voor een org, of null. */
export async function getLastActivityAt(organizationId: string): Promise<string | null> {
  try {
    const { data, error } = await sb()
      .from('query_log')
      .select('created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data.created_at as string | null) ?? null;
  } catch {
    return null;
  }
}
