// V1 Admin — Quiz-overzicht: alle quizzen over alle klant-orgs.
// Read-only lijst; authoring per klant via /v1/admin/quiz/[orgId].

import Link from 'next/link';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { listQuizzes } from '@/lib/v1/quiz/data';
import { QUIZ_STATUS_LABELS } from '@/lib/controlroom/types';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';

export const dynamic = 'force-dynamic';

export default async function V1QuizOverviewPage() {
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

  // Haal orgs op voor naam-weergave (join in memory — klein volume op V1-schaal).
  const [quizzes, orgsResult] = await Promise.all([
    listQuizzes(admin),
    admin.from('organizations').select('id, name, slug').is('deleted_at', null),
  ]);

  const orgMap = new Map(
    ((orgsResult.data ?? []) as { id: string; name: string; slug: string }[]).map((o) => [
      o.id,
      { name: o.name, slug: o.slug },
    ]),
  );

  return (
    <>
      <PageHead
        eyebrow="Admin"
        title="Quiz"
        subtitle="Overzicht van alle Kennisbank-quizzen. Start of beheer een quiz via de klantpagina."
        actions={
          <Link href="/v1/admin/organizations" className="klant-btn" data-variant="ghost">
            Klanten →
          </Link>
        }
      />

      {quizzes.length === 0 ? (
        <Card>
          <span className="klant-hint">
            Nog geen quizzen gegenereerd. Start er een via een klant{' '}→{' '}
            <Link href="/v1/admin/organizations" style={{ color: 'var(--klant-accent)' }}>
              Klanten
            </Link>
            {' → '}
            <em>Quiz</em>.
          </span>
        </Card>
      ) : (
        <Card padded={false}>
          <div style={{ overflowX: 'auto' }}>
            <table className="klant-table">
              <thead>
                <tr>
                  <th>Klant</th>
                  <th>Status</th>
                  <th>Vragen</th>
                  <th>Beantwoord</th>
                  <th>Overgeslagen</th>
                  <th>Aangemaakt</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {quizzes.map((q) => {
                  const org = orgMap.get(q.organizationId);
                  return (
                    <tr key={q.id}>
                      <td style={{ fontWeight: 500 }}>{org?.name ?? q.organizationId}</td>
                      <td style={{ fontSize: 13 }}>{QUIZ_STATUS_LABELS[q.status]}</td>
                      <td>{q.questionCount}</td>
                      <td>{q.answeredCount}</td>
                      <td>{q.skippedCount}</td>
                      <td style={{ fontSize: 12.5, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(q.createdAt).toLocaleDateString('nl-NL')}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link
                          href={`/v1/admin/quiz/${q.organizationId}`}
                          className="klant-btn"
                          data-variant="ghost"
                          style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                        >
                          Beheer →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
