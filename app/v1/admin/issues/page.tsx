// V1 admin — Issues. Port van app/admindashboard/issues/page.tsx.
// V1-aanpassingen:
//   * Geen KNOWN_ORGS/ALL_ORG_SLUGS → org-filter chip weggelaten (orgs uit DB zijn
//     onbeperkt; een zoekbare org-filter is een apart feature als er behoefte aan is).
//   * Geen afgeleide signalen (buildIssues / getControlRoomKlanten) — die zijn V0-specifiek.
//   * listErrorGroups / getErrorSummary via lib/v1/admin/errors (getJorionAdminClient).
//   * Auth: requireJorionAdmin via getJorionAdminClient() intern; catch AUTH_FORBIDDEN.

import Link from 'next/link';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import {
  getErrorSummary,
  listErrorGroups,
  type ErrorGroupV1,
  type ErrorSummary,
} from '@/lib/v1/admin/errors';
import { formatRelativeNL } from '@/lib/controlroom/format';
import type { ErrorSeverity, ErrorStatus, ErrorSurface } from '@/lib/observability/sink';

export const dynamic = 'force-dynamic';

const SEV_TONE: Record<ErrorSeverity, PillTone> = { error: 'danger', warning: 'warn', info: 'info' };
const SEV_LABEL: Record<ErrorSeverity, string> = { error: 'Fout', warning: 'Waarschuwing', info: 'Info' };
const SURFACE_LABEL: Record<ErrorSurface, string> = {
  widget: 'Widget', dashboard: 'Dashboard', chatbot: 'Chatbot',
  api: 'API', cron: 'Cron', system: 'Systeem',
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

function Chip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="klant-btn"
      style={{
        fontSize: 12,
        padding: '3px 10px',
        background: active ? 'var(--klant-accent-soft)' : undefined,
        borderColor: active ? 'var(--klant-accent-border)' : undefined,
        color: active ? 'var(--klant-accent)' : undefined,
      }}
    >
      {children}
    </Link>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--klant-dim)', minWidth: 64, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function HealthStrip({ summary }: { summary: ErrorSummary }) {
  const openCount = summary.openError + summary.openWarning;
  const tone: PillTone = summary.openError > 0 ? 'danger' : summary.openWarning > 0 ? 'warn' : 'success';
  const label =
    openCount === 0
      ? 'Alles draait ✓'
      : `${openCount} open (${summary.openError} fout · ${summary.openWarning} waarschuwing)`;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Pill tone={tone} dot>{label}</Pill>
        <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>
          {summary.last24hError} fout{summary.last24hError === 1 ? '' : 'en'} in de laatste 24u · {summary.openInfo} info verborgen
        </span>
      </div>
    </Card>
  );
}

function IssueRow({ g }: { g: ErrorGroupV1 }) {
  const orgLabel = g.orgName ?? (g.organizationId ? g.organizationId.slice(0, 8) + '…' : '—');
  return (
    <Link
      href={`/v1/admin/issues/${g.id}`}
      className="klant-convo-row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--klant-r-md)', textDecoration: 'none', color: 'var(--klant-ink)' }}
    >
      <Pill tone={SEV_TONE[g.severity]} dot>{SEV_LABEL[g.severity]}</Pill>
      <Pill tone="neutral">{SURFACE_LABEL[g.surface]}</Pill>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
        <div style={{ fontSize: 12, color: 'var(--klant-muted)' }}>{g.code} · {orgLabel}</div>
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>{g.count}×</span>
      <span style={{ fontSize: 12, color: 'var(--klant-dim)', whiteSpace: 'nowrap' }}>{formatRelativeNL(g.lastSeenAt)}</span>
    </Link>
  );
}

export default async function V1IssuesPage({ searchParams }: { searchParams: Promise<SP> }) {
  try {
    await getJorionAdminClient(); // gate + vroeg-falen vóór de data-fetches
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
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

  const [summary, groups] = await Promise.all([
    getErrorSummary(),
    listErrorGroups({ status, severity, surface }),
  ]);

  return (
    <>
      <PageHead
        title="Issues"
        subtitle="Gelogde fouten uit alle surfaces (widget, dashboard, chatbot, API). Klik een fout voor de volledige context + &ldquo;Kopieer voor Claude Code&rdquo;."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <HealthStrip summary={summary} />

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 10 }}>Gelogde fouten</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <FilterRow label="Status">
              {STATUSES.map((s) => (
                <Chip key={s} active={status === s} href={buildHref(sp, { status: s === 'open' ? '' : s })}>
                  {STATUS_LABEL[s]}
                </Chip>
              ))}
            </FilterRow>
            <FilterRow label="Severity">
              <Chip active={sevParam === ''} href={buildHref(sp, { sev: '' })}>Fout + waarschuwing</Chip>
              <Chip active={sevParam === 'error'} href={buildHref(sp, { sev: 'error' })}>Alleen fouten</Chip>
              <Chip active={sevParam === 'all'} href={buildHref(sp, { sev: 'all' })}>Incl. info</Chip>
            </FilterRow>
            <FilterRow label="Surface">
              <Chip active={!surface} href={buildHref(sp, { surface: '' })}>Alle</Chip>
              {SURFACES.map((s) => (
                <Chip key={s} active={surface === s} href={buildHref(sp, { surface: s })}>{SURFACE_LABEL[s]}</Chip>
              ))}
            </FilterRow>
          </div>

          {groups.length === 0 ? (
            <div className="klant-empty">
              <p className="klant-empty-title">Geen gelogde fouten 🎉</p>
              <p className="klant-empty-sub">Geen fouten die aan dit filter voldoen — alles draait.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {groups.map((g) => (
                <IssueRow key={g.id} g={g} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
