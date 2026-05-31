// Admin Dashboard — Feedback. Operator-inbox van klant-meldingen (admin_feedback).
// Filterbaar via URL-searchParams (RSC, geen client-state): weergave (actief/
// afgehandeld/alle), type, urgentie, bron, org, zoeken. De filters zitten in een
// inklapbaar paneel (standaard dicht) zodat de lijst de meeste ruimte krijgt.
// Standaardweergave toont alleen actieve meldingen (nieuw + in behandeling);
// afgehandelde (opgelost + gesloten) staan onder "Afgehandeld".

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import { Pill, type PillTone } from '@/app/klantendashboard/components/ui/pill';
import { getFeedbackSummary, listFeedback } from '@/lib/controlroom/server/feedback';
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
  type FeedbackItem,
  type FeedbackSource,
  type FeedbackStatus,
  type FeedbackSummary,
  type FeedbackType,
  type FeedbackUrgency,
  type FeedbackView,
} from '@/lib/controlroom/types';
import { ALL_ORG_SLUGS, KNOWN_ORGS, resolveOrgSlugFromId } from '@/lib/v0/server/active-org';
import { formatRelativeNL } from '@/lib/controlroom/format';
import { ReloadButton } from '../components/reload-button';

export const dynamic = 'force-dynamic';

const TYPE_TONE: Record<FeedbackType, PillTone> = {
  antwoordkwaliteit: 'warn',
  bug: 'danger',
  dashboard: 'info',
  feedback: 'neutral',
  wens: 'accent',
  anders: 'neutral',
};
const URGENCY_TONE: Record<FeedbackUrgency, PillTone> = { low: 'neutral', normal: 'warn', high: 'danger' };
const STATUS_TONE: Record<FeedbackStatus, PillTone> = {
  nieuw: 'warn',
  in_behandeling: 'info',
  opgelost: 'success',
  gesloten: 'neutral',
};

const VIEW_LABELS: Record<FeedbackView, string> = {
  actief: 'Open meldingen',
  afgehandeld: 'Afgehandeld',
  alle: 'Alle meldingen',
};

type SP = { view?: string; type?: string; urgency?: string; org?: string; source?: string; q?: string };

function buildHref(sp: SP, patch: Partial<SP>): string {
  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...sp, ...patch })) {
    if (v) merged[k] = v;
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `/admindashboard/feedback?${qs}` : '/admindashboard/feedback';
}

function Chip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="klant-btn"
      style={{
        fontSize: 12,
        padding: '3px 10px',
        background: active ? 'var(--klant-accent-soft)' : undefined,
        borderColor: active ? 'var(--klant-accent-border)' : undefined,
        color: active ? 'var(--klant-accent)' : undefined,
      }}
    >
      {children}
    </Link>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--klant-dim)', minWidth: 64, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function HealthStrip({ summary }: { summary: FeedbackSummary }) {
  const tone: PillTone = summary.nieuw > 0 ? 'warn' : summary.open > 0 ? 'info' : 'success';
  const label =
    summary.open === 0
      ? 'Geen openstaande meldingen ✓'
      : `${summary.open} open · ${summary.nieuw} nieuw`;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Pill tone={tone} dot>{label}</Pill>
        <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>
          Meldingen van klanten — fout bot-antwoord, bug, portaalprobleem, feedback of wens.
        </span>
      </div>
    </Card>
  );
}

function FeedbackRow({ f }: { f: FeedbackItem }) {
  const slug = resolveOrgSlugFromId(f.organizationId);
  const orgName = slug ? KNOWN_ORGS[slug].name : '—';
  return (
    <Link
      href={`/admindashboard/feedback/${f.id}`}
      className="klant-convo-row"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--klant-r-md)', textDecoration: 'none', color: 'var(--klant-ink)' }}
    >
      <Pill tone={TYPE_TONE[f.type]}>{FEEDBACK_TYPE_LABELS[f.type]}</Pill>
      <Pill tone={URGENCY_TONE[f.urgency]} dot>{FEEDBACK_URGENCY_LABELS[f.urgency]}</Pill>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {f.description}
        </div>
        <div style={{ fontSize: 12, color: 'var(--klant-muted)' }}>{orgName}</div>
      </div>
      <Pill tone={STATUS_TONE[f.status]}>{FEEDBACK_STATUS_LABELS[f.status]}</Pill>
      <span style={{ fontSize: 12, color: 'var(--klant-dim)', whiteSpace: 'nowrap' }}>{formatRelativeNL(f.createdAt)}</span>
    </Link>
  );
}

