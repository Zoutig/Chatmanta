// V1 Admin — Quiz-overzicht: alle quizzen over alle klanten.
// Read-only lijst; beheer per klant via /v1/admin/quiz/[orgId].

import Link from 'next/link';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { listQuizzes } from '@/lib/v1/quiz/data';
import { QUIZ_STATUS_LABELS } from '@/lib/controlroom/types';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { EmptyState } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import { DataTable, NumCell } from '../_ui/data-table';
import { formatDate } from '../_ui/format';

export const dynamic = 'force-dynamic';

export default async function V1QuizOverviewPage() {
  let admin;
  try {
    admin = await getJorionAdminClient();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Deze pagina is alleen voor Jorion-admins." />;
    }
    throw e;
  }

  // Orgs voor naam-weergave (join in memory, klein volume op V1-schaal).
  const [quizzes, orgsResult] = await Promise.all([
    listQuizzes(admin),
    admin.from('organizations').select('id, name, slug').is('deleted_at', null),
  ]);

  const orgMap = new Map(
    ((orgsResult.data ?? []) as { id: string; name: string; slug: string }[]).map((o) => [o.id, { name: o.name, slug: o.slug }]),
  );

  return (
    <div className="v1-page">
      <PageHeader
        title="Quiz"
        description="Alle kennisbank-quizzen. Een nieuwe quiz start je vanaf de pagina van een klant."
        actions={
          <Link href="/v1/admin/organizations" className={buttonClass({ variant: 'secondary' })}>
            Naar klanten
          </Link>
        }
      />

      <section className="v1-card">
        {quizzes.length === 0 ? (
          <EmptyState
            action={
              <Link href="/v1/admin/organizations" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                Naar klanten
              </Link>
            }
          >
            Nog geen quizzen. Start er een via de pagina van een klant.
          </EmptyState>
        ) : (
          <DataTable
            label="Quizzen"
            columns={[
              { label: 'Klant' },
              { label: 'Status' },
              { label: 'Vragen', num: true },
              { label: 'Beantwoord', num: true },
              { label: 'Overgeslagen', num: true },
              { label: 'Aangemaakt' },
              { label: <span className="v1-sr-only">Actie</span>, width: '1%' },
            ]}
          >
            {quizzes.map((q) => {
              const org = orgMap.get(q.organizationId);
              return (
                <tr key={q.id}>
                  <td style={{ fontWeight: 500 }}>{org?.name ?? q.organizationId}</td>
                  <td className="v1-adm-muted">{QUIZ_STATUS_LABELS[q.status]}</td>
                  <NumCell>{q.questionCount}</NumCell>
                  <NumCell>{q.answeredCount}</NumCell>
                  <NumCell>{q.skippedCount}</NumCell>
                  <td className="v1-adm-muted" style={{ whiteSpace: 'nowrap' }}>
                    {formatDate(q.createdAt)}
                  </td>
                  <td>
                    <Link href={`/v1/admin/quiz/${q.organizationId}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                      Beheren
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </section>
    </div>
  );
}
