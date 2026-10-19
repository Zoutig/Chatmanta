// V1 admin — Bronnen tab (server RSC, read-only).
// V1: gecrawlde pagina's = documents met source_url NOT NULL (geen website_pages-tabel).

import { getJorionAdminClient } from '@/lib/supabase/admin';
import { listAdminSources } from '@/lib/v1/admin/klant-detail';
import { Badge, EmptyState, type Tone } from '@/app/v1/_ui/feedback';
import { DataTable, NumCell } from '@/app/v1/admin/_ui/data-table';
import { AdminUploadDoc } from '../admin-upload-doc';
import Link from 'next/link';
import { getActiveQuizForOrg } from '@/lib/v1/quiz/data';
import { QUIZ_STATUS_LABELS, type QuizStatus } from '@/lib/controlroom/types';
import { buttonClass } from '@/app/v1/_ui/button';
import { formatDate } from '@/app/v1/admin/_ui/format';

// Statussen waarin opnieuw genereren kan (spiegelt QUIZ_RETRIGGERABLE in quiz/actions.ts).
const QUIZ_CAN_GENERATE = new Set<QuizStatus>(['concept', 'leeg', 'mislukt', 'generating']);
const QUIZ_TONE: Record<QuizStatus, Tone> = {
  generating: 'accent',
  concept: 'warn',
  actief: 'ok',
  voltooid: 'ok',
  geannuleerd: 'neutral',
  leeg: 'neutral',
  mislukt: 'danger',
};

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
  const [sources, quiz] = await Promise.all([
    listAdminSources(admin, orgId, chatbotId),
    getActiveQuizForOrg(admin, orgId).catch(() => null),
  ]);
  const quizHref = `/v1/admin/quiz/${orgId}`;

  return (
    <div className="v1-stack">
      {/* WP5c — upload namens de klant */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Document uploaden namens de klant</h2>
        </div>
        <AdminUploadDoc orgId={orgId} chatbotId={chatbotId} />
      </section>

      {/* Kennisbank-quiz: status + ingang (genereren/beoordelen gebeurt op de quizpagina,
          die de lange analyse-call aankan: maxDuration 120). */}
      <section className="v1-card">
        <div className="v1-adm-card-head">
          <h2 className="v1-section-title">Kennisbank-quiz</h2>
          {quiz ? (
            <Badge tone={QUIZ_TONE[quiz.status]} dot>
              {QUIZ_STATUS_LABELS[quiz.status]}
            </Badge>
          ) : (
            <Badge>Nog geen quiz</Badge>
          )}
        </div>
        <p className="v1-adm-muted" style={{ margin: '0 0 12px' }}>
          {!quiz
            ? 'De AI zoekt welke informatie in de kennisbank ontbreekt en maakt er vragen voor de klant van. Jij keurt ze goed voordat de klant ze ziet. Genereren kost OpenAI-tegoed.'
            : quiz.status === 'actief' || quiz.status === 'voltooid'
              ? `${quiz.questionCount} vragen, ${quiz.answeredCount} beantwoord, ${quiz.skippedCount} overgeslagen${quiz.activatedAt ? ` (actief sinds ${formatDate(quiz.activatedAt)})` : ''}.`
              : quiz.status === 'concept'
                ? `${quiz.questionCount} vragen wachten op jouw goedkeuring.`
                : quiz.status === 'mislukt'
                  ? `De analyse is mislukt${quiz.error ? `: ${quiz.error}` : ''}.`
                  : `Aangemaakt op ${formatDate(quiz.createdAt)}.`}
        </p>
        <div className="v1-adm-inline">
          {!quiz || QUIZ_CAN_GENERATE.has(quiz.status) ? (
            <Link href={quizHref} className={buttonClass({ size: 'sm' })}>
              {!quiz ? 'Quiz genereren' : quiz.status === 'concept' ? 'Vragen beoordelen' : 'Opnieuw genereren'}
            </Link>
          ) : null}
          <Link href={quizHref} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Naar de quiz
          </Link>
        </div>
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
