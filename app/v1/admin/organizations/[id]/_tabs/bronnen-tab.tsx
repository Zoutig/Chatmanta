// V1 admin — Bronnen tab (server RSC, read-only).
// V1: gecrawlde pagina's = documents met source_url NOT NULL (geen website_pages-tabel).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listAdminSources } from '@/lib/v1/admin/klant-detail';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';

const SOURCE_TONE: Record<string, PillTone> = {
  ready: 'success',
  crawling: 'info',
  pending: 'neutral',
  failed: 'danger',
};

const dim = { fontSize: 12, color: 'var(--klant-muted)' } as const;

export async function BronnenTab({ orgId, chatbotId }: { orgId: string; chatbotId: string | null }) {
  const admin = await getJorionAdminClient();
  const sources = await listAdminSources(admin, orgId, chatbotId);

  if (sources.length === 0) {
    return <Card><p style={dim}>Nog geen kennisbronnen voor deze organisatie.</p></Card>;
  }

  return (
    <Card padded={false}>
      <div style={{ overflowX: 'auto' }}>
        <table className="klant-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Host / URL</th>
              <th>Status</th>
              <th>Docs</th>
              <th>Gecrawld</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td style={{ fontSize: 12.5 }}>{s.type}</td>
                <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                  {s.normalizedHost ?? s.rootUrl ?? '—'}
                </td>
                <td><Pill tone={SOURCE_TONE[s.status] ?? 'neutral'}>{s.status}</Pill></td>
                <td style={{ fontSize: 13 }}>{s.documentCount}</td>
                <td style={{ fontSize: 13 }}>{s.crawledPageCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
