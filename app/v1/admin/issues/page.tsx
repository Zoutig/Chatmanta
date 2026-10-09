// V1 admin — Issues: gelogde fouten uit alle onderdelen.
//   * Geen org-filter (orgs uit de DB zijn onbeperkt; een zoekbare org-filter is een
//     apart feature als er behoefte aan is).
//   * listErrorGroups / getErrorSummary via lib/v1/admin/errors (getJorionAdminClient).
//   * Auth: requireJorionAdmin via getJorionAdminClient() intern; catch AUTH_FORBIDDEN.

import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import {
  getErrorSummary,
  listErrorGroups,
  type ErrorGroupV1,
  type ErrorSummary,
} from '@/lib/v1/admin/errors';
import { formatRelativeNL } from '@/lib/controlroom/format';
import type { ErrorSeverity, ErrorStatus, ErrorSurface } from '@/lib/observability/sink';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Badge, EmptyState, type Tone } from '@/app/v1/_ui/feedback';
import { FilterChip, FilterRow } from '../_ui/filter-chips';

export const dynamic = 'force-dynamic';

const SEV_TONE: Record<ErrorSeverity, Tone> = { error: 'danger', warning: 'warn', info: 'accent' };
const SEV_LABEL: Record<ErrorSeverity, string> = { error: 'Fout', warning: 'Waarschuwing', info: 'Info' };
const SURFACE_LABEL: Record<ErrorSurface, string> = {
  widget: 'Widget',
  dashboard: 'Dashboard',
  chatbot: 'Chatbot',
  api: 'API',
  cron: 'Geplande taak',
  system: 'Systeem',
};
const SURFACES: ErrorSurface[] = ['widget', 'dashboard', 'chatbot', 'api', 'cron', 'system'];
const STATUSES: ErrorStatus[] = ['open', 'resolved', 'ignored'];
const STATUS_LABEL: Record<ErrorStatus, string> = { open: 'Open', resolved: 'Opgelost', ignored: 'Genegeerd' };

type SP = { status?: string; sev?: string; surface?: string };

function buildHref(sp: SP, patch: Partial<SP>): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch })) {
    if (v) merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/v1/admin/issues?${qs}` : '/v1/admin/issues';
}

function HealthStrip({ summary }: { summary: ErrorSummary }) {
  const openCount = summary.openError + summary.openWarning;
  const tone: Tone = summary.openError > 0 ? 'danger' : summary.openWarning > 0 ? 'warn' : 'ok';
  const label =
    openCount === 0
      ? 'Alles draait'
      : `${openCount} open: ${summary.openError} ${summary.openError === 1 ? 'fout' : 'fouten'}, ${summary.openWarning} ${summary.openWarning === 1 ? 'waarschuwing' : 'waarschuwingen'}`;
  return (
    <div className="v1-adm-strip">
      <Badge tone={tone} dot>
        {label}
      </Badge>
      <span className="v1-adm-muted">
        {summary.last24hError} {summary.last24hError === 1 ? 'fout' : 'fouten'} in de laatste 24 uur, {summary.openInfo} info-meldingen verborgen
      </span>
    </div>
  );
}

function IssueRow({ g }: { g: ErrorGroupV1 }) {
  const orgLabel = g.orgName ?? (g.organizationId ? g.organizationId.slice(0, 8) + '…' : 'Geen klant');
  return (
    <li>
      <Link href={`/v1/admin/issues/${g.id}`} className="v1-list-row v1-list-row--link">
        <Badge tone={SEV_TONE[g.severity]} dot>
          {SEV_LABEL[g.severity]}
        </Badge>
        <Badge>{SURFACE_LABEL[g.surface]}</Badge>
        <span className="v1-list-main">
          <span className="v1-list-title">{g.title}</span>
          <span className="v1-list-meta">
            {g.code}, {orgLabel}
          </span>
        </span>
        <span className="v1-list-end v1-adm-muted">
          <span>{g.count}×</span>
          <span>{formatRelativeNL(g.lastSeenAt)}</span>
        </span>
      </Link>
    </li>
  );
}

export default async function V1IssuesPage({ searchParams }: { searchParams: Promise<SP> }) {
  try {
    await getJorionAdminClient(); // gate + vroeg-falen vóór de data-fetches
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → /v1/login
  }

  const sp = await searchParams;

  const status: ErrorStatus = STATUSES.includes(sp.status as ErrorStatus) ? (sp.status as ErrorStatus) : 'open';
  const sevParam = sp.sev ?? '';
  const severity: ErrorSeverity[] =
    sevParam === 'error' ? ['error'] : sevParam === 'all' ? ['error', 'warning', 'info'] : ['error', 'warning'];
  const surface: ErrorSurface | undefined = SURFACES.includes(sp.surface as ErrorSurface)
    ? (sp.surface as ErrorSurface)
    : undefined;

  const [summary, groups] = await Promise.all([getErrorSummary(), listErrorGroups({ status, severity, surface })]);

  return (
    <div className="v1-page">
      <PageHeader
        title="Issues"
        description="Gelogde fouten uit widget, dashboard, chatbot en API. Open een fout voor de volledige context."
      />

      <HealthStrip summary={summary} />

      <section className="v1-card">
        <h2 className="v1-section-title">Gelogde fouten</h2>

        <div className="v1-adm-filters">
          <FilterRow label="Status">
            {STATUSES.map((s) => (
              <FilterChip key={s} active={status === s} href={buildHref(sp, { status: s === 'open' ? '' : s })}>
                {STATUS_LABEL[s]}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label="Ernst">
            <FilterChip active={sevParam === ''} href={buildHref(sp, { sev: '' })}>
              Fouten en waarschuwingen
            </FilterChip>
            <FilterChip active={sevParam === 'error'} href={buildHref(sp, { sev: 'error' })}>
              Alleen fouten
            </FilterChip>
            <FilterChip active={sevParam === 'all'} href={buildHref(sp, { sev: 'all' })}>
              Ook info
            </FilterChip>
          </FilterRow>
          <FilterRow label="Onderdeel">
            <FilterChip active={!surface} href={buildHref(sp, { surface: '' })}>
              Alle
            </FilterChip>
            {SURFACES.map((s) => (
              <FilterChip key={s} active={surface === s} href={buildHref(sp, { surface: s })}>
                {SURFACE_LABEL[s]}
              </FilterChip>
            ))}
          </FilterRow>
        </div>

        {groups.length === 0 ? (
          <EmptyState>Geen fouten die bij dit filter passen.</EmptyState>
        ) : (
          <ul className="v1-list v1-adm-list">
            {groups.map((g) => (
              <IssueRow key={g.id} g={g} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
