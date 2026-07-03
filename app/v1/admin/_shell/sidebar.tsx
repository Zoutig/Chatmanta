// V1 Admin Dashboard — sidebar. Async server-component die de herbruikbare NavItem
// (client) rendert. Exact het klantendashboard-design (klant-sidebar + klant-nav-item).
// Badge-counts via getJorionAdminClient() (cross-org service-role, intern gegated).
//
// Bewust géén org-switcher of TweaksPanel: de admin-sidebar toont ELKE klant via de
// route, niet via de active-org-cookie (zelfde filosofie als V0 ControlRoomSidebar).

import Link from 'next/link';
import {
  LayoutDashboard,
  Building2,
  ClipboardList,
  ListChecks,
  Workflow,
  AlertTriangle,
  Inbox,
  BarChart3,
  Gauge,
  CalendarRange,
  Settings2,
  ArrowLeft,
} from 'lucide-react';
import { NavItem } from '@/app/klantendashboard/components/nav-item';
import { getJorionAdminClient } from '@/lib/supabase/admin';

export async function AdminSidebar() {
  // Cheap head-counts voor de badges. Beide parallel ophalen; elk faalt stil → 0.
  // ponytail: twee aparte try/catch zodat één DB-fout de andere badge niet uitgooit.
  let quizBadge = 0;
  let feedbackBadge = 0;

  try {
    const admin = await getJorionAdminClient();
    const { count } = await admin
      .from('v1_quiz')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'concept');
    quizBadge = count ?? 0;
  } catch {
    // stil laten falen — badge blijft 0
  }

  try {
    const admin = await getJorionAdminClient();
    // v1_feedback_ticket.status CHECK: 'nieuw','in_behandeling','opgelost','gesloten'
    // — geen 'open'-status in het schema, dus alleen nieuw + in_behandeling hier.
    const { count } = await admin
      .from('v1_feedback_ticket')
      .select('*', { count: 'exact', head: true })
      .in('status', ['nieuw', 'in_behandeling']);
    feedbackBadge = count ?? 0;
  } catch {
    // stil laten falen — badge blijft 0
  }

  return (
    <aside className="klant-sidebar" aria-label="Hoofdnavigatie">
      {/* Brand — zelfde markup als V0 ControlRoomSidebar + V1 klantendashboard sidebar */}
      <Link
        href="/v1/admin"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '4px 8px 16px',
          textDecoration: 'none',
        }}
      >
        <div
          role="img"
          aria-label="ChatManta"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'var(--klant-accent-soft)',
            border: '1px solid var(--klant-accent-border)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 18,
              height: 12,
              backgroundColor: 'var(--klant-accent)',
              WebkitMaskImage: "url('/logo/mono-mark.png')",
              maskImage: "url('/logo/mono-mark.png')",
              WebkitMaskSize: 'contain',
              maskSize: 'contain',
              WebkitMaskRepeat: 'no-repeat',
              maskRepeat: 'no-repeat',
              WebkitMaskPosition: 'center',
              maskPosition: 'center',
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontFamily: 'var(--klant-font-display)',
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '-0.01em',
              color: 'var(--klant-ink)',
            }}
          >
            ChatManta
          </span>
          <span
            style={{
              fontSize: 10.5,
              color: 'var(--klant-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginTop: 1,
            }}
          >
            Admin Dashboard
          </span>
        </div>
      </Link>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, marginTop: 6 }}>
        <NavItem href="/v1/admin" label="Overview" exact>
          <LayoutDashboard size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/organizations" label="Klanten">
          <Building2 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/onboarding" label="Onboarding">
          <ClipboardList size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/quiz" label="Quiz" badge={quizBadge}>
          <ListChecks size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/jobs" label="Crawls & Jobs">
          <Workflow size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/issues" label="Issues">
          <AlertTriangle size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/feedback" label="Feedback" badge={feedbackBadge}>
          <Inbox size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/usage" label="Usage & Kosten">
          <BarChart3 size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/bot-prestaties" label="Bot prestaties">
          <Gauge size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/maandelijkse-recap" label="Maandelijkse Recap">
          <CalendarRange size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/admin/instellingen" label="Instellingen">
          <Settings2 size={17} strokeWidth={1.7} />
        </NavItem>
      </nav>

      {/* Footer — terug naar het klantendashboard. Geen /commandcenter: geen V1-equivalent. */}
      <div
        style={{
          marginTop: 'auto',
          paddingTop: 12,
          borderTop: '1px solid var(--klant-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <Link href="/v1/app" className="klant-nav-item">
          <ArrowLeft size={16} strokeWidth={1.7} />
          <span style={{ flex: 1 }}>Klantendashboard</span>
        </Link>
      </div>
    </aside>
  );
}
