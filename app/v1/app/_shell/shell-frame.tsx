'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { BrandMark } from '@/app/v1/_ui/brand-mark';
import { ToastProvider } from '@/app/v1/_ui/toast';
import type { AttentionSignals } from '@/lib/v1/dashboard/attention';
import { V1Sidebar } from './sidebar';

// Client-schil: houdt alleen de open/dicht-state van het mobiele menu bij.
// Ook gebruikt door het admindashboard via de `sidebar`-render-prop; zonder die
// prop rendert hij de klant-zijbalk, exact zoals voorheen.
// data-klant-scope blijft staan zodat de (nog niet herontworpen) pagina's en de
// zoek-palette hun --klant-*-tokens houden tot golf 3.
export function ShellFrame({
  orgName = '',
  chatbotStatus = 'concept',
  unansweredCount = 0,
  showContactRequests = false,
  contactRequestsCount = 0,
  signals,
  sidebar,
  homeHref = '/v1/app',
  children,
}: {
  orgName?: string;
  chatbotStatus?: ChatbotStatus;
  unansweredCount?: number;
  showContactRequests?: boolean;
  contactRequestsCount?: number;
  signals?: AttentionSignals;
  /** Eigen zijbalk (admin). Krijgt een functie die het mobiele menu sluit en moet
   *  zelf `<aside className="v1-sidebar" id="v1-sidebar">` renderen. */
  sidebar?: (closeNav: () => void) => ReactNode;
  /** Doel van het merk in de mobiele kopbalk. */
  homeHref?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Sluit het menu bij elke navigatie, ook die niet via de zijbalk loopt
  // (zoek-palette, terugknop). Aanpassen-tijdens-render i.p.v. een effect.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setNavOpen(false);
  }

  const openNav = () => {
    setNavOpen(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#v1-sidebar a')?.focus());
  };

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setNavOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <div className="v1-shell" data-klant-scope data-nav-open={navOpen ? 'true' : 'false'}>
      <header className="v1-mobilebar">
        <button
          ref={menuButtonRef}
          type="button"
          className="v1-iconbtn"
          aria-label="Menu openen"
          aria-controls="v1-sidebar"
          aria-expanded={navOpen}
          onClick={openNav}
        >
          <Menu size={20} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <Link href={homeHref} className="v1-brand" style={{ padding: 0 }}>
          <BrandMark />
          ChatManta
        </Link>
      </header>

      <button
        type="button"
        className="v1-backdrop"
        aria-label="Menu sluiten"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      {sidebar ? (
        sidebar(() => setNavOpen(false))
      ) : (
        <V1Sidebar
          orgName={orgName}
          chatbotStatus={chatbotStatus}
          unansweredCount={unansweredCount}
          showContactRequests={showContactRequests}
          contactRequestsCount={contactRequestsCount}
          signals={signals}
          onNavigate={() => setNavOpen(false)}
        />
      )}

      <main className="v1-main">
        <ToastProvider>
          <div className="v1-main-inner">{children}</div>
        </ToastProvider>
      </main>
    </div>
  );
}
