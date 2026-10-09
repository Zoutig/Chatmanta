'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessagesSquare,
  Library,
  PhoneCall,
  Code2,
  Settings2,
  CircleUserRound,
  MessageSquarePlus,
} from 'lucide-react';
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';
import { BrandMark } from '@/app/v1/_ui/brand-mark';
import { activeIndex, formatCount, initials, NAV_ITEM_PITCH, STATUS_LABEL } from '@/app/v1/_ui/nav';
import { V1SearchTrigger } from './search-trigger';
import { SignOutButton } from './sign-out-button';
import type { AttentionSignals } from '@/lib/v1/dashboard/attention';

// Donkere V1-zijbalk (spec §7.1). Puur presentationeel: tellers en status komen
// uit de layout (getShellCounts). Twee groepen, elk met een eigen glijdende
// markering achter het actieve item.

export type NavDot = { tone: 'critical' | 'accent'; label: string };
export type NavEntry = { href: string; label: string; icon: React.ReactNode; exact?: boolean; count?: number; dot?: NavDot };

const ICON = { size: 18, strokeWidth: 1.8, 'aria-hidden': true } as const;

/** Ook gebruikt door de admin-zijbalk. */
export function NavGroup({
  items,
  activeHref,
  onNavigate,
}: {
  items: NavEntry[];
  activeHref: string;
  onNavigate: (href: string) => void;
}) {
  const idx = activeIndex(activeHref, items);
  return (
    <div className="v1-nav-group">
      <div
        className="v1-nav-pill"
        aria-hidden="true"
        style={{ transform: `translateY(${Math.max(idx, 0) * NAV_ITEM_PITCH}px)`, opacity: idx < 0 ? 0 : 1 }}
      />
      {items.map((item, i) => {
        const count = formatCount(item.count);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="v1-nav-item"
            aria-current={i === idx ? 'page' : undefined}
            onClick={() => onNavigate(item.href)}
          >
            {item.icon}
            <span>{item.label}</span>
            {count ? (
              <span className="v1-nav-count" aria-label={`${count} open`}>
                {count}
              </span>
            ) : item.dot ? (
              <span
                className="v1-nav-dot"
                data-tone={item.dot.tone === 'accent' ? 'accent' : undefined}
                role="img"
                aria-label={item.dot.label}
                title={item.dot.label}
              />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function V1Sidebar({
  orgName,
  chatbotStatus,
  unansweredCount = 0,
  showContactRequests = false,
  contactRequestsCount = 0,
  signals,
  onNavigate,
}: {
  orgName: string;
  chatbotStatus: ChatbotStatus;
  unansweredCount?: number;
  showContactRequests?: boolean;
  contactRequestsCount?: number;
  /** Aandacht-signalen → stippen (rood = kritiek, teal = quiz klaar). */
  signals?: AttentionSignals;
  /** Wordt aangeroepen bij elke menuklik (sluit het mobiele menu). */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Optimistisch: de markering verspringt direct bij de klik, nog vóór de
  // navigatie klaar is. Zodra pathname verandert (navigatie klaar, of weg via
  // terugknop/palette) wissen we pending, zodat pathname weer de waarheid is.
  const [pending, setPending] = useState<string | null>(null);
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setPending(null);
  }
  const activeHref = pending ?? pathname;

  const handleNavigate = (href: string) => {
    if (href !== pathname) setPending(href);
    onNavigate?.();
  };

  const daily: NavEntry[] = [
    { href: '/v1/app', label: 'Overzicht', exact: true, icon: <LayoutDashboard {...ICON} /> },
    { href: '/v1/app/gesprekken', label: 'Gesprekken', count: unansweredCount, icon: <MessagesSquare {...ICON} /> },
    {
      href: '/v1/app/kennisbank',
      label: 'Kennisbank',
      icon: <Library {...ICON} />,
      dot: signals?.crawlFailed
        ? { tone: 'critical', label: 'Ophalen van je website mislukt' }
        : signals?.quizReady
          ? { tone: 'accent', label: 'Er staat een kennisquiz klaar' }
          : undefined,
    },
    ...(showContactRequests
      ? [{ href: '/v1/app/contactverzoeken', label: 'Contactverzoeken', count: contactRequestsCount, icon: <PhoneCall {...ICON} /> }]
      : []),
    {
      href: '/v1/app/widget',
      label: 'Widget',
      icon: <Code2 {...ICON} />,
      dot: signals?.widgetPaused
        ? { tone: 'critical', label: 'Je chatbot staat op pauze' }
        : signals?.widgetMissing
          ? { tone: 'critical', label: 'Widget niet gezien op je site' }
          : undefined,
    },
  ];
  const settings: NavEntry[] = [
    { href: '/v1/app/instellingen', label: 'Chatbot', icon: <Settings2 {...ICON} /> },
    {
      href: '/v1/app/account',
      label: 'Account',
      icon: <CircleUserRound {...ICON} />,
      dot:
        signals?.monthlyLimitReached || signals?.dailyBudgetReached
          ? { tone: 'critical', label: 'Limiet bereikt' }
          : undefined,
    },
  ];

  return (
    <aside className="v1-sidebar" aria-label="Hoofdmenu" id="v1-sidebar">
      <Link href="/v1/app" className="v1-brand" onClick={() => handleNavigate('/v1/app')}>
        <BrandMark />
        ChatManta
      </Link>

      <div className="v1-org">
        <span className="v1-org-avatar" aria-hidden="true">
          {initials(orgName)}
        </span>
        <span className="v1-org-text">
          <span className="v1-org-name">{orgName || 'Je organisatie'}</span>
          <span className="v1-org-status">
            <span className="v1-status-dot" data-status={chatbotStatus} aria-hidden="true" />
            {STATUS_LABEL[chatbotStatus]}
          </span>
        </span>
      </div>

      <V1SearchTrigger />

      <nav aria-label="Dagelijks" className="v1-nav-section">
        <NavGroup items={daily} activeHref={activeHref} onNavigate={handleNavigate} />
      </nav>

      <nav aria-label="Instellingen" className="v1-nav-section">
        <div className="v1-nav-label">Instellingen</div>
        <NavGroup items={settings} activeHref={activeHref} onNavigate={handleNavigate} />
      </nav>

      <div className="v1-sidebar-foot">
        <Link
          href="/v1/app/feedback"
          className="v1-nav-item v1-nav-item--quiet"
          aria-current={pathname.startsWith('/v1/app/feedback') ? 'page' : undefined}
          onClick={() => handleNavigate('/v1/app/feedback')}
        >
          <MessageSquarePlus size={16} strokeWidth={1.8} aria-hidden="true" />
          Feedback geven
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}
