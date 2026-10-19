'use client';

// Donkere admin-zijbalk (spec §7.9): zelfde stijl en glijdende markering als het
// klantendashboard. Puur presentationeel; de tellers komen uit de layout.

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  Gauge,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  PhoneCall,
  Settings2,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { BrandMark } from '@/app/v1/_ui/brand-mark';
import { NavGroup, type NavEntry } from '@/app/v1/app/_shell/sidebar';
import { SignOutButton } from '@/app/v1/app/_shell/sign-out-button';
import { isNavActive } from '@/app/v1/_ui/nav';
import './sidebar-groups.css';

const ICON = { size: 18, strokeWidth: 1.8, 'aria-hidden': true } as const;

type NavSection = { label: string; items: NavEntry[]; collapsible?: boolean };

/** Eén menugroep met kopje; inklapbaar als `collapsible` (open zodra je erin zit). */
function AdminNavSection({
  section,
  activeHref,
  onNavigate,
}: {
  section: NavSection;
  activeHref: string;
  onNavigate: (href: string) => void;
}) {
  const containsActive = section.items.some((i) => isNavActive(activeHref, i.href, i.exact));
  const [open, setOpen] = useState(containsActive);
  const [seenActive, setSeenActive] = useState(containsActive);
  if (seenActive !== containsActive) {
    // Navigeer je ín deze groep (bv. via een link op de pagina), klap hem dan open.
    setSeenActive(containsActive);
    if (containsActive) setOpen(true);
  }
  const listId = `v1-adm-nav-${section.label.toLowerCase()}`;
  const expanded = !section.collapsible || open;

  return (
    <nav aria-label={section.label} className="v1-nav-section">
      {section.collapsible ? (
        <button
          type="button"
          className="v1-nav-label v1-adm-nav-toggle"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
        >
          {section.label}
          <ChevronDown size={14} strokeWidth={2} aria-hidden="true" className="v1-adm-nav-chev" />
        </button>
      ) : (
        <div className="v1-nav-label">{section.label}</div>
      )}
      {/* Altijd renderen (hidden i.p.v. weglaten): aria-controls moet naar een
          bestaand element wijzen, ook als de groep dicht is. */}
      <div id={listId} hidden={!expanded}>
        <NavGroup items={section.items} activeHref={activeHref} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

export function AdminSidebar({
  quizCount,
  feedbackCount,
  onNavigate,
}: {
  quizCount: number;
  feedbackCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Optimistisch: de markering verspringt direct bij de klik; zodra pathname
  // verandert is pathname weer de waarheid (zelfde patroon als de klant-zijbalk).
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

  // Informatie-architectuur (okt 2026): gegroepeerd naar wat je komt doen. Niets
  // verwijderd; weinig gebruikte pagina's (Rapportage, Systeem) staan lager en zijn
  // ingeklapt, behalve als je er net bent.
  const groups: NavSection[] = [
    {
      label: 'Klanten',
      items: [
        { href: '/v1/admin', label: 'Overzicht', exact: true, icon: <LayoutDashboard {...ICON} /> },
        { href: '/v1/admin/organizations', label: 'Klanten', icon: <Building2 {...ICON} /> },
        { href: '/v1/admin/onboarding', label: 'Onboarding', icon: <ClipboardList {...ICON} /> },
      ],
    },
    {
      label: 'Kwaliteit',
      items: [
        { href: '/v1/admin/issues', label: 'Issues', icon: <TriangleAlert {...ICON} /> },
        { href: '/v1/admin/feedback', label: 'Feedback', count: feedbackCount, icon: <Inbox {...ICON} /> },
        { href: '/v1/admin/quiz', label: 'Quiz', count: quizCount, icon: <ListChecks {...ICON} /> },
        { href: '/v1/admin/bot-prestaties', label: 'Botprestaties', icon: <Gauge {...ICON} /> },
      ],
    },
    {
      label: 'Rapportage',
      collapsible: true,
      items: [
        { href: '/v1/admin/usage', label: 'Gebruik en kosten', icon: <BarChart3 {...ICON} /> },
        { href: '/v1/admin/maandelijkse-recap', label: 'Maandrecap', icon: <CalendarRange {...ICON} /> },
        { href: '/v1/admin/audit', label: 'Auditlog', icon: <History {...ICON} /> },
      ],
    },
    {
      label: 'Systeem',
      collapsible: true,
      items: [
        { href: '/v1/admin/jobs', label: 'Crawls en taken', icon: <Workflow {...ICON} /> },
        { href: '/v1/admin/instellingen', label: 'Instellingen', icon: <Settings2 {...ICON} /> },
      ],
    },
  ];

  return (
    <aside className="v1-sidebar" aria-label="Hoofdmenu" id="v1-sidebar">
      <Link href="/v1/admin" className="v1-brand" onClick={() => handleNavigate('/v1/admin')}>
        <BrandMark />
        ChatManta
        <span className="v1-adm-brand-tag">Admin</span>
      </Link>

      {groups.map((g) => (
        <AdminNavSection key={g.label} section={g} activeHref={activeHref} onNavigate={handleNavigate} />
      ))}

      <div className="v1-sidebar-foot">
        <a href="/v1/leads" target="_blank" rel="noopener" className="v1-nav-item v1-nav-item--quiet">
          <PhoneCall size={16} strokeWidth={1.8} aria-hidden="true" />
          Leads ↗
        </a>
        <Link href="/v1/app" className="v1-nav-item v1-nav-item--quiet" onClick={() => onNavigate?.()}>
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          Naar klantendashboard
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}
