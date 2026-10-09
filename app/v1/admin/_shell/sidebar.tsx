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
  ClipboardList,
  Gauge,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings2,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { BrandMark } from '@/app/v1/_ui/brand-mark';
import { NavGroup, type NavEntry } from '@/app/v1/app/_shell/sidebar';
import { SignOutButton } from '@/app/v1/app/_shell/sign-out-button';

const ICON = { size: 18, strokeWidth: 1.8, 'aria-hidden': true } as const;

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

  const items: NavEntry[] = [
    { href: '/v1/admin', label: 'Overzicht', exact: true, icon: <LayoutDashboard {...ICON} /> },
    { href: '/v1/admin/organizations', label: 'Klanten', icon: <Building2 {...ICON} /> },
    { href: '/v1/admin/onboarding', label: 'Onboarding', icon: <ClipboardList {...ICON} /> },
    { href: '/v1/admin/quiz', label: 'Quiz', count: quizCount, icon: <ListChecks {...ICON} /> },
    { href: '/v1/admin/jobs', label: 'Crawls en taken', icon: <Workflow {...ICON} /> },
    { href: '/v1/admin/issues', label: 'Issues', icon: <TriangleAlert {...ICON} /> },
    { href: '/v1/admin/feedback', label: 'Feedback', count: feedbackCount, icon: <Inbox {...ICON} /> },
    { href: '/v1/admin/usage', label: 'Gebruik en kosten', icon: <BarChart3 {...ICON} /> },
    { href: '/v1/admin/bot-prestaties', label: 'Botprestaties', icon: <Gauge {...ICON} /> },
    { href: '/v1/admin/maandelijkse-recap', label: 'Maandrecap', icon: <CalendarRange {...ICON} /> },
    { href: '/v1/admin/instellingen', label: 'Instellingen', icon: <Settings2 {...ICON} /> },
  ];

  return (
    <aside className="v1-sidebar" aria-label="Hoofdmenu" id="v1-sidebar">
      <Link href="/v1/admin" className="v1-brand" onClick={() => handleNavigate('/v1/admin')}>
        <BrandMark />
        ChatManta
        <span className="v1-adm-brand-tag">Admin</span>
      </Link>

      <nav aria-label="Admin" className="v1-nav-section">
        <NavGroup items={items} activeHref={activeHref} onNavigate={handleNavigate} />
      </nav>

      <div className="v1-sidebar-foot">
        <Link href="/v1/app" className="v1-nav-item v1-nav-item--quiet" onClick={() => onNavigate?.()}>
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          Naar klantendashboard
        </Link>
        <SignOutButton />
      </div>
    </aside>
  );
}
