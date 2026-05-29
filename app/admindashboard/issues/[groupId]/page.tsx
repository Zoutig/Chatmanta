// Admin Dashboard — fout-detail. Volledige context van één admin_error_groups-rij
// + de headline-knop "Kopieer voor Claude Code" (server-gebouwde, PII-geredigeerde
// markdown) + status-acties (opgelost/negeer/heropen). Org komt uit de groep-rij.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getErrorGroup } from '@/lib/controlroom/server/errors';
import { buildClaudePayload } from '@/lib/observability/claude-payload';
import { KNOWN_ORGS, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import type { ErrorSeverity } from '@/lib/observability/sink';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { formatDateNL, formatRelativeNL } from '@/lib/controlroom/format';
import { CopyButton } from '../../components/copy-button';
import { ErrorStatusActions } from './components/status-actions';

export const dynamic = 'force-dynamic';

const SEV_TONE: Record<ErrorSeverity, PillTone> = { error: 'danger', warning: 'warn', info: 'info' };
const SEV_LABEL: Record<ErrorSeverity, string> = { error: 'Fout', warning: 'Waarschuwing', info: 'Info' };

const codeBlock = {
  background: 'var(--klant-surface-muted)',
  border: '1px solid var(--klant-border)',
  borderRadius: 'var(--klant-r-md)',
  padding: 12,
  fontSize: 12,
  fontFamily: 'var(--klant-font-mono)',
  overflowX: 'auto' as const,
  margin: 0,
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--klant-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 13.5, marginTop: 3, color: 'var(--klant-ink)', wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

export default async function ErrorGroupDetail({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const group = await getErrorGroup(groupId);
  if (!group) notFound();

  const slug = group.organizationId ? resolveOrgSlugFromId(group.organizationId) : null;
  const orgName = slug ? KNOWN_ORGS[slug].name : null;
  const payload = buildClaudePayload(group, { orgName: orgName ?? undefined });
  const c = group.context ?? {};

  return (
    <>
      <PageHead
        eyebrow={`Issues · ${group.surface}`}
        title={group.title}
        actions={
          <>
            <Pill tone={SEV_TONE[group.severity]} dot>{SEV_LABEL[group.severity]}</Pill>
            <Pill tone={group.status === 'open' ? 'warn' : group.status === 'resolved' ? 'success' : 'neutral'}>
              {group.status}
            </Pill>
          </>
        }
      />

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <CopyButton text={payload} label="Kopieer voor Claude Code" />
          <ErrorStatusActions id={group.id} status={group.status} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
          <Row label="Code" value={group.code} />
          <Row label="Surface" value={group.surface} />
          <Row label="Org" value={orgName ?? group.organizationId ?? '—'} />
          <Row label="Voorgekomen" value={`${group.count}×`} />
          <Row label="Eerst gezien" value={formatDateNL(group.firstSeenAt)} />
          <Row label="Laatst gezien" value={formatRelativeNL(group.lastSeenAt)} />
          <Row label="Request-ID" value={c.requestId} />
          <Row label="Route" value={[c.method, c.route].filter(Boolean).join(' ') || undefined} />
          <Row label="Bot-versie" value={c.botVersion} />
          <Row label="Commit" value={c.commit} />
          <Row label="Env" value={c.env} />
          <Row label="Origin verdacht" value={c.originSuspect ? 'ja' : undefined} />
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="klant-section-title" style={{ marginBottom: 8 }}>Foutmelding</div>
        <p style={{ fontSize: 13.5, margin: 0, color: 'var(--klant-ink)', wordBreak: 'break-word' }}>
          {group.message ?? group.title}
        </p>
        {c.inputRedacted ? (
          <>
            <div className="klant-section-title" style={{ margin: '14px 0 6px' }}>Gebruikersinvoer (PII-geredigeerd)</div>
            <p style={{ fontSize: 13, margin: 0, color: 'var(--klant-muted)', wordBreak: 'break-word' }}>{c.inputRedacted}</p>
          </>
        ) : null}
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="klant-section-title" style={{ marginBottom: 8 }}>Stacktrace</div>
        <pre style={codeBlock}>{c.stack || c.topFrame || '(geen stacktrace beschikbaar)'}</pre>
      </Card>

      <Card>
        <div className="klant-section-title" style={{ marginBottom: 8 }}>Claude Code-payload (preview)</div>
        <pre style={codeBlock}>{payload}</pre>
        <div style={{ marginTop: 10 }}>
          <Link href="/admindashboard/issues" className="klant-btn">← Terug naar Issues</Link>
        </div>
      </Card>
    </>
  );
}
