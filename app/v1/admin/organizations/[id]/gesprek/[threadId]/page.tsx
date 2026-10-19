// V1 admin — gespreks-detail (transcript).
// Toont alle berichten van een thread, ORG-gescoped via de [id]-param.
// Auth: getJorionAdminClient() gate't via requireJorionAdmin(). De org-scope
// voorkomt dat een admin ongeauthenticeerd een willekeurige thread-id kan lezen.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getJorionAdminClient } from '@/lib/supabase/admin';
import { isAppError } from '@/lib/errors/app-error';
import { getAdminThread, type V1AdminMessage } from '@/lib/v1/admin/klant-detail';
import { answerKindLabel } from '@/lib/v1/admin/thread-insight';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Badge, InfoTip } from '@/app/v1/_ui/feedback';
import { formatDateTime, formatEur } from '@/app/v1/admin/_ui/format';
import './gesprek.css';

export const dynamic = 'force-dynamic';

const ROLE_LABEL: Record<string, string> = { user: 'Bezoeker', assistant: 'Bot', system: 'Systeem' };

/** URL leesbaar korten tot host + pad (zelfde regel als het klant-bronnenpaneel). */
function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

const fmtMs = (ms: number | null) => (ms == null ? null : ms >= 1000 ? `${(ms / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} s` : `${ms} ms`);

/** Diagnose onder een bot-antwoord: soort, cache, latency, kosten, feedback, bronnen. */
function BotDiagnosis({ msg }: { msg: V1AdminMessage }) {
  const kind = answerKindLabel(msg.kind);
  const i = msg.insight;
  return (
    <div className="v1-adm-gs-diag">
      <div className="v1-adm-gs-tags">
        <Badge tone={kind.tone} dot>
          {kind.label}
        </Badge>
        {i ? (
          <>
            {i.fromCache ? <Badge tone="accent">Uit cache</Badge> : null}
            {i.feedback ? (
              <Badge tone={i.feedback.rating === 'up' ? 'ok' : 'danger'}>
                {i.feedback.rating === 'up' ? 'Duim omhoog' : 'Duim omlaag'}
              </Badge>
            ) : null}
            <span className="v1-adm-gs-stat">
              {[
                fmtMs(i.totalMs) ? `Antwoord in ${fmtMs(i.totalMs)}` : null,
                fmtMs(i.firstTokenMs) ? `eerste woord na ${fmtMs(i.firstTokenMs)}` : null,
                i.topSimilarity != null ? `beste overeenkomst ${Math.round(i.topSimilarity * 100)}%` : null,
                `kosten ${formatEur(i.costEur)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        ) : (
          <span className="v1-adm-gs-stat">
            Geen meetgegevens gevonden{' '}
            <InfoTip text="De meetgegevens (cache, snelheid, kosten, duim) staan in een aparte log en worden op tijdstip en vraag aan het bericht gekoppeld. Lukt dat niet zeker, dan tonen we liever niets." />
          </span>
        )}
      </div>
      {i?.feedback?.comment ? <p className="v1-adm-gs-fb">Toelichting bezoeker: {i.feedback.comment}</p> : null}
      {msg.sources && msg.sources.length > 0 ? (
        <details className="v1-adm-gs-src">
          <summary>{msg.sources.length === 1 ? '1 bron gebruikt' : `${msg.sources.length} bronnen gebruikt`}</summary>
          <ul>
            {msg.sources.map((src, idx) => (
              <li key={idx}>
                <span className="v1-adm-gs-src-title">{src.title}</span>{' '}
                <span className="v1-adm-muted">({Math.round(src.similarity * 100)}%)</span>
                {src.url ? (
                  <>
                    {' '}
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="v1-link">
                      {prettyUrl(src.url)}
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : msg.kind === 'answer' ? (
        <p className="v1-adm-gs-fb v1-adm-muted">Geen bronnen opgeslagen bij dit antwoord.</p>
      ) : null}
    </div>
  );
}

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
  const bot = thread.messages.filter((m) => m.role === 'assistant');
  const fallbacks = bot.filter((m) => m.kind === 'fallback').length;
  const cached = bot.filter((m) => m.insight?.fromCache).length;
  const downs = bot.filter((m) => m.insight?.feedback?.rating === 'down').length;

  return (
    <div className="v1-page">
      <Link href={`/v1/admin/organizations/${orgId}?tab=gesprekken`} className="v1-section-link">
        Terug naar gesprekken
      </Link>
      <PageHeader
        title={firstQuestion.slice(0, 80)}
        description={`Gesprek gestart op ${formatDateTime(thread.createdAt)} · ${bot.length} ${bot.length === 1 ? 'antwoord' : 'antwoorden'}${fallbacks ? ` · ${fallbacks} zonder antwoord` : ''}${cached ? ` · ${cached} uit cache` : ''}${downs ? ` · ${downs}× duim omlaag` : ''}`}
      />

      <section className="v1-card">
        <ol className="v1-adm-gs-list">
          {thread.messages.map((msg) => (
            <li
              key={msg.id}
              className="v1-adm-gs-msg"
              data-role={msg.role}
              data-flagged={msg.role === 'assistant' && msg.kind === 'fallback' ? '' : undefined}
            >
              <div className="v1-adm-gs-head">
                <span className="v1-adm-gs-role">{ROLE_LABEL[msg.role] ?? msg.role}</span>
                <span className="v1-adm-gs-time">{formatDateTime(msg.createdAt)}</span>
              </div>
              <p className="v1-adm-gs-text">{msg.content}</p>
              {msg.role === 'assistant' ? <BotDiagnosis msg={msg} /> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
