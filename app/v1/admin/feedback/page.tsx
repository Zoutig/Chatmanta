// V1 admin — Feedback-inbox.
// Auth: admin layout (requireJorionAdmin) gate't de route-group; de pagina gate't
// zelf ook (leest cross-org PII). Org-filter weggelaten: org_name komt via join in listTickets.

import Link from 'next/link';
import { requireJorionAdmin } from '@/lib/auth';
import { listTickets, getTicketSummary } from '@/lib/v1/feedback/db';
import {
  FEEDBACK_ACTIVE_STATUSES,
  FEEDBACK_CLOSED_STATUSES,
  FEEDBACK_SOURCES,
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_URGENCIES,
  FEEDBACK_URGENCY_LABELS,
  FEEDBACK_VIEWS,
  type FeedbackSource,
  type FeedbackStatus,
  type FeedbackType,
  type FeedbackUrgency,
  type FeedbackView,
} from '@/lib/controlroom/types';
import type { TicketWithOrg } from '@/lib/v1/feedback/db';
import { formatRelativeNL } from '@/lib/controlroom/format';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Badge, EmptyState, type Tone } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import { FilterChip, FilterRow } from '../_ui/filter-chips';

export const dynamic = 'force-dynamic';

const TYPE_TONE: Record<FeedbackType, Tone> = {
  antwoordkwaliteit: 'warn',
  bug: 'danger',
  dashboard: 'accent',
  feedback: 'neutral',
  wens: 'accent',
  anders: 'neutral',
};
const URGENCY_TONE: Record<FeedbackUrgency, Tone> = { low: 'neutral', normal: 'warn', high: 'danger' };
const STATUS_TONE: Record<FeedbackStatus, Tone> = {
  nieuw: 'warn',
  in_behandeling: 'accent',
  opgelost: 'ok',
  gesloten: 'neutral',
};

const VIEW_LABELS: Record<FeedbackView, string> = {
  actief: 'Open meldingen',
  afgehandeld: 'Afgehandeld',
  alle: 'Alle meldingen',
};

type SP = { view?: string; type?: string; urgency?: string; source?: string; q?: string };

