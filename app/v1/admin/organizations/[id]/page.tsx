import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import {
  getOrgConversationsThisMonth,
  getOrgSpendThisMonthEur,
  resolveDailyBudgetEur,
} from '@/lib/v1/limits/usage-limits';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { MetricCard } from '@/app/admindashboard/components/metric-card';
import { BudgetEditor } from './budget-editor';

// V1 admin — org-deep-dive. Cross-org reads via getJorionAdminClient() (service-role NÁ
// requireJorionAdmin; admin is geen org-member → RLS-session-client zou 0 rijen geven).
// De page-RSC draait óók als de layout-gate faalt, dus eigen AUTH_FORBIDDEN-afhandeling
// (defense-in-depth).
export const dynamic = 'force-dynamic';

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  daily_budget_eur: number | string | null;
  organization_members: { count: number }[] | null;
};

const SOURCE_TONE: Record<string, PillTone> = {
  ready: 'success',
  crawling: 'info',
  pending: 'neutral',
  failed: 'danger',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const sectionTitle = { fontSize: 16, fontWeight: 600, margin: '0 0 10px', color: 'var(--klant-ink)' } as const;
const labelStyle = { fontSize: 12, color: 'var(--klant-muted)' } as const;

export default async function OrgDeepDivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let admin;
  try {
    admin = await getJorionAdminClient(); // gate't intern via requireJorionAdmin
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

  const { data: org } = await admin
    .from('organizations')
    .select('id, name, slug, created_at, daily_budget_eur, organization_members(count)')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!org) notFound();
  const o = org as OrgRow;
  const memberCount = o.organization_members?.[0]?.count ?? 0;
  const capEur = resolveDailyBudgetEur(o.daily_budget_eur);

  // Chatbot eerst — nodig om kennisbronnen óók op chatbot_id te scopen (per-rule-conventie).
  const { data: chatbotData } = await admin
    .from('chatbots')
    .select('id, name, bot_version, created_at')
    .eq('organization_id', id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const chatbot = chatbotData as { id: string; name: string; bot_version: string; created_at: string } | null;

  // Kennisbronnen gescoped op org + chatbot (geen chatbot → geen bronnen).
  let sourcesQuery = admin
    .from('knowledge_sources')
    .select('id, type, normalized_host, root_url, status, created_at')
    .eq('organization_id', id)
    .is('deleted_at', null);
  if (chatbot) sourcesQuery = sourcesQuery.eq('chatbot_id', chatbot.id);

  // Parallel: kennisbronnen, deze-maand-cijfers, recente fouten.
  const [sourcesRes, conversations, spendEur, failedJobsRes, failEventsRes] =
    await Promise.all([
      sourcesQuery.order('created_at', { ascending: false }),
      getOrgConversationsThisMonth(admin, id),
      getOrgSpendThisMonthEur(admin, id),
      admin
        .from('processing_jobs')
        .select('id, error_message, created_at')
        .eq('organization_id', id)
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(10),
      admin
        .from('crawl_events')
        .select('id, message, decision, created_at')
        .eq('organization_id', id)
        .eq('event_type', 'fail')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  const sources = (sourcesRes.data ?? []) as Array<{
    id: string; type: string; normalized_host: string | null; root_url: string | null; status: string; created_at: string;
  }>;
  const failedJobs = (failedJobsRes.data ?? []) as Array<{ id: string; error_message: string | null; created_at: string }>;
  const failEvents = (failEventsRes.data ?? []) as Array<{ id: string; message: string | null; decision: string | null; created_at: string }>;
  const noErrors = failedJobs.length === 0 && failEvents.length === 0;

  return (
    <>
      <PageHead
        eyebrow={<Link href="/v1/admin/organizations">← Organisaties</Link>}
        title={o.name}
        subtitle={`slug: ${o.slug}`}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Info */}
        <section>
          <h2 style={sectionTitle}>Info</h2>
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
              <div><div style={labelStyle}>Naam</div><div>{o.name}</div></div>
              <div><div style={labelStyle}>Slug</div><div>{o.slug}</div></div>
              <div><div style={labelStyle}>Aangemaakt</div><div>{fmtDate(o.created_at)}</div></div>
              <div><div style={labelStyle}>Leden</div><div>{memberCount}</div></div>
            </div>
          </Card>
        </section>

        {/* Chatbot */}
        <section>
          <h2 style={sectionTitle}>Chatbot</h2>
          <Card>
            {chatbot ? (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong>{chatbot.name}</strong>
                <Pill tone="accent">{chatbot.bot_version}</Pill>
                <span style={labelStyle}>aangemaakt {fmtDate(chatbot.created_at)}</span>
              </div>
            ) : (
              <p style={labelStyle}>Geen chatbot geconfigureerd.</p>
            )}
          </Card>
        </section>

        {/* Kennisbronnen */}
        <section>
          <h2 style={sectionTitle}>Kennisbronnen ({sources.length})</h2>
          <Card padded={false}>
            {sources.length === 0 ? (
              <p style={{ ...labelStyle, padding: 16 }}>Nog geen kennisbronnen.</p>
            ) : (
              <table className="klant-table">
                <thead><tr><th>Type</th><th>Host / URL</th><th>Status</th></tr></thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.id}>
                      <td>{s.type}</td>
                      <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.normalized_host ?? s.root_url ?? '—'}
                      </td>
                      <td><Pill tone={SOURCE_TONE[s.status] ?? 'neutral'}>{s.status}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </section>

        {/* Deze maand + budget */}
        <section>
          <h2 style={sectionTitle}>Deze maand</h2>
          <div className="klant-metrics-grid">
            <MetricCard label="Gesprekken (turns)" value={conversations} sub="deze kalendermaand" />
            <MetricCard label="Kosten" value={`€${spendEur.toFixed(2)}`} sub="deze kalendermaand" />
            <MetricCard
              label="Dagbudget"
              value={capEur === 0 ? 'uit' : `€${capEur.toFixed(2)}`}
              tone={capEur === 0 ? 'warn' : 'ink'}
              sub="per dag (cap)"
            />
          </div>
          <Card style={{ marginTop: 12 }}>
            <h3 style={{ ...sectionTitle, fontSize: 14 }}>Dagbudget aanpassen</h3>
            <p style={{ ...labelStyle, margin: '0 0 10px' }}>
              0 = budget uit (bot weigert bij overschrijding). Bovengrens €1000/dag.
            </p>
            <BudgetEditor orgId={o.id} currentEur={capEur} />
          </Card>
        </section>

        {/* Recente fouten */}
        <section>
          <h2 style={sectionTitle}>Recente fouten</h2>
          <Card>
            {noErrors ? (
              <p style={labelStyle}>Geen recente fouten.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {failedJobs.length > 0 && (
                  <div>
                    <div style={{ ...labelStyle, marginBottom: 6 }}>Mislukte verwerkings-jobs</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {failedJobs.map((j) => (
                        <li key={j.id}>
                          <span style={{ color: 'var(--klant-danger)' }}>{j.error_message ?? 'onbekende fout'}</span>
                          <span style={{ ...labelStyle, marginLeft: 8 }}>{fmtDateTime(j.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {failEvents.length > 0 && (
                  <div>
                    <div style={{ ...labelStyle, marginBottom: 6 }}>Crawl-fouten</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {failEvents.map((e) => (
                        <li key={e.id}>
                          <span style={{ color: 'var(--klant-danger)' }}>{e.message ?? e.decision ?? 'crawl-fout'}</span>
                          <span style={{ ...labelStyle, marginLeft: 8 }}>{fmtDateTime(e.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
