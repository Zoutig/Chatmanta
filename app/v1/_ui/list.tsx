import Link from 'next/link';
import type { ReactNode } from 'react';

// Lijst met rijen (spec §4 List/ListRow): titel, meta-regel en iets rechts
// (badge, knop, cijfer). Met href wordt de hele rij klikbaar.

export function List({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="v1-list" aria-label={label}>
      {children}
    </ul>
  );
}

export function ListRow({
  title,
  meta,
  end,
  href,
  wrap = false,
}: {
  title: ReactNode;
  meta?: ReactNode;
  end?: ReactNode;
  href?: string;
  /** Lange titels laten doorlopen in plaats van afkappen. */
  wrap?: boolean;
}) {
  const body = (
    <>
      <span className="v1-list-main">
        <span className={wrap ? 'v1-list-title v1-list-title--wrap' : 'v1-list-title'}>{title}</span>
        {meta ? <span className="v1-list-meta">{meta}</span> : null}
      </span>
      {end ? <span className="v1-list-end">{end}</span> : null}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="v1-list-row v1-list-row--link">
          {body}
        </Link>
      ) : (
        <div className="v1-list-row">{body}</div>
      )}
    </li>
  );
}

/** Kop boven een lijst of kaart, met optionele link rechts. */
export function SectionHead({ title, link }: { title: string; link?: { href: string; label: string } }) {
  return (
    <div className="v1-section-head">
      <h2 className="v1-section-title">{title}</h2>
      {link ? (
        <Link href={link.href} className="v1-section-link">
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}
