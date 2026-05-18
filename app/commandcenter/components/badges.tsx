// Command Center — visuele badges voor status / prioriteit / eigenaar / overdue.
//
// Kleurpalet houdt zich aan de bestaande --manta-accent thematiek voor de
// neutrale/positieve states. Voor priority + overdue gebruiken we expliciet
// rood/oranje — bewust afwijkend van het globale palet zodat ze "schreeuwen".

import type {
  Owner,
  Priority,
  TaskStatus,
} from '@/lib/commandcenter/types';

type ChipProps = {
  label: string;
  bg: string;
  border: string;
  color: string;
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
    Backlog: {
      bg: 'rgba(120,200,230,0.08)',
      border: 'rgba(120,200,230,0.18)',
      color: '#9bd5e0',
    },
    'Deze week': {
      bg: 'color-mix(in oklab, var(--manta-accent) 14%, transparent)',
      border: 'color-mix(in oklab, var(--manta-accent) 38%, transparent)',
      color: 'color-mix(in oklab, var(--manta-accent) 30%, #ffffff)',
    },
    Bezig: {
      bg: 'rgba(140,200,120,0.10)',
      border: 'rgba(140,200,120,0.28)',
      color: '#b7e9a3',
    },
    Review: {
      bg: 'rgba(180,140,220,0.10)',
      border: 'rgba(180,140,220,0.28)',
      color: '#cfb1ee',
    },
    Geblokkeerd: {
      bg: 'rgba(220,90,90,0.12)',
      border: 'rgba(220,90,90,0.34)',
      color: '#f1a5a5',
    },
    Klaar: {
      bg: 'rgba(120,200,230,0.05)',
      border: 'rgba(120,200,230,0.12)',
      color: 'rgba(155,213,224,0.55)',
    },
  };
  return <Chip label={status} {...map[status]} />;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const map: Record<Priority, Omit<ChipProps, 'label'>> = {
    P1: {
      bg: 'rgba(220,90,90,0.14)',
      border: 'rgba(220,90,90,0.38)',
      color: '#f1a5a5',
    },
    P2: {
      bg: 'rgba(230,180,90,0.12)',
      border: 'rgba(230,180,90,0.34)',
      color: '#f0d39a',
    },
    P3: {
      bg: 'rgba(120,200,230,0.05)',
      border: 'rgba(120,200,230,0.14)',
      color: 'rgba(155,213,224,0.6)',
    },
  };
  return <Chip label={priority} {...map[priority]} />;
}

export function OwnerBadge({ owner }: { owner: Owner }) {
  const map: Record<Owner, Omit<ChipProps, 'label'>> = {
    Sebastiaan: {
      bg: 'rgba(120,170,255,0.10)',
      border: 'rgba(120,170,255,0.30)',
      color: '#a8c6ff',
    },
    Niels: {
      bg: 'rgba(255,150,120,0.10)',
      border: 'rgba(255,150,120,0.30)',
      color: '#ffb89a',
    },
    Samen: {
      bg: 'color-mix(in oklab, var(--manta-accent) 12%, transparent)',
      border: 'color-mix(in oklab, var(--manta-accent) 34%, transparent)',
      color: 'color-mix(in oklab, var(--manta-accent) 32%, #ffffff)',
    },
    'Nog toe te wijzen': {
      bg: 'rgba(255,255,255,0.04)',
      border: 'rgba(255,255,255,0.14)',
      color: 'rgba(207,232,240,0.55)',
    },
  };
  return <Chip label={owner} {...map[owner]} />;
}

export function OverdueBadge() {
  return (
    <Chip
      label="Te laat"
      bg="rgba(220,90,90,0.18)"
      border="rgba(220,90,90,0.46)"
      color="#ffb3b3"
    />
  );
}

export function LabelChip({ label }: { label: string }) {
  const isDecision = label === 'decision-needed';
  return (
    <Chip
      label={label}
      bg={
        isDecision
          ? 'rgba(230,180,90,0.10)'
          : 'rgba(255,255,255,0.03)'
      }
      border={
        isDecision
          ? 'rgba(230,180,90,0.30)'
          : 'rgba(255,255,255,0.10)'
      }
      color={isDecision ? '#f0d39a' : 'rgba(207,232,240,0.65)'}
    />
  );
}
