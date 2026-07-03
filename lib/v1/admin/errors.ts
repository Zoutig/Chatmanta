// V1 admin — read/mutatie-laag voor admin_error_groups (de Issues-tab).
// Faithful port van lib/controlroom/server/errors.ts — enige wijziging: db-client
// is getJorionAdminClient() (cross-org service-role na requireJorionAdmin) i.p.v. sb().
// Callers (page.tsx) roepen getJorionAdminClient() zelf aan voor de auth-gate;
// hier hergebruiken we het door intern opnieuw te vragen (requireJorionAdmin is
// gecached in de request-scope via Next cache()).
//
// V1-aanpassing: geen KNOWN_ORGS/resolveOrgSlugFromId → org-naam via SELECT-join
// (organizations(name)) — de callers krijgen optioneel een `orgName` terug.

import 'server-only';

import { getJorionAdminClient } from '@/lib/supabase/admin';
import type {
  ErrorContext,
  ErrorGroup,
  ErrorSeverity,
  ErrorStatus,
  ErrorSurface,
} from '@/lib/observability/sink';

const TABLE = 'admin_error_groups';

type Row = {
  id: string;
  fingerprint: string;
  organization_id: string | null;
  organizations: { name: string } | null;
  surface: string;
  severity: string;
  code: string;
  title: string;
  message: string | null;
  count: number;
  first_seen_at: string;
  last_seen_at: string;
  status: string;
  resolved_at: string | null;
  last_context: ErrorContext | null;
};

function mapRow(r: Row): ErrorGroup & { orgName: string | null } {
  return {
    id: r.id,
    fingerprint: r.fingerprint,
    organizationId: r.organization_id,
    orgName: r.organizations?.name ?? null,
    surface: r.surface as ErrorSurface,
    severity: r.severity as ErrorSeverity,
    code: r.code,
    title: r.title,
    message: r.message,
    count: r.count,
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    status: r.status as ErrorStatus,
    resolvedAt: r.resolved_at,
    context: r.last_context ?? {},
  };
}

export type ErrorGroupV1 = ErrorGroup & { orgName: string | null };

export type ErrorGroupFilter = {
  severity?: ErrorSeverity[];
  surface?: ErrorSurface;
  orgId?: string;
  status?: ErrorStatus;
};

/** Lijst gegroepeerde fouten, nieuwste eerst. Default: open + error/warning.
 *  Voegt orgName toe via join. Faalt stil naar []. */
export async function listErrorGroups(filter: ErrorGroupFilter = {}): Promise<ErrorGroupV1[]> {
  const admin = await getJorionAdminClient();
  const severities = filter.severity ?? ['error', 'warning'];

  let q = admin
    .from(TABLE)
    .select('*, organizations(name)')
    .in('severity', severities)
    .eq('status', filter.status ?? 'open')
    .order('last_seen_at', { ascending: false })
    .limit(200);

  if (filter.surface) q = q.eq('surface', filter.surface);
  if (filter.orgId) q = q.eq('organization_id', filter.orgId);

  const { data, error } = await q;
  if (error) {
    console.error('[v1/listErrorGroups]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Row));
}

export async function getErrorGroup(id: string): Promise<ErrorGroupV1 | null> {
  const admin = await getJorionAdminClient();
  const { data, error } = await admin
    .from(TABLE)
    .select('*, organizations(name)')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Row);
}

export type ErrorSummary = {
  openError: number;
  openWarning: number;
  openInfo: number;
  last24hError: number;
};

async function countOpen(
  admin: Awaited<ReturnType<typeof getJorionAdminClient>>,
  severity: ErrorSeverity,
  sinceIso?: string,
): Promise<number> {
  let q = admin
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .eq('severity', severity);
  if (sinceIso) q = q.gte('last_seen_at', sinceIso);
  const { count } = await q;
  return count ?? 0;
}

export async function getErrorSummary(): Promise<ErrorSummary> {
  const admin = await getJorionAdminClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [openError, openWarning, openInfo, last24hError] = await Promise.all([
    countOpen(admin, 'error').catch(() => 0),
    countOpen(admin, 'warning').catch(() => 0),
    countOpen(admin, 'info').catch(() => 0),
    countOpen(admin, 'error', since24h).catch(() => 0),
  ]);
  return { openError, openWarning, openInfo, last24hError };
}

/** Status muteren (open/resolved/ignored). Geen-op op een verdwenen id. */
export async function setErrorGroupStatus(id: string, status: ErrorStatus): Promise<void> {
  const admin = await getJorionAdminClient();
  const { error } = await admin
    .from(TABLE)
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw new Error(`setErrorGroupStatus: ${error.message}`);
}
