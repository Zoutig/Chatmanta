'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavItem({
  href,
  label,
  children,
  exact = false,
  badge,
}: {
  href: string;
  label: string;
  /** Vóór-gerenderd icoon-element (lucide of anders) — geen function-ref. */
  children: ReactNode;
  exact?: boolean;
  /** Optionele teller-badge (bv. onbeantwoorde vragen op Gesprekken). */
  badge?: number;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className="klant-nav-item"
      data-active={active}
      aria-current={active ? 'page' : undefined}
    >
      {children}
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            lineHeight: '16px',
            minWidth: 16,
            height: 16,
            padding: '0 5px',
            borderRadius: 999,
            textAlign: 'center',
            background: 'var(--klant-warn)',
            color: 'var(--klant-bg)',
            fontFamily: 'var(--klant-font-body)',
          }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
