// V1 Overzicht — kleine presentationele secties, gevoed met V1-data
// (lib/v1/dashboard/metrics). Server-components, klant.css-tokens. JSX gekopieerd
// uit het V0-klantendashboard (top-questions-bars / triage-panel / setup-checklist)
// maar zónder de V0-routes — V1 linkt naar de eigen /v1/app-paden.

import Link from 'next/link';
import { Card } from '@/app/klantendashboard/components/ui/card';
import type { TopQuestion, UnansweredItem } from '@/lib/v1/dashboard/metrics';

// "Meest gestelde vragen" als bar-lijst (kopie van top-questions-bars, V0-link weg).
export function TopQuestions({ items }: { items: TopQuestion[] }) {
  const max = items.length > 0 ? items[0].count : 1;
  return (
    <Card style={{ padding: '16px 20px' }}>
      <h3 className="klant-section-title">Meest gestelde vragen</h3>
      <p className="klant-section-help">Wat bezoekers het vaakst aan je chatbot vragen.</p>
      {items.length === 0 ? (
        <div style={{ padding: '12px 4px', fontSize: 13, color: 'var(--klant-dim)', lineHeight: 1.5 }}>
          Nog geen vragen. Zodra bezoekers met je chatbot praten, zie je hier wat het vaakst gevraagd
          wordt.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((q) => {
            const w = Math.max(4, Math.round((q.count / max) * 100));
            return (
              <li key={q.question}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 12,
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--klant-ink)', lineHeight: 1.3 }}>{q.question}</span>
                  <span
                    style={{
                      fontFamily: 'var(--klant-font-mono)',
                      fontSize: 11.5,
                      color: 'var(--klant-muted)',
                      flexShrink: 0,
                    }}
                  >
                    {q.count}
                  </span>
                </div>
                <div style={{ height: 3, background: 'var(--klant-surface-muted)', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${w}%`,
                      height: '100%',
                      background: q.unanswered ? 'var(--klant-warn)' : 'var(--klant-accent)',
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Onbeantwoorde vragen (gedegradeerde TriagePanel — geen thread-entiteit in V1, dus
// alleen de vraagtekst + frequentie, geen "bekijk gesprek").
export function UnansweredQuestions({ items }: { items: UnansweredItem[] }) {
  if (items.length === 0) {
    return (
      <Card style={{ padding: '16px 20px' }}>
        <h3 className="klant-section-title">Onbeantwoorde vragen</h3>
        <p style={{ fontSize: 13, color: 'var(--klant-muted)', margin: 0, lineHeight: 1.5 }}>
          Alles is afgehandeld — er zijn geen vragen waar je chatbot geen antwoord op had.
        </p>
      </Card>
    );
  }
  return (
    <Card style={{ padding: '16px 20px' }}>
      <h3 className="klant-section-title">Onbeantwoorde vragen</h3>
      <p className="klant-section-help">
        Vragen waar je chatbot geen antwoord op had. Voeg kennis toe zodat hij ze vanaf het volgende
        gesprek wél beantwoordt.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
        {items.map((u, i) => (
          <li
            key={u.question}
            style={{
              display: 'flex',
              gap: 12,
              padding: '11px 0',
              borderTop: i ? '1px solid var(--klant-border)' : 'none',
              alignItems: 'baseline',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--klant-font-mono)',
                fontSize: 11,
                color: 'var(--klant-dim)',
                width: 22,
                flexShrink: 0,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: 'var(--klant-ink)', lineHeight: 1.35 }}>{u.question}</div>
              <div
                style={{
                  fontFamily: 'var(--klant-font-mono)',
                  fontSize: 11.5,
                  color: 'var(--klant-muted)',
                  marginTop: 3,
                }}
              >
                {u.occurrences}× gesteld
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Compacte onboarding-checklist uit de 3 setup-signalen. Linkt naar de V1-paden.
export function SetupChecklist({
  setup,
}: {
  setup: { hasDocument: boolean; hasKnowledgeSource: boolean; hasTraffic: boolean };
}) {
  const steps = [
    { done: setup.hasKnowledgeSource, title: 'Koppel een website', href: '/v1/app/kennisbank' },
    { done: setup.hasDocument, title: 'Voeg kennis toe aan je kennisbank', href: '/v1/app/kennisbank' },
    { done: setup.hasTraffic, title: 'Test je chatbot', href: '/v1/app/preview' },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 className="klant-section-title">Aan de slag</h3>
          <p style={{ fontSize: 12, color: 'var(--klant-muted)', margin: 0 }}>
            {doneCount} van {steps.length} stappen voltooid — klik door om de rest te doen.
          </p>
        </div>
        <span style={{ fontFamily: 'var(--klant-font-mono)', fontSize: 12, color: 'var(--klant-muted)' }}>
          {doneCount}/{steps.length}
        </span>
      </div>
      <div style={{ height: 4, background: 'var(--klant-surface-muted)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--klant-accent)' }} />
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {steps.map((s) => (
          <li key={s.title} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px' }}>
            <span
              aria-hidden
              style={{
                width: 20,
                height: 20,
                borderRadius: 999,
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                fontSize: 12,
                fontWeight: 700,
                background: s.done ? 'var(--klant-success-soft)' : 'var(--klant-surface-muted)',
                color: s.done ? 'var(--klant-success)' : 'var(--klant-dim)',
                border: s.done ? '1px solid var(--klant-success-border)' : '1.5px dashed var(--klant-border-strong)',
              }}
            >
              {s.done ? '✓' : ''}
            </span>
            {s.done ? (
              <span style={{ fontSize: 14, color: 'var(--klant-fg-muted)', textDecoration: 'line-through' }}>
                {s.title}
              </span>
            ) : (
              <Link href={s.href} style={{ fontSize: 14, color: 'var(--klant-fg)', textDecoration: 'none' }}>
                {s.title}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