function buildHref(sp: SP, patch: Partial<SP>): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch })) {
    if (v) merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/v1/admin/feedback?${qs}` : '/v1/admin/feedback';
}

function HealthStrip({ summary }: { summary: { open: number; nieuw: number } }) {
  const tone: Tone = summary.nieuw > 0 ? 'warn' : summary.open > 0 ? 'accent' : 'ok';
  const label = summary.open === 0 ? 'Geen openstaande meldingen' : `${summary.open} open, ${summary.nieuw} nieuw`;
  return (
    <div className="v1-adm-strip">
      <Badge tone={tone} dot>
        {label}
      </Badge>
    </div>
  );
}

function FeedbackRow({ f }: { f: TicketWithOrg }) {
  return (
    <li>
      <Link href={`/v1/admin/feedback/${f.id}`} className="v1-list-row v1-list-row--link">
        <Badge tone={TYPE_TONE[f.type]}>{FEEDBACK_TYPE_LABELS[f.type]}</Badge>
        <Badge tone={URGENCY_TONE[f.urgency]} dot>
          {FEEDBACK_URGENCY_LABELS[f.urgency]}
        </Badge>
        <span className="v1-list-main">
          <span className="v1-list-title">{f.description}</span>
          <span className="v1-list-meta">{f.orgName}</span>
        </span>
        <span className="v1-list-end">
          <Badge tone={STATUS_TONE[f.status]}>{FEEDBACK_STATUS_LABELS[f.status]}</Badge>
          <span className="v1-adm-muted">{formatRelativeNL(f.createdAt)}</span>
        </span>
      </Link>
    </li>
  );
}

export default async function V1FeedbackInboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireJorionAdmin(); // defense-in-depth: page-level gate naast de layout (leest cross-org PII)
  const sp = await searchParams;

  const view: FeedbackView = (FEEDBACK_VIEWS as readonly string[]).includes(sp.view ?? '')
    ? (sp.view as FeedbackView)
    : 'actief';
  const type = FEEDBACK_TYPES.includes(sp.type as FeedbackType) ? (sp.type as FeedbackType) : undefined;
  const urgency = FEEDBACK_URGENCIES.includes(sp.urgency as FeedbackUrgency) ? (sp.urgency as FeedbackUrgency) : undefined;
  const source = FEEDBACK_SOURCES.includes(sp.source as FeedbackSource) ? (sp.source as FeedbackSource) : undefined;
  const search = sp.q?.trim().slice(0, 120) || undefined;

  const statuses =
    view === 'actief' ? FEEDBACK_ACTIVE_STATUSES : view === 'afgehandeld' ? FEEDBACK_CLOSED_STATUSES : undefined;

  const [summary, items] = await Promise.all([getTicketSummary(), listTickets({ statuses, type, urgency, source, search })]);

  const extraFilters = [
    type ? FEEDBACK_TYPE_LABELS[type] : null,
    urgency ? FEEDBACK_URGENCY_LABELS[urgency] : null,
    source ? FEEDBACK_SOURCE_LABELS[source] : null,
    search ? `"${search}"` : null,
  ].filter(Boolean) as string[];
  const hasActiveFilters = view !== 'actief' || extraFilters.length > 0;
  const summaryText = [VIEW_LABELS[view], ...extraFilters].join(', ');

  return (
    <div className="v1-page">
      <PageHeader
        title="Feedback"
        description="Meldingen die klanten via hun dashboard sturen: verkeerd antwoord, fout, wens of feedback."
      />

      <HealthStrip summary={summary} />

      <section className="v1-card">
        <details className="v1-details v1-adm-filter-details" open={hasActiveFilters}>
          <summary>
            Filters <span className="v1-adm-muted">{summaryText}</span>
          </summary>
          <div className="v1-details-body v1-adm-filters">
            <FilterRow label="Weergave">
              {FEEDBACK_VIEWS.map((v) => (
                <FilterChip key={v} active={view === v} href={buildHref(sp, { view: v === 'actief' ? '' : v })}>
                  {VIEW_LABELS[v]}
                </FilterChip>
              ))}
            </FilterRow>
            <FilterRow label="Type">
              <FilterChip active={!type} href={buildHref(sp, { type: '' })}>
                Alle
              </FilterChip>
              {FEEDBACK_TYPES.map((t) => (
                <FilterChip key={t} active={type === t} href={buildHref(sp, { type: t })}>
                  {FEEDBACK_TYPE_LABELS[t]}
                </FilterChip>
              ))}
            </FilterRow>
            <FilterRow label="Urgentie">
              <FilterChip active={!urgency} href={buildHref(sp, { urgency: '' })}>
                Alle
              </FilterChip>
              {FEEDBACK_URGENCIES.map((u) => (
                <FilterChip key={u} active={urgency === u} href={buildHref(sp, { urgency: u })}>
                  {FEEDBACK_URGENCY_LABELS[u]}
                </FilterChip>
              ))}
            </FilterRow>
            <FilterRow label="Bron">
              <FilterChip active={!source} href={buildHref(sp, { source: '' })}>
                Alle
              </FilterChip>
              {FEEDBACK_SOURCES.map((s) => (
                <FilterChip key={s} active={source === s} href={buildHref(sp, { source: s })}>
                  {FEEDBACK_SOURCE_LABELS[s]}
                </FilterChip>
              ))}
            </FilterRow>
            <FilterRow label="Zoeken">
              <form method="get" action="/v1/admin/feedback" className="v1-adm-search">
                {view !== 'actief' && <input type="hidden" name="view" value={view} />}
                {type && <input type="hidden" name="type" value={type} />}
                {urgency && <input type="hidden" name="urgency" value={urgency} />}
                {source && <input type="hidden" name="source" value={source} />}
                <input
                  type="search"
                  name="q"
                  defaultValue={search ?? ''}
                  placeholder="Zoek in beschrijving of vraag"
                  aria-label="Zoek in beschrijving of vraag"
                  className="v1-input v1-input--narrow"
                />
                <button type="submit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                  Zoeken
                </button>
                {search ? (
                  <Link href={buildHref(sp, { q: '' })} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                    Wissen
                  </Link>
                ) : null}
              </form>
            </FilterRow>
          </div>
        </details>

        {items.length === 0 ? (
          <EmptyState>Geen meldingen in deze weergave.</EmptyState>
        ) : (
          <ul className="v1-list v1-adm-list">
            {items.map((f) => (
              <FeedbackRow key={f.id} f={f} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
