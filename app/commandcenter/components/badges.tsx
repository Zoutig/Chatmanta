// Command Center — visuele badges voor status / prioriteit / eigenaar / overdue.
//
// Token-driven: alle kleuren via --bd-* CSS-vars in globals.css. Een wijziging
// van dark <-> light wisselt de palettes automatisch. De accent-tinten
// (Deze week / Samen / Actief-fase) gebruiken color-mix op --manta-accent
// zodat ze meekleuren met de actieve style-variant.

import type {
  CustomerStatus,
  DecisionStatus,
  MilestoneStatus,
  Owner,
  Priority,
  TaskStatus,
} from '@/lib/commandcenter/types';
import type { PhaseStatus } from '@/lib/commandcenter/roadmap-phases';

type ChipProps = {
  label: string;
  bg: string;
  border: string;
  color: string;
};

type Family = 'info' | 'success' | 'warn' | 'danger' | 'violet' | 'neutral';

const FAMILY: Record<Family, Omit<ChipProps, 'label'>> = {
  info: {
    bg: 'var(--bd-info-bg)',
    border: 'var(--bd-info-border)',
    color: 'var(--bd-info-fg)',
  },
  success: {
    bg: 'var(--bd-success-bg)',
    border: 'var(--bd-success-border)',
    color: 'var(--bd-success-fg)',
  },
  warn: {
    bg: 'var(--bd-warn-bg)',
    border: 'var(--bd-warn-border)',
    color: 'var(--bd-warn-fg)',
  },
  danger: {
    bg: 'var(--bd-danger-bg)',
    border: 'var(--bd-danger-border)',
    color: 'var(--bd-danger-fg)',
  },
  violet: {
    bg: 'var(--bd-violet-bg)',
    border: 'var(--bd-violet-border)',
    color: 'var(--bd-violet-fg)',
  },
  neutral: {
    bg: 'var(--bd-neutral-bg)',
    border: 'var(--bd-neutral-border)',
    color: 'var(--bd-neutral-fg)',
  },
};

const ACCENT_TINT: Omit<ChipProps, 'label'> = {
  bg: 'color-mix(in oklab, var(--manta-accent, var(--accent)) 14%, transparent)',
  border:
    'color-mix(in oklab, var(--manta-accent, var(--accent)) 38%, transparent)',
  color:
    'color-mix(in oklab, var(--manta-accent, var(--accent)) 60%, var(--fg))',
};

function Chip({ label, bg, border, color }: ChipProps) {
  return (
    <span
      className="inline-flex items-center text-[11px] font-medium uppercase tracking-wide px-2 py-0.5"
      style={{
        borderRadius: '999px',
        background: bg,
        border: `1px solid ${border}`,
        color,
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </span>
  );
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const map: Record<TaskStatus, Omit<ChipProps, 'label'>> = {
    Backlog: FAMILY.info,
    'Deze week': ACCENT_TINT,
    Bezig: FAMILY.success,
    Review: FAMILY.violet,
    Geblokkeerd: FAMILY.danger,
    Klaar: FAMILY.neutral,
  };
  return <Chip label={status} {...map[status]} />;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const map: Record<Priority, Omit<ChipProps, 'label'>> = {
    P1: FAMILY.danger,
    P2: FAMILY.warn,
    P3: FAMILY.info,
  };
  return <Chip label={priority} {...map[priority]} />;
}

export function OwnerBadge({ owner }: { owner: Owner }) {
  const map: Record<Owner, Omit<ChipProps, 'label'>> = {
    Sebastiaan: {
      bg: 'rgba(120,170,255,0.10)',
      border: 'rgba(120,170,255,0.34)',
      color: 'color-mix(in oklab, #5b8def 55%, var(--fg))',
    },
    Niels: {
      bg: 'rgba(255,150,120,0.10)',
      border: 'rgba(255,150,120,0.34)',
      color: 'color-mix(in oklab, #ff8a5a 55%, var(--fg))',
    },
    Samen: ACCENT_TINT,
    'Nog toe te wijzen': FAMILY.neutral,
  };
  return <Chip label={owner} {...map[owner]} />;
}

export function OverdueBadge() {
  return <Chip label="Te laat" {...FAMILY.danger} />;
}

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  const map: Record<MilestoneStatus, Omit<ChipProps, 'label'>> = {
    'Niet gestart': FAMILY.neutral,
    Bezig: FAMILY.success,
    Geblokkeerd: FAMILY.danger,
    Afgerond: ACCENT_TINT,
  };
  return <Chip label={status} {...map[status]} />;
}

export function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  const map: Record<PhaseStatus, Omit<ChipProps, 'label'>> = {
    'Niet gestart': FAMILY.neutral,
    Actief: ACCENT_TINT,
    'Bijna klaar': FAMILY.success,
    Afgerond: FAMILY.info,
    Gepauzeerd: FAMILY.warn,
  };
  return <Chip label={status} {...map[status]} />;
}

export function ProgressBar({
  ratio,
  height = 6,
  tone = 'default',
}: {
  ratio: number;
  height?: number;
  tone?: 'default' | 'muted';
}) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        width: '100%',
        height,
        borderRadius: 999,
        background: 'var(--surface-3)',
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background:
            tone === 'muted'
              ? 'var(--fg-muted)'
              : 'linear-gradient(90deg, color-mix(in oklab, var(--manta-accent, var(--accent)) 70%, transparent), var(--manta-accent, var(--accent)))',
          transition: 'width 320ms ease',
        }}
      />
    </div>
  );
}

export function DecisionStatusBadge({ status }: { status: DecisionStatus }) {
  const map: Record<DecisionStatus, Omit<ChipProps, 'label'>> = {
    Actief: FAMILY.success,
    'Te herzien': FAMILY.warn,
    Vervangen: FAMILY.violet,
    Geannuleerd: FAMILY.neutral,
  };
  return <Chip label={status} {...map[status]} />;
}

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const map: Record<CustomerStatus, Omit<ChipProps, 'label'>> = {
    'Idee / mogelijke klant': FAMILY.neutral,
    'Nog benaderen': FAMILY.warn,
    Benaderd: FAMILY.violet,
    'Gesprek gepland': {
      bg: 'rgba(120,170,255,0.10)',
      border: 'rgba(120,170,255,0.34)',
      color: 'color-mix(in oklab, #5b8def 55%, var(--fg))',
    },
    'Demo gegeven': ACCENT_TINT,
    'Testklant actief': FAMILY.success,
    'Betaalde klant': FAMILY.success,
    'Afgewezen / later': FAMILY.neutral,
  };
  return <Chip label={status} {...map[status]} />;
}

export function LabelChip({ label }: { label: string }) {
  const isDecision = label === 'decision-needed';
  return (
    <Chip
      label={label}
      bg={isDecision ? 'var(--bd-warn-bg)' : 'var(--surface)'}
      border={isDecision ? 'var(--bd-warn-border)' : 'var(--border)'}
      color={isDecision ? 'var(--bd-warn-fg)' : 'var(--fg-muted)'}
    />
  );
}
