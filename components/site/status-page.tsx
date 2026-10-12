import type { ReactNode } from 'react';
import { MantaMascotte, type MantaMode } from './mascotte/manta-mascotte';
import './status-page.css';

/** Eenvoudige statuspagina binnen de site-ui (404 / foutmelding), optioneel met de mascotte. */
export function StatusPage({
  label,
  title,
  children,
  actions,
  mascotte,
}: {
  label: string;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  /** Stemming van de mascotte rechts (docs/site/MASCOTTE.md); weglaten = geen mascotte. */
  mascotte?: MantaMode;
}) {
  return (
    <section className={`sec s-status${mascotte ? ' has-mascotte' : ''}`}>
      <div className="wrap status-grid">
        <div className="sec-head">
          <span className="eyebrow">{label}</span>
          <h1 style={{ marginTop: 12 }}>{title}</h1>
          <p className="lede" style={{ marginTop: 16 }}>
            {children}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>{actions}</div>
        </div>
        {mascotte && (
          <div className="status-stage" aria-hidden="true">
            <MantaMascotte mode={mascotte} className="status-mascotte" />
          </div>
        )}
      </div>
    </section>
  );
}
