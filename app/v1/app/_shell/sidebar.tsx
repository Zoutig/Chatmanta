import Link from 'next/link';
import { MessageSquare, BookOpen, Settings, User } from 'lucide-react';
import { NavItem } from '@/app/klantendashboard/components/nav-item';

// V1 /app sidebar — puur presentationeel. Repliceert de V0-klantendashboard-
// chrome (brand-blok + NavItem-nav) maar zonder org-switcher / search / tweaks
// (V0-sandbox-only). Statische nav → alléén de 4 bestaande V1-pagina's.
export function V1Sidebar() {
  return (
    <aside className="klant-sidebar" aria-label="Hoofdnavigatie">
      {/* Brand */}
      <Link
        href="/v1/app"
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
            Klantendashboard
          </span>
        </div>
      </Link>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 6 }}>
        <NavItem href="/v1/app" label="Chatbot" exact>
          <MessageSquare size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/kennisbank" label="Kennisbank">
          <BookOpen size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/instellingen" label="Instellingen">
          <Settings size={17} strokeWidth={1.7} />
        </NavItem>
        <NavItem href="/v1/app/account" label="Account">
          <User size={17} strokeWidth={1.7} />
        </NavItem>
      </nav>
    </aside>
  );
}
