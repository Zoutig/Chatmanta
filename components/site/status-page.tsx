import type { ReactNode } from 'react';

/** Eenvoudige statuspagina binnen de site-ui (404 / foutmelding). */
export function StatusPage({
  label,
  title,
  children,
  actions,
}: {
  label: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className="sec">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">{label}</span>
          <h1 style={{ marginTop: 12 }}>{title}</h1>
          <p className="lede" style={{ marginTop: 16 }}>
            {children}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>{actions}</div>
        </div>
      </div>
    </section>
  );
}
