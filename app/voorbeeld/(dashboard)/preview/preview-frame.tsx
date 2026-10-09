import type { ReactNode } from 'react';

// Neutrale nep-website voor Preview: browserbalk + rustige pagina, met de widget
// absoluut gepositioneerd binnen het vlak (WidgetView mode="contained").
// Server component, geen state. Ook gebruikt voor het live voorbeeld op het
// Widget-scherm (variant "compact").

export function PreviewFrame({
  children,
  compact = false,
  address = 'jouw-website.nl',
}: {
  children: ReactNode;
  compact?: boolean;
  address?: string;
}) {
  return (
    <div className="v1-pv-frame" data-compact={compact || undefined}>
      <div className="v1-pv-bar" aria-hidden="true">
        <span className="v1-pv-dots">
          <i />
          <i />
          <i />
        </span>
        <span className="v1-pv-address">{address}</span>
      </div>
      <div className="v1-pv-stage">
        <div className="v1-pv-site" aria-hidden="true">
          <div className="v1-pv-nav">
            <span className="v1-pv-logo" />
            <span className="v1-pv-links">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="v1-pv-hero">
            <span style={{ width: '62%', height: 22 }} />
            <span style={{ width: '88%' }} />
            <span style={{ width: '54%' }} />
          </div>
          <div className="v1-pv-cards">
            <i />
            <i />
            <i />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
