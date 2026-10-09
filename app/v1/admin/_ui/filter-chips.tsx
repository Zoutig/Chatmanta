import Link from 'next/link';
import type { ReactNode } from 'react';

// Filterregels met chips als links (de filterstand staat in de URL). Gedeeld
// door Issues en Feedback. Server component.

export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="v1-adm-filter" role="group" aria-label={label}>
      <span className="v1-adm-filter-label">{label}</span>
      <div className="v1-adm-filter-chips">{children}</div>
    </div>
  );
}

export function FilterChip({ active, href, children }: { active: boolean; href: string; children: ReactNode }) {
  return (
    <Link href={href} className="v1-adm-chip" aria-current={active ? 'true' : undefined} scroll={false}>
      {children}
    </Link>
  );
}
