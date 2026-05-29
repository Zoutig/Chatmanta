// Control Room — read/mutatie-laag voor admin_error_groups (de Issues-tab).
// Service-role via sb(); org-filters worden tegen KNOWN_ORGS gevalideerd. De
// WRITE-kant (capture) zit bewust in lib/v0/server/error-capture.ts (de twin van
// logQuery); hier alleen lezen + status muteren voor de admin-UI.

import 'server-only';

import type {
  ErrorContext,
  ErrorGroup,
  ErrorSeverity,
  ErrorStatus,
  ErrorSurface,
} from '@/lib/observability/sink';
import { sb } from './db';

const TABLE = 'admin_error_groups';

type Row = {
  id: string;
  fingerprint: string;
  organization_id: string | null;
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

function mapRow(r: Row): ErrorGroup {
  return {
    id: r.id,
    fingerprint: r.fingerprint,
    organizationId: r.organization_id,
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

export type ErrorGroupFilter = {
  severity?: ErrorSeverity[];
  surface?: ErrorSurface;
  /** Org-uuid (gevalideerd tegen KNOWN_ORGS door de caller/searchParams). */
  orgId?: string;
  status?: ErrorStatus;
};

/** Lijst gegroepeerde fouten, nieuwste eerst. Default: open + error/warning
 *  (info verborgen — beslissing #6). NOOIT throwen op leesfouten → []. */
export async function listErrorGroups(filter: ErrorGroupFilter = {}): Promise<ErrorGroup[]> {
  const severities = filter.severity ?? ['error', 'warning'];
  let q = sb()
    .from(TABLE)
    .select('*')
    .in('severity', severities)
    .eq('status', filter.status ?? 'open')
    .order('last_seen_at', { ascending: false })
    .limit(200);
  if (filter.surface) q = q.eq('surface', filter.surface);
  if (filter.orgId) q = q.eq('organization_id', filter.orgId);

  const { data, error } = await q;
  if (error) {
    console.error('[listErrorGroups]', error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Row));
}

export async function getErrorGroup(id: string): Promise<ErrorGroup | null> {
  const { data, error } = await sb().from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Row);
}

export type ErrorSummary = {
  openError: number;
  openWarning: number;
  openInfo: number;
  /** Open error-severity in de laatste 24u — voedt de health-strip. */
  last24hError: number;
};

async function countOpen(severity: ErrorSeverity, sinceIso?: string): Promise<number> {
  let q = sb()
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'open')
    .eq('severity', severity);
  if (sinceIso) q = q.gte('last_seen_at', sinceIso);
  const { count } = await q;
  return count ?? 0;
}

export async function getErrorSummary(): Promise<ErrorSummary> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [openError, openWarning, openInfo, last24hError] = await Promise.all([
    countOpen('error').catch(() => 0),
    countOpen('warning').catch(() => 0),
    countOpen('info').catch(() => 0),
    countOpen('error', since24h).catch(() => 0),
  ]);
  return { openError, openWarning, openInfo, last24hError };
}

/** Aantal open error-severity-groepen voor één org in de laatste 24u — voedt
 *  deriveHealth (signals.ts). Cheap head-count; faalt stil naar 0. */
export async function countRecentCriticalErrors(orgId: string): Promise<number> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await sb()
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .eq('severity', 'error')
    .gte('last_seen_at', since24h);
  return count ?? 0;
}

/** Zet de status (open/resolved/ignored). resolved_at wordt gezet bij 'resolved',
 *  anders genuld. Gevalideerd dat de groep bestaat is niet nodig — een no-op
 *  update op een verdwenen id is onschadelijk. */
export async function setErrorGroupStatus(id: string, status: ErrorStatus): Promise<void> {
  const { error } = await sb()
    .from(TABLE)
    .update({
      status,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', id);
  if (error) throw new Error(`setErrorGroupStatus: ${error.message}`);
}
