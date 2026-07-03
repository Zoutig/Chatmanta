// V1 admin — Gesprekken tab (server RSC).
// Lijst van threads voor deze org, nieuwste eerst. Link naar gesprek-detail.

import Link from 'next/link';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listAdminThreads } from '@/lib/v1/admin/klant-detail';
import { Card } from '@/app/klantendashboard/components/ui/card';

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} uur geleden`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'dag' : 'dagen'} geleden`;
}

const dim = { fontSize: 12, color: 'var(--klant-muted)' } as const;

export async function GesprekkenTab({ orgId }: { orgId: string }) {
  const admin = await getJorionAdminClient();
  const threads = await listAdminThreads(admin, orgId, 50);

  if (threads.length === 0) {
    return <Card><p style={dim}>Nog geen gesprekken voor deze organisatie.</p></Card>;
  }

  return (
    <Card padded={false}>
      <div style={{ overflowX: 'auto' }}>
        <table className="klant-table">
          <thead>
            <tr>
              <th>Laatste activiteit</th>
              <th>Eerste vraag</th>
              <th>Berichten</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {threads.map((t) => (
              <tr key={t.id}>
                <td style={{ ...dim, whiteSpace: 'nowrap' }}>{fmtRelative(t.lastMessageAt)}</td>
                <td style={{ fontSize: 13, maxWidth: 400 }}>
                  <Link
                    href={`/v1/admin/organizations/${orgId}/gesprek/${t.id}`}
                    style={{ color: 'var(--klant-ink)', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {t.firstQuestion}
                  </Link>
                </td>
                <td style={{ fontSize: 13 }}>{t.messageCount}</td>
                <td>
                  {t.unanswered ? (
                    <span style={{ fontSize: 12, color: 'var(--klant-warn)', fontWeight: 500 }}>Onbeantwoord</span>
                  ) : (
                    <span style={{ ...dim }}>Beantwoord</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <Link
                    href={`/v1/admin/organizations/${orgId}/gesprek/${t.id}`}
                    className="klant-btn"
                    data-variant="ghost"
                    style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                  >
                    Bekijk →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
