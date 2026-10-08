import type { ReactNode } from 'react';
import { AlertTriangle, CircleAlert, Info } from 'lucide-react';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { STATUS_LABEL } from './nav';

// Meldingen en statussen (spec §6). Rustregel: hooguit één AttentionBlock
// bovenaan een scherm; meerdere kritieke punten gaan samen in dat ene blok.

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'accent';

export function Badge({ tone = 'neutral', dot = false, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className="v1-badge" data-tone={tone}>
      {dot ? <span className="v1-badge-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ChatbotStatus, Tone> = {
  live: 'ok',
  testing: 'warn',
  paused: 'danger',
  concept: 'neutral',
};

/** Status van de chatbot als pill (Overzicht, Widget). */
export function StatusPill({ status }: { status: ChatbotStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export type AttentionLevel = 'critical' | 'attention' | 'info';

const LEVEL_ICON = {
  critical: AlertTriangle,
  attention: CircleAlert,
  info: Info,
} as const;

/**
 * Eén meldingsblok. `items` voegt meerdere punten samen ("2 dingen hebben je
 * aandacht") in plaats van meerdere blokken te stapelen.
 */
export function AttentionBlock({
  level,
  title,
  children,
  items,
  actions,
}: {
  level: AttentionLevel;
  title: string;
  children?: ReactNode;
  items?: ReactNode[];
  actions?: ReactNode;
}) {
  const Icon = LEVEL_ICON[level];
  return (
    <section className="v1-attention" data-level={level} role={level === 'critical' ? 'alert' : undefined}>
      <span className="v1-attention-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="v1-attention-body">
        <p className="v1-attention-title">{title}</p>
        {children ? <p className="v1-attention-text">{children}</p> : null}
        {items && items.length > 0 ? (
          <ul className="v1-attention-list">
            {items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {actions ? <div className="v1-attention-actions">{actions}</div> : null}
    </section>
  );
}

/** Compacte lege staat: één regel plus hooguit één actie (rustregel 6). */
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="v1-empty">
      <p className="v1-empty-text">{children}</p>
      {action ?? null}
    </div>
  );
}

/** Info-icoon met uitleg (niveau Info): tooltip via title + toegankelijk label. */
export function InfoTip({ text }: { text: string }) {
  return (
    <span className="v1-info" role="img" aria-label={text} title={text} tabIndex={0}>
      <Info size={14} strokeWidth={2} aria-hidden="true" />
    </span>
  );
}
