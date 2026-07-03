// V1 admin — gespreks-detail (transcript).
// Toont alle berichten van een thread, ORG-gescoped via de [id]-param.
// Auth: getJorionAdminClient() gate't via requireJorionAdmin(). De org-scope
// voorkomt dat een admin ongeauthenticeerd een willekeurige thread-id kan lezen.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { getAdminThread } from '@/lib/v1/admin/klant-detail';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';
import { Card } from '@/app/klantendashboard/components/ui/card';

export const dynamic = 'force-dynamic';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

const ROLE_LABEL: Record<string, string> = { user: 'Bezoeker', assistant: 'Bot', system: 'Systeem' };
const ROLE_COLOR: Record<string, string> = {
  user: 'var(--klant-ink)',
  assistant: 'var(--klant-accent)',
  system: 'var(--klant-dim)',
};

export default async function GesprekDetailPage({
  params,
}: {
  params: Promise<{ id: string; threadId: string }>;
}) {
  const { id: orgId, threadId } = await params;

  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <>
          <h1 className="klant-page-title">Geen toegang</h1>
          <p className="klant-page-sub">Deze pagina is alleen voor Jorion-admins.</p>
        </>
      );
    }
    throw e;
  }

  const thread = await getAdminThread(admin, threadId, orgId);
  if (!thread) notFound();

  const firstQuestion = thread.messages.find((m) => m.role === 'user')?.content ?? '(geen vraag)';

  return (
    <>
      <PageHead
        eyebrow={
          <Link href={`/v1/admin/organizations/${orgId}?tab=gesprekken`}>
            ← Gesprekken
          </Link>
        }
        title={firstQuestion.slice(0, 80)}
        subtitle={`Thread · ${fmtDateTime(thread.createdAt)}`}
      />

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {thread.messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                padding: '12px 14px',
                borderRadius: 'var(--klant-r-md)',
                background: msg.role === 'user'
                  ? 'var(--klant-surface-muted)'
                  : 'var(--klant-surface)',
                border: '1px solid var(--klant-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: ROLE_COLOR[msg.role] ?? 'var(--klant-dim)' }}>
                  {ROLE_LABEL[msg.role] ?? msg.role}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--klant-dim)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtDateTime(msg.createdAt)}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--klant-ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.content}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
