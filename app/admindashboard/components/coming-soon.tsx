// Admin Dashboard — placeholder voor secties die in een volgende stap landen.
// Voorkomt dode nav-links: de route bestaat en toont een nette lege staat.

import type { ReactNode } from 'react';

export function ComingSoon({
  title,
  sub,
  icon,
}: {
  title: string;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="klant-empty">
      {icon ? <div className="klant-empty-icon">{icon}</div> : null}
      <p className="klant-empty-title">{title}</p>
      <p className="klant-empty-sub">
        {sub ?? 'Dit onderdeel wordt in een volgende stap van de Admin Dashboard gebouwd.'}
      </p>
    </div>
  );
}
