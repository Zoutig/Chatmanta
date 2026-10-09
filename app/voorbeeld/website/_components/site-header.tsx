'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { DuinhoeveLogo } from './logo';

type NavItem = { href: string; label: string };

export function SiteHeader({ nav, bookHref, homeHref }: { nav: NavItem[]; bookHref: string; homeHref: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="dh-header">
      <div className="dh-container dh-header-inner">
        <Link href={homeHref} className="dh-logo-link" aria-label="De Duinhoeve, naar de homepage" onClick={close}>
          <DuinhoeveLogo />
        </Link>

        <nav className="dh-nav" aria-label="Hoofdmenu">
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="dh-nav-link"
                  aria-current={isActive(item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="dh-header-actions">
          <Link href={bookHref} className="dh-btn dh-btn-primary dh-btn-sm dh-header-book">
            Boek nu
          </Link>
          <button
            type="button"
            className="dh-menu-toggle"
            aria-expanded={open}
            aria-controls="dh-mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="dh-sr-only">{open ? 'Menu sluiten' : 'Menu openen'}</span>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {open ? (
                <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7 H20 M4 12 H20 M4 17 H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      <div id="dh-mobile-menu" className="dh-mobile-menu" hidden={!open}>
        <nav aria-label="Mobiel menu" className="dh-container">
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="dh-mobile-link"
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  onClick={close}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href={bookHref} className="dh-btn dh-btn-primary dh-mobile-book" onClick={close}>
            Boek nu
          </Link>
        </nav>
      </div>
    </header>
  );
}
