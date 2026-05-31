// Admin Dashboard — Quiz-overzicht (Stap 8). Alle quizzen over alle klanten:
// status, aantal vragen, beantwoord/overgeslagen, aangemaakt. Read-only; de
// trigger + goedkeuring gebeurt per klant op /admindashboard/klanten/[slug]?tab=quiz.

import Link from 'next/link';
import { resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import { listQuizzes } from '@/lib/controlroom/server/quiz';
import { QUIZ_STATUS_LABELS } from '@/lib/controlroom/types';
import { formatRelativeNL } from '@/lib/controlroom/format';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { PageHead } from '@/app/klantendashboard/components/ui/page-head';

export const dynamic = 'force-dynamic';

export default async function QuizOverviewPage() {
  const quizzes = await listQuizzes();

  return (
    <>
      <PageHead eyebrow="Admin Dashboard" title="Quiz" />
      {quizzes.length === 0 ? (
        <Card>
          <span className="klant-hint">
            Nog geen quizzen gegenereerd. Start er een via een klant → tab <strong>Quiz</strong>.
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
                  const slug = resolveOrgSlugFromId(q.organizationId);
                  return (
                    <tr key={q.id}>
                      <td style={{ fontWeight: 500 }}>{slug ?? q.organizationId}</td>
                      <td style={{ fontSize: 13 }}>{QUIZ_STATUS_LABELS[q.status]}</td>
                      <td>{q.questionCount}</td>
                      <td>{q.answeredCount}</td>
                      <td>{q.skippedCount}</td>
                      <td style={{ fontSize: 12.5, color: 'var(--klant-muted)', whiteSpace: 'nowrap' }}>
                        {formatRelativeNL(q.createdAt)}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {slug && (
                          <Link
                            href={`/admindashboard/klanten/${slug}?tab=quiz`}
                            className="klant-btn"
                            data-variant="ghost"
                            style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                          >
                            Bekijk →
                          </Link>
                        )}
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
