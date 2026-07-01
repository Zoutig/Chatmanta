'use client';

// V1-fork van app/klantendashboard/components/setup-checklist.tsx.
// Visueel identiek aan V0 — JSX/CSS-tokens ongewijzigd. Twee verschillen:
//   1. Steps worden gegenereerd uit V1-setup-booleans (geen SetupStep[]-prop).
//   2. Skip-mechanisme is localStorage ipv de V0 server-action + router.refresh().
//      Reden: V1 heeft geen setSetupStepSkippedAction; client-state + LS is even
//      duurzaam en vereist geen extra server-round-trip.
// klant-setup-step / klant-setup-skip CSS-klassen zitten al in klant.css (gedeeld).

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check, Circle, Loader2 } from 'lucide-react';

const LS_KEY = 'klant-v1-setup-skipped';

function loadSkipped(): Set<string> {
  try {
    const s = window.localStorage.getItem(LS_KEY);
    return s ? new Set(JSON.parse(s) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSkipped(ids: Set<string>): void {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage onbereikbaar → skipstate leeft alleen in react-state deze sessie.
  }
}

// V1-stap definitie (bewust los van SetupStepId — V1 heeft eigen stap-IDs).
type V1Step = {
  id: string;
  title: string;
  status: 'completed' | 'in_progress' | 'todo';
  href?: string;
};

function buildSteps(
  setup: { hasDocument: boolean; hasKnowledgeSource: boolean; hasTraffic: boolean },
  widgetInstalled: boolean,
  skipped: Set<string>,
): V1Step[] {
  function status(done: boolean, id: string): V1Step['status'] {
    return done || skipped.has(id) ? 'completed' : 'todo';
  }
  return [
    {
      id: 'add_website',
      title: 'Koppel een website of voeg een bron toe',
      href: '/v1/app/kennisbank',
      status: status(setup.hasKnowledgeSource, 'add_website'),
    },
    {
      id: 'verify_sources',
      title: 'Controleer je kennisbank',
      href: '/v1/app/kennisbank',
      status: status(setup.hasDocument, 'verify_sources'),
    },
    {
      id: 'test_questions',
      title: 'Test je chatbot',
      href: '/v1/app/preview',
      status: status(setup.hasTraffic, 'test_questions'),
    },
    {
      id: 'install_widget',
      title: 'Installeer de widget op je website',
      href: '/v1/app/widget',
      status: status(widgetInstalled, 'install_widget'),
    },
    {
      id: 'go_live',
      title: 'Klaar voor bezoekers',
      status: status(setup.hasTraffic && widgetInstalled, 'go_live'),
    },
  ];
}

export function SetupChecklist({
  setup,
  widgetInstalled,
}: {
  setup: { hasDocument: boolean; hasKnowledgeSource: boolean; hasTraffic: boolean };
  widgetInstalled: boolean;
}) {
  // Initieer leeg om hydration-mismatch te vermijden; laad LS na mount.
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSkipped(loadSkipped());
  }, []);

  function skip(stepId: string) {
    const next = new Set(skipped);
    next.add(stepId);
    setSkipped(next);
    saveSkipped(next);
  }

  const steps = buildSteps(setup, widgetInstalled, skipped);
  const doneCount = steps.filter((s) => s.status === 'completed').length;
  const total = steps.length;
  const pct = Math.round((doneCount / total) * 100);

  // Verbatim van V0 SetupChecklist — sectie/progress/lijst ongewijzigd.
  return (
    <section
      style={{
        background: 'var(--klant-surface)',
        border: '1px solid var(--klant-border)',
        borderRadius: 'var(--klant-r-lg)',
        boxShadow: 'var(--klant-shadow)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3
            style={{
              fontFamily: 'var(--klant-font-display)',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: 'var(--klant-ink)',
              margin: '0 0 3px',
            }}
          >
            Aan de slag
          </h3>
          <p style={{ fontSize: 12, color: 'var(--klant-muted)', margin: 0 }}>
            {doneCount === total
              ? 'Alle stappen voltooid! Je chatbot staat klaar.'
              : `${doneCount} van ${total} stappen voltooid — klik door om de rest te doen.`}
          </p>
        </div>
        <div style={{ fontFamily: 'var(--klant-font-mono)', fontSize: 12, color: 'var(--klant-muted)' }}>
          {doneCount}/{total}
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          background: 'var(--klant-surface-muted)',
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--klant-accent)',
            transition: 'width 200ms ease',
          }}
        />
      </div>

      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {steps.map((step) => (
          <li key={step.id}>
            <StepRow step={step} onSkip={skip} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepRow({ step, onSkip }: { step: V1Step; onSkip: (id: string) => void }) {
  const inner = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 4px',
        borderRadius: 'var(--klant-r-sm)',
        transition: 'background 120ms ease',
      }}
    >
      <StepIcon status={step.status} />
      <span
        style={{
          flex: 1,
          fontSize: 14,
          color: step.status === 'completed' ? 'var(--klant-fg-muted)' : 'var(--klant-fg)',
          textDecoration: step.status === 'completed' ? 'line-through' : 'none',
        }}
      >
        {step.title}
      </span>
      {step.status === 'in_progress' && (
        <span
          style={{
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--klant-info-soft)',
            color: 'var(--klant-info)',
            fontWeight: 500,
          }}
        >
          Bezig
        </span>
      )}
    </div>
  );

  const linked =
    !step.href || step.status === 'completed' ? (
      inner
    ) : (
      <Link href={step.href} style={{ textDecoration: 'none', display: 'block' }}>
        {inner}
      </Link>
    );

  if (step.status === 'completed') return linked;

  return (
    <div className="klant-setup-step" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{linked}</div>
      {/* Verbatim van V0 SkipStepButton — klant-setup-skip CSS-klasse voor hover-reveal. */}
      <button
        type="button"
        className="klant-setup-skip"
        aria-label="Deze stap overslaan en als gedaan markeren"
        title="Overslaan — markeer als gedaan"
        onClick={() => onSkip(step.id)}
      >
        Overslaan
      </button>
    </div>
  );
}

function StepIcon({ status }: { status: V1Step['status'] }) {
  if (status === 'completed') {
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: 'var(--klant-success-soft)',
          color: 'var(--klant-success)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Check size={13} strokeWidth={2.5} />
      </div>
    );
  }
  if (status === 'in_progress') {
    return (
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: 'var(--klant-info-soft)',
          color: 'var(--klant-info)',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <Loader2 size={13} strokeWidth={2} />
      </div>
    );
  }
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: 999,
        border: '1.5px dashed var(--klant-border-strong)',
        display: 'grid',
        placeItems: 'center',
        color: 'var(--klant-fg-dim)',
      }}
    >
      <Circle size={9} strokeWidth={0} fill="none" />
    </div>
  );
}
