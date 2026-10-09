// V1 admin — fout-detail (V1-ontwerplaag; port van de V0-admin-foutdetail).
// V1-aanpassingen:
//   * getErrorGroup via lib/v1/admin/errors (getJorionAdminClient).
//   * orgName komt via JOIN in getErrorGroup (geen KNOWN_ORGS).
//   * CopyButton uit de V1-admin-bouwstenen (met toast).
//   * Terug-link → /v1/admin/issues.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { isAppError } from '@/lib/errors/app-error';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { getErrorGroup } from '@/lib/v1/admin/errors';
import { buildClaudePayload } from '@/lib/observability/claude-payload';
import { formatRelativeNL } from '@/lib/controlroom/format';
import type { ErrorSeverity, ErrorStatus } from '@/lib/observability/sink';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Panel, Rows, Row } from '@/app/v1/_ui/panel';
import { Badge, type Tone } from '@/app/v1/_ui/feedback';
import { CopyButton } from '@/app/v1/admin/_ui/copy-button';
import { formatDate } from '@/app/v1/admin/_ui/format';
import { ErrorStatusActionsV1 } from './components/status-actions';
import './detail.css';

export const dynamic = 'force-dynamic';

const SEV_TONE: Record<ErrorSeverity, Tone> = { error: 'danger', warning: 'warn', info: 'accent' };
const SEV_LABEL: Record<ErrorSeverity, string> = { error: 'Fout', warning: 'Waarschuwing', info: 'Info' };
const STATUS_TONE: Record<ErrorStatus, Tone> = { open: 'warn', resolved: 'ok', ignored: 'neutral' };
const STATUS_LABEL: Record<ErrorStatus, string> = { open: 'Open', resolved: 'Opgelost', ignored: 'Genegeerd' };

/** Lees-rij die (zoals voorheen) wegvalt als er geen waarde is. */
function OptionalRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return <Row label={label}>{value}</Row>;
}

export default async function V1ErrorGroupDetail({ params }: { params: Promise<{ groupId: string }> }) {
  try {
    await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }

  const { groupId } = await params;
  const group = await getErrorGroup(groupId);
  if (!group) notFound();

  // orgName via JOIN in getErrorGroup; buildClaudePayload verwacht optioneel orgName.
  const payload = buildClaudePayload(group, { orgName: group.orgName ?? undefined });
  const c = group.context ?? {};

  return (
    <div className="v1-page">
      <Link href="/v1/admin/issues" className="v1-section-link">Terug naar Issues</Link>

      <PageHeader
        title={group.title}
        description={`Issues · ${group.surface}`}
        actions={
          <>
            <Badge tone={SEV_TONE[group.severity]} dot>{SEV_LABEL[group.severity]}</Badge>
            <Badge tone={STATUS_TONE[group.status] ?? 'neutral'}>{STATUS_LABEL[group.status] ?? group.status}</Badge>
          </>
        }
      />

      <Panel id="fout-gegevens" title="Gegevens" meta={<CopyButton text={payload} label="Kopieer voor Claude Code" />}>
        <Rows>
          <Row label="Status wijzigen">
            <ErrorStatusActionsV1 id={group.id} status={group.status} />
          </Row>
          <OptionalRow label="Code" value={group.code} />
          <OptionalRow label="Onderdeel" value={group.surface} />
          <Row label="Organisatie">{group.orgName ?? group.organizationId ?? 'Geen'}</Row>
          <Row label="Voorgekomen">{`${group.count}×`}</Row>
          <Row label="Eerst gezien">{formatDate(group.firstSeenAt)}</Row>
          <Row label="Laatst gezien">{formatRelativeNL(group.lastSeenAt)}</Row>
          <OptionalRow label="Request-ID" value={c.requestId} />
          <OptionalRow label="Route" value={[c.method, c.route].filter(Boolean).join(' ') || undefined} />
          <OptionalRow label="Bot-versie" value={c.botVersion} />
          <OptionalRow label="Commit" value={c.commit} />
          <OptionalRow label="Omgeving" value={c.env} />
          <OptionalRow label="Origin verdacht" value={c.originSuspect ? 'Ja' : undefined} />
        </Rows>
      </Panel>

      <section className="v1-card">
        <h2 className="v1-section-title v1-adm-iss-head">Foutmelding</h2>
        <p className="v1-adm-iss-text">{group.message ?? group.title}</p>
        {c.inputRedacted ? (
          <>
            <h3 className="v1-adm-iss-sub">Gebruikersinvoer (PII-geredigeerd)</h3>
            <p className="v1-adm-iss-input">{c.inputRedacted}</p>
          </>
        ) : null}
      </section>

      <section className="v1-card">
        <h2 className="v1-section-title v1-adm-iss-head">Stacktrace</h2>
        <pre className="v1-adm-iss-pre">{c.stack || c.topFrame || '(geen stacktrace beschikbaar)'}</pre>
      </section>

      <details className="v1-details">
        <summary>Claude Code-payload (voorbeeld)</summary>
        <div className="v1-details-body">
          <pre className="v1-adm-iss-pre">{payload}</pre>
        </div>
      </details>
    </div>
  );
}
