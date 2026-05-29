// Control Room — Issues (MD §15). Afgeleide faalsignalen over alle orgs,
// gegroepeerd op severity, elk gelinkt naar de relevante klantdetail-tab.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { getControlRoomKlanten } from '@/lib/controlroom/server/overview';
import { buildIssues, type ControlRoomIssue, type IssueSeverity } from '@/lib/controlroom/server/issues';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<IssueSeverity, PillTone> = {
  critical: 'danger',
  warning: 'warn',
  info: 'info',
};
const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: 'Critical',
  warning: 'Aandacht',
  info: 'Info',
};

function IssueRow({ issue }: { issue: ControlRoomIssue }) {
  return (
    <Link
      href={`/controlroom/klanten/${issue.orgSlug}?tab=${issue.tab}`}
      className="klant-convo-row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--klant-r-md)', textDecoration: 'none', color: 'var(--klant-ink)' }}
    >
      <Pill tone={SEVERITY_TONE[issue.severity]} dot>{SEVERITY_LABEL[issue.severity]}</Pill>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{issue.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>{issue.detail}</div>
      </div>
      <span style={{ fontSize: 12.5, color: 'var(--klant-dim)', whiteSpace: 'nowrap' }}>{issue.orgName}</span>
    </Link>
  );
}

export default async function IssuesPage() {
  const klanten = await getControlRoomKlanten();
  const issues = buildIssues(klanten);
  const critical = issues.filter((i) => i.severity === 'critical');
  const warning = issues.filter((i) => i.severity === 'warning');
  const info = issues.filter((i) => i.severity === 'info');

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Issues</h1>
          <p className="klant-page-sub">
            Afgeleid uit bestaande faalsignalen (gefaalde crawls, hoge fallback, widget-status,
            technische status). Geen aparte error-tabel — dit is een live afleiding.
          </p>
        </div>
      </header>

      {issues.length === 0 ? (
        <div className="klant-empty">
          <p className="klant-empty-title">Geen open issues 🎉</p>
          <p className="klant-empty-sub">Alle klanten draaien zonder gedetecteerde problemen.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {critical.length > 0 && (
            <Card>
              <div className="klant-section-title" style={{ marginBottom: 8, color: 'var(--klant-danger)' }}>Critical ({critical.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{critical.map((i, n) => <IssueRow key={n} issue={i} />)}</div>
            </Card>
          )}
          {warning.length > 0 && (
            <Card>
              <div className="klant-section-title" style={{ marginBottom: 8, color: 'var(--klant-warn)' }}>Aandacht ({warning.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{warning.map((i, n) => <IssueRow key={n} issue={i} />)}</div>
            </Card>
          )}
          {info.length > 0 && (
            <Card>
              <div className="klant-section-title" style={{ marginBottom: 8 }}>Info ({info.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{info.map((i, n) => <IssueRow key={n} issue={i} />)}</div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
