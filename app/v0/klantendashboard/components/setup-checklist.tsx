import Link from 'next/link';
import { Check, Circle, Loader2 } from 'lucide-react';
import type { SetupStep } from '@/lib/v0/klantendashboard/types';
import { SkipStepButton } from './skip-step-button';

export function SetupChecklist({ steps }: { steps: SetupStep[] }) {
  const doneCount = steps.filter((s) => s.status === 'completed').length;
  const total = steps.length;
  const pct = Math.round((doneCount / total) * 100);

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
            <StepRow step={step} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepRow({ step }: { step: SetupStep }) {
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
          color:
            step.status === 'completed'
              ? 'var(--klant-fg-muted)'
              : step.status === 'in_progress'
                ? 'var(--klant-fg)'
                : 'var(--klant-fg)',
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

  // Voltooide stappen krijgen geen overslaan-knop. Voor de rest onthult hover/
  // focus een "Overslaan"-knop náást de klikbare rij (niet erin — anders zou
  // klikken óók navigeren). De hover-reveal zit in klant.css (.klant-setup-step).
  if (step.status === 'completed') {
    return linked;
  }
  return (
    <div className="klant-setup-step" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{linked}</div>
      <SkipStepButton stepId={step.id} />
    </div>
  );
}

function StepIcon({ status }: { status: SetupStep['status'] }) {
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
