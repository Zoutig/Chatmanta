'use client';

// ProjectsClient — overzicht per projectgebied (goal-prompt §15).
// Read-only kaarten met counts; klik op een tag-chip filtert /tasks via een link.

import Link from 'next/link';
import {
  PROJECT_AREAS,
  type Milestone,
  type ProjectArea,
  type Task,
} from '@/lib/commandcenter/types';
import { OwnerBadge, PriorityBadge } from './badges';

const AREA_DESCRIPTIONS: Record<ProjectArea, string> = {
  'Product / UX': 'Algemene product-richting, UX-principes, founder cockpit.',
  'RAG & AI kwaliteit': 'Hallucinatie-controle, retrieval, eval-pipeline.',
  Widget: 'Embedbare chat-widget op klantsites.',
  Dashboard: 'Klant-dashboard voor knowledge base + analytics.',
  Kennisbank: 'Document-pipeline, crawler, chunking.',
  'Backend / database': 'Supabase, migrations, schema-evolutie.',
  'Auth / accounts': 'Supabase Auth, multi-tenancy, organisaties.',
  Performance: 'Latency, cache, kosten per query.',
  'Evaluaties / testdata': 'Eval v2, judge-prompts, regressie-tests.',
  Bugs: 'Productie-bugs en regressies.',
  'Sales / testklanten': 'Outreach, demo, onboarding eerste klanten.',
  'Pricing / positionering': 'Pricing-model, packaging, doelgroep.',
  Documentatie: 'README, onboarding-docs, spec-bestanden.',
  'Deployment / hosting': 'Vercel, env-vars, domeinen.',
  'Later / ideeën': 'Toekomstige features, scope-parking.',
};

type Props = {
  tasks: Task[];
  milestones: Milestone[];
};

export function ProjectsClient({ tasks, milestones }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <header>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            fontWeight: 700,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            letterSpacing: '-0.02em',
            color: 'var(--fg)',
            backgroundClip: 'text',
          }}
        >
          Projectgebieden
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: 'var(--fg-muted)' }}>
          Per gebied: open taken, owners, blockers en milestones. Klik op een
          gebied om de filtered takenlijst te openen.
        </p>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 14,
        }}
      >
        {PROJECT_AREAS.map((area) => {
          const areaTasks = tasks.filter((t) => t.projectArea === area);
          const open = areaTasks.filter((t) => t.status !== 'Klaar');
          const seb = open.filter((t) => t.owner === 'Sebastiaan').length;
          const niels = open.filter((t) => t.owner === 'Niels').length;
          const samen = open.filter((t) => t.owner === 'Samen').length;
          const p1 = open.filter((t) => t.priority === 'P1').length;
          const p2 = open.filter((t) => t.priority === 'P2').length;
          const blocked = open.filter((t) => t.status === 'Geblokkeerd');
          const activePhases = Array.from(
            new Set(open.map((t) => t.roadmapPhase)),
          ).sort();
          const areaMilestones = milestones.filter((m) =>
            areaTasks.some((t) => m.linkedTaskIds.includes(t.id)),
          );

          return (
            <article
              key={area}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
                  }}
                >
                  {area}
                </h3>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--fg-muted)',
                    background: 'var(--surface-3)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 999,
                    padding: '2px 8px',
                  }}
                >
                  {open.length} open
                </span>
              </div>

              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: 'var(--fg-muted)',
                  lineHeight: 1.45,
                }}
              >
                {AREA_DESCRIPTIONS[area]}
              </p>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {seb > 0 && (
                  <span style={countChipStyle}>
                    <OwnerBadge owner="Sebastiaan" />
                    <span style={countNumStyle}>{seb}</span>
                  </span>
                )}
                {niels > 0 && (
                  <span style={countChipStyle}>
                    <OwnerBadge owner="Niels" />
                    <span style={countNumStyle}>{niels}</span>
                  </span>
                )}
                {samen > 0 && (
                  <span style={countChipStyle}>
                    <OwnerBadge owner="Samen" />
                    <span style={countNumStyle}>{samen}</span>
                  </span>
                )}
                {p1 > 0 && (
                  <span style={countChipStyle}>
                    <PriorityBadge priority="P1" />
                    <span style={countNumStyle}>{p1}</span>
                  </span>
                )}
                {p2 > 0 && (
                  <span style={countChipStyle}>
                    <PriorityBadge priority="P2" />
                    <span style={countNumStyle}>{p2}</span>
                  </span>
                )}
              </div>

              {blocked.length > 0 && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--err)',
                    background: 'rgba(220,90,90,0.08)',
                    border: '1px solid rgba(220,90,90,0.24)',
                    borderRadius: 8,
                    padding: '6px 10px',
                  }}
                >
                  {blocked.length} geblokkeerd
                </div>
              )}

              {activePhases.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {activePhases.map((p) => (
                    <span
                      key={p}
                      style={{
                        fontSize: 10,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        color: 'var(--fg-muted)',
                        background: 'var(--surface-3)',
                        border: '1px solid var(--border-strong)',
                        borderRadius: 999,
                        padding: '2px 8px',
                      }}
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}

              {areaMilestones.length > 0 && (
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: 8,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--fg-muted)',
                      marginBottom: 4,
                    }}
                  >
                    Milestones
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5 }}>
                    {areaMilestones.slice(0, 3).map((m) => (
                      <li
                        key={m.id}
                        style={{ color: 'var(--fg)', marginBottom: 2 }}
                      >
                        {m.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Link
                href="/commandcenter/tasks"
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  color: 'var(--fg)',
                  textDecoration: 'none',
                }}
              >
                Bekijk taken →
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}

const countChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};
const countNumStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--fg-muted)',
  fontWeight: 500,
};
