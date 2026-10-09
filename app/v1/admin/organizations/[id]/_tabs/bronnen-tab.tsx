// V1 admin — Bronnen tab (server RSC, read-only).
// V1: gecrawlde pagina's = documents met source_url NOT NULL (geen website_pages-tabel).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listAdminSources } from '@/lib/v1/admin/klant-detail';
import { Badge, EmptyState, type Tone } from '@/app/v1/_ui/feedback';
import { DataTable, NumCell } from '@/app/v1/admin/_ui/data-table';
import { AdminUploadDoc } from '../admin-upload-doc';

// knowledge_sources.status CHECK: pending | crawling | ready | failed (V1 migr 0003).
const SOURCE_STATUS: Record<string, { tone: Tone; label: string }> = {
  ready: { tone: 'ok', label: 'Klaar' },
  crawling: { tone: 'accent', label: 'Bezig met ophalen' },
  pending: { tone: 'neutral', label: 'Wachtend' },
  failed: { tone: 'danger', label: 'Mislukt' },
};

const SOURCE_TYPE: Record<string, string> = { website: 'Website' };

export async function BronnenTab({ orgId, chatbotId }: { orgId: string; chatbotId: string | null }) {
  const admin = await getJorionAdminClient();
  const sources = await listAdminSources(admin, orgId, chatbotId);

  return (
    <div className="v1-stack">
      {/* WP5c — upload namens de klant */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Document uploaden namens de klant</h2>
        </div>
        <AdminUploadDoc orgId={orgId} chatbotId={chatbotId} />
      </section>

      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Kennisbronnen</h2>
        </div>
        {sources.length === 0 ? (
          <EmptyState>Nog geen kennisbronnen voor deze organisatie.</EmptyState>
        ) : (
          <DataTable
            label="Kennisbronnen"
            columns={[
              { label: 'Type' },
              { label: 'Website' },
              { label: 'Status' },
              { label: 'Documenten', num: true },
              { label: 'Opgehaalde pagina’s', num: true },
            ]}
          >
            {sources.map((s) => {
              const status = SOURCE_STATUS[s.status] ?? { tone: 'neutral' as const, label: s.status };
              return (
                <tr key={s.id}>
                  <td>{SOURCE_TYPE[s.type] ?? s.type}</td>
                  <td>
                    <span className="v1-adm-clip">{s.normalizedHost ?? s.rootUrl ?? 'Onbekend'}</span>
                  </td>
                  <td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </td>
                  <NumCell>{s.documentCount}</NumCell>
                  <NumCell>{s.crawledPageCount}</NumCell>
                </tr>
              );
            })}
          </DataTable>
        )}
      </section>
    </div>
  );
}
