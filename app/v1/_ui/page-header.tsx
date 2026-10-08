import type { ReactNode } from 'react';

// Paginakop van de V1-ontwerplaag: titel, één zin uitleg (rustregel 3) en
// optioneel acties rechts.
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="v1-page-head">
      <div>
        <h1 className="v1-page-title">{title}</h1>
        {description ? <p className="v1-page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="v1-page-actions">{actions}</div> : null}
    </header>
  );
}