export default async function FeedbackInboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;

  const view: FeedbackView = (FEEDBACK_VIEWS as readonly string[]).includes(sp.view ?? '')
    ? (sp.view as FeedbackView)
    : 'actief';
  const type = FEEDBACK_TYPES.includes(sp.type as FeedbackType) ? (sp.type as FeedbackType) : undefined;
  const urgency = FEEDBACK_URGENCIES.includes(sp.urgency as FeedbackUrgency) ? (sp.urgency as FeedbackUrgency) : undefined;
  const source = FEEDBACK_SOURCES.includes(sp.source as FeedbackSource) ? (sp.source as FeedbackSource) : undefined;
  const orgId = sp.org && resolveOrgSlugFromId(sp.org) ? sp.org : undefined;
  const search = sp.q?.trim().slice(0, 120) || undefined;

  // Weergave → statussen. 'alle' = geen status-filter.
  const statuses =
    view === 'actief'
      ? FEEDBACK_ACTIVE_STATUSES
      : view === 'afgehandeld'
        ? FEEDBACK_CLOSED_STATUSES
        : undefined;

  const [summary, items] = await Promise.all([
    getFeedbackSummary(),
    listFeedback({ statuses, type, urgency, source, orgId, search }),
  ]);

  const orgSlug = orgId ? resolveOrgSlugFromId(orgId) : null;
  const extraFilters = [
    type ? FEEDBACK_TYPE_LABELS[type] : null,
    urgency ? FEEDBACK_URGENCY_LABELS[urgency] : null,
    source ? FEEDBACK_SOURCE_LABELS[source] : null,
    orgSlug ? KNOWN_ORGS[orgSlug].name : null,
    search ? `"${search}"` : null,
  ].filter(Boolean) as string[];
  const hasActiveFilters = view !== 'actief' || extraFilters.length > 0;
  const summaryText = [VIEW_LABELS[view], ...extraFilters].join(' · ');

  return (
    <>
      <header className="klant-page-header">
        <div>
          <h1 className="klant-page-title">Feedback &amp; meldingen</h1>
          <p className="klant-page-sub">
            Meldingen die klanten via hun portaal indienen. Open een melding voor de volledige
            context en om de status bij te werken.
          </p>
        </div>
        <ReloadButton />
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <HealthStrip summary={summary} />

        <Card>
          <details open={hasActiveFilters} style={{ marginBottom: 14 }}>
            <summary
              style={{
                cursor: 'pointer',
                listStyle: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                userSelect: 'none',
                padding: '2px 0',
              }}
            >
              <span className="klant-btn" style={{ fontSize: 12, padding: '3px 12px' }}>⚙ Filters</span>
              <span style={{ fontSize: 12.5, color: 'var(--klant-muted)' }}>{summaryText}</span>
            </summary>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <FilterRow label="Weergave">
                {FEEDBACK_VIEWS.map((v) => (
                  <Chip
                    key={v}
                    active={view === v}
                    href={buildHref(sp, { view: v === 'actief' ? '' : v })}
                  >
                    {VIEW_LABELS[v]}
                  </Chip>
                ))}
              </FilterRow>
              <FilterRow label="Type">
                <Chip active={!type} href={buildHref(sp, { type: '' })}>Alle</Chip>
                {FEEDBACK_TYPES.map((t) => (
                  <Chip key={t} active={type === t} href={buildHref(sp, { type: t })}>
                    {FEEDBACK_TYPE_LABELS[t]}
                  </Chip>
                ))}
              </FilterRow>
              <FilterRow label="Urgentie">
                <Chip active={!urgency} href={buildHref(sp, { urgency: '' })}>Alle</Chip>
                {FEEDBACK_URGENCIES.map((u) => (
                  <Chip key={u} active={urgency === u} href={buildHref(sp, { urgency: u })}>
                    {FEEDBACK_URGENCY_LABELS[u]}
                  </Chip>
                ))}
              </FilterRow>
              <FilterRow label="Bron">
                <Chip active={!source} href={buildHref(sp, { source: '' })}>Alle</Chip>
                {FEEDBACK_SOURCES.map((s) => (
                  <Chip key={s} active={source === s} href={buildHref(sp, { source: s })}>
                    {FEEDBACK_SOURCE_LABELS[s]}
                  </Chip>
                ))}
              </FilterRow>
              <FilterRow label="Org">
                <Chip active={!orgId} href={buildHref(sp, { org: '' })}>Alle</Chip>
                {ALL_ORG_SLUGS.map((slug) => (
                  <Chip key={slug} active={orgId === KNOWN_ORGS[slug].id} href={buildHref(sp, { org: KNOWN_ORGS[slug].id })}>
                    {KNOWN_ORGS[slug].name}
                  </Chip>
                ))}
              </FilterRow>
              <FilterRow label="Zoeken">
                <form method="get" action="/admindashboard/feedback" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, alignItems: 'center' }}>
                  {view !== 'actief' && <input type="hidden" name="view" value={view} />}
                  {type && <input type="hidden" name="type" value={type} />}
                  {urgency && <input type="hidden" name="urgency" value={urgency} />}
                  {source && <input type="hidden" name="source" value={source} />}
                  {orgId && <input type="hidden" name="org" value={orgId} />}
                  <input
                    type="search"
                    name="q"
                    defaultValue={search ?? ''}
                    placeholder="Zoek in beschrijving of vraag…"
                    className="klant-input"
                    style={{ maxWidth: 280, height: 30, fontSize: 12.5 }}
                  />
                  <button type="submit" className="klant-btn" style={{ fontSize: 12, padding: '3px 12px' }}>Zoek</button>
                  {search && (
                    <Link href={buildHref(sp, { q: '' })} className="klant-btn" style={{ fontSize: 12, padding: '3px 10px' }}>
                      Wis
                    </Link>
                  )}
                </form>
              </FilterRow>
            </div>
          </details>

          {items.length === 0 ? (
            <div className="klant-empty">
              <p className="klant-empty-title">Geen meldingen</p>
              <p className="klant-empty-sub">Geen feedback die aan deze weergave/filter voldoet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.map((f) => (
                <FeedbackRow key={f.id} f={f} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
