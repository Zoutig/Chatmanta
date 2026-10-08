import type { ReactNode } from 'react';

// Wit paneel met kop en lees-rijen (label links, waarde rechts). Basis van het
// "eerst lezen, dan Wijzigen"-patroon op Account en Chatbot.

export function Panel({
  id,
  title,
  meta,
  children,
}: {
  id?: string;
  title: string;
  /** Rechts in de kop: bv. een Wijzigen-knop of "Opgeslagen". */
  meta?: ReactNode;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} className="v1-panel" aria-labelledby={headingId}>
      <div className="v1-panel-head">
        <h2 id={headingId} className="v1-panel-title">
          {title}
        </h2>
        {meta ? <div className="v1-panel-meta">{meta}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Rows({ children }: { children: ReactNode }) {
  return <dl className="v1-rows">{children}</dl>;
}

export function Row({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  /** Optionele knop rechts in de rij (bv. Wijzigen of Kopiëren). */
  action?: ReactNode;
}) {
  return (
    <div className="v1-row">
      <dt className="v1-row-label">{label}</dt>
      <dd className="v1-row-value">{children}</dd>
      {action ? <div className="v1-row-action">{action}</div> : null}
    </div>
  );
}

/** Lege waarde in een lees-rij, rustig grijs. */
export function EmptyValue({ children = 'Niet ingevuld' }: { children?: ReactNode }) {
  return <span className="v1-row-empty">{children}</span>;
}
