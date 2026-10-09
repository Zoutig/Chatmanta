// V1 admin — gespreks-detail (transcript).
// Toont alle berichten van een thread, ORG-gescoped via de [id]-param.
// Auth: getJorionAdminClient() gate't via requireJorionAdmin(). De org-scope
// voorkomt dat een admin ongeauthenticeerd een willekeurige thread-id kan lezen.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { getAdminThread } from '@/lib/v1/admin/klant-detail';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { formatDateTime } from '@/app/v1/admin/_ui/format';
import './gesprek.css';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { user: 'Bezoeker', assistant: 'Bot', system: 'Systeem' };

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
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }

  const thread = await getAdminThread(admin, threadId, orgId);
  if (!thread) notFound();

  const firstQuestion = thread.messages.find((m) => m.role === 'user')?.content ?? 'Geen vraag';

  return (
    <div className="v1-page">
      <Link href={`/v1/admin/organizations/${orgId}?tab=gesprekken`} className="v1-section-link">
        Terug naar gesprekken
      </Link>
      <PageHeader title={firstQuestion.slice(0, 80)} description={`Gesprek gestart op ${formatDateTime(thread.createdAt)}`} />

      <section className="v1-card">
        <ol className="v1-adm-gs-list">
          {thread.messages.map((msg) => (
            <li key={msg.id} className="v1-adm-gs-msg" data-role={msg.role}>
              <div className="v1-adm-gs-head">
                <span className="v1-adm-gs-role">{ROLE_LABEL[msg.role] ?? msg.role}</span>
                <span className="v1-adm-gs-time">{formatDateTime(msg.createdAt)}</span>
              </div>
              <p className="v1-adm-gs-text">{msg.content}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
