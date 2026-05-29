// Admin Dashboard — Issues. Twee complementaire blokken:
//  1. GELOGDE FOUTEN — persistente admin_error_groups (echte capture over alle
//     surfaces), gefilterd via URL-searchParams (RSC, geen client-state).
//  2. AFGELEIDE SIGNALEN — de bestaande live-afleiding (crawl-fail/fallback/
//     widget) uit buildIssues(), behouden als gezondheids-signalen.
// Bovenaan een health-strip; de lege-staat van blok 1 is het "alles draait"-sein.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { getControlRoomKlanten } from '@/lib/controlroom/server/overview';
import { buildIssues, type ControlRoomIssue, type IssueSeverity } from '@/lib/controlroom/server/issues';
import {
  getErrorSummary,
  listErrorGroups,
  type ErrorSummary,
} from '@/lib/controlroom/server/errors';
import { ALL_ORG_SLUGS, KNOWN_ORGS, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import type { ErrorGroup, ErrorSeverity, ErrorStatus, ErrorSurface } from '@/lib/observability/sink';
import { formatRelativeNL } from '@/lib/controlroom/format';
import { ReloadButton } from '../components/reload-button';

export const dynamic = 'force-dynamic';

const SEV_TONE: Record<ErrorSeverity, PillTone> = { error: 'danger', warning: 'warn', info: 'info' };
const SEV_LABEL: Record<ErrorSeverity, string> = { error: 'Fout', warning: 'Waarschuwing', info: 'Info' };
const SURFACE_LABEL: Record<ErrorSurface, string> = {
  widget: 'Widget',
  dashboard: 'Dashboard',
  chatbot: 'Chatbot',
  api: 'API',
  cron: 'Cron',
  system: 'Systeem',
};
const SURFACES: ErrorSurface[] = ['widget', 'dashboard', 'chatbot', 'api', 'cron', 'system'];
const STATUSES: ErrorStatus[] = ['open', 'resolved', 'ignored'];
const STATUS_LABEL: Record<ErrorStatus, string> = { open: 'Open', resolved: 'Opgelost', ignored: 'Genegeerd' };

// Afgeleide-signalen tonen (critical|warning|info) — bestaande schaal behouden.
const DERIVED_TONE: Record<IssueSeverity, PillTone> = { critical: 'danger', warning: 'warn', info: 'info' };
const DERIVED_LABEL: Record<IssueSeverity, string> = { critical: 'Critical', warning: 'Aandacht', info: 'Info' };

type SP = { status?: string; sev?: string; surface?: string; org?: string };

function buildHref(sp: SP, patch: Partial<SP>): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch })) {
    if (v) merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/admindashboard/issues?${qs}` : '/admindashboard/issues';
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
    openCount === 0 ? 'Alles draait ✓' : `${openCount} open (${summary.openError} fout · ${summary.openWarning} waarschuwing)`;
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

function LoggedRow({ g }: { g: ErrorGroup }) {
  const slug = g.organizationId ? resolveOrgSlugFromId(g.organizationId) : null;
  const orgName = slug ? KNOWN_ORGS[slug].name : '—';
  return (
    <Link
      href={`/admindashboard/issues/${g.id}`}
      className="klant-convo-row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--klant-r-md)', textDecoration: 'none', color: 'var(--klant-ink)' }}
    >
      <Pill tone={SEV_TONE[g.severity]} dot>{SEV_LABEL[g.severity]}</Pill>
      <Pill tone="neutral">{SURFACE_LABEL[g.surface]}</Pill>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</div>
        <div style={{ fontSize: 12, color: 'var(--klant-muted)' }}>{g.code} · {orgName}</div>
      </div>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>{g.count}×</span>
      <span style={{ fontSize: 12, color: 'var(--klant-dim)', whiteSpace: 'nowrap' }}>{formatRelativeNL(g.lastSeenAt)}</span>
    </Link>
  );
}

function DerivedRow({ issue }: { issue: ControlRoomIssue }) {
  return (
    <Link
      href={`/admindashboard/klanten/${issue.orgSlug}?tab=${issue.tab}`}
      className="klant-convo-row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--klant-r-md)', textDecoration: 'none', color: 'var(--klant-ink)' }}
    >
      <Pill tone={DERIVED_TONE[issue.severity]} dot>{DERIVED_LABEL[issue.severity]}</Pill>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{issue.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>{issue.detail}</div>
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--klant-dim)', whiteSpace: 'nowrap' }}>{issue.orgName}</span>
    </Link>
  );
}

export default async function IssuesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  const status: ErrorStatus = STATUSES.includes(sp.status as ErrorStatus) ? (sp.status as ErrorStatus) : 'open';
  const sevParam = sp.sev ?? '';
  const severity: ErrorSeverity[] =
    sevParam === 'error' ? ['error'] : sevParam === 'all' ? ['error', 'warning', 'info'] : ['error', 'warning'];
  const surface: ErrorSurface | undefined = SURFACES.includes(sp.surface as ErrorSurface)
    ? (sp.surface as ErrorSurface)
    : undefined;
  const orgId = sp.org && resolveOrgSlugFromId(sp.org) ? sp.org : undefined;

  const [summary, groups, klanten] = await Promise.all([
    getErrorSummary(),
    listErrorGroups({ status, severity, surface, orgId }),
    getControlRoomKlanten(),
  ]);
  const derived = buildIssues(klanten);

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Issues</h1>
          <p className="klant-page-sub">
            Gelogde fouten uit alle surfaces (widget, dashboard, chatbot, API) plus live afgeleide
            signalen. Klik een fout voor de volledige context + “Kopieer voor Claude Code”.
          </p>
        </div>
        <ReloadButton />
      </header>

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
            <FilterRow label="Org">
              <Chip active={!orgId} href={buildHref(sp, { org: '' })}>Alle</Chip>
              {ALL_ORG_SLUGS.map((slug) => (
                <Chip key={slug} active={orgId === KNOWN_ORGS[slug].id} href={buildHref(sp, { org: KNOWN_ORGS[slug].id })}>
                  {KNOWN_ORGS[slug].name}
                </Chip>
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
                <LoggedRow key={g.id} g={g} />
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="klant-section-title" style={{ marginBottom: 8 }}>Afgeleide signalen (live)</div>
          {derived.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--klant-dim)', margin: 0 }}>
              Geen afgeleide signalen — alle klanten draaien zonder gedetecteerde problemen.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {derived.map((i, n) => (
                <DerivedRow key={n} issue={i} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
