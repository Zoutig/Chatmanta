'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export function NavItem({
  href,
  label,
  children,
  exact = false,
}: {
  href: string;
  label: string;
  /** Vóór-gerenderd icoon-element (lucide of anders) — geen function-ref. */
  children: ReactNode;
  exact?: boolean;
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
      <span>{label}</span>
    </Link>
  );
}
