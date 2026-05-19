'use client';

// Fake klant-website chrome — header met multi-page nav + footer, plus
// {children}-slot voor de actuele pagina-body (markdown gerenderd door
// `[slug]/[page]/page.tsx`).
//
// Active-page highlight gebruikt useSelectedLayoutSegment() — die geeft
// het waarde van het [page] segment dat momenteel onder deze layout-tree
// gerenderd wordt. Werkt client-side zonder URL parsing.
//
// Inline-styles (geen Tailwind utility-classes) want skins zijn dynamisch
// en de Tailwind v4 PostCSS-pipeline droppt soms nieuwe properties op
// bestaande selectors silent.

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

import type { OrgSkin } from '../org-skins';

export function FakeSite({
  skin,
  children,
}: {
  skin: OrgSkin;
  children: React.ReactNode;
}) {
  const activeSegment = useSelectedLayoutSegment();
  const isDark = isHexDark(skin.bgColor);
  const mutedText = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <div
      style={{
        background: skin.bgColor,
        color: skin.textColor,
        minHeight: '100vh',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Topbar — bedrijfsnaam + nav */}
      <header
        style={{
          padding: '20px 48px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <Link
          href={`/widget/${skin.slug}/${skin.pages[0]?.slug ?? ''}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '-0.01em',
            }}
          >
            {skin.companyName}
          </span>
          <span style={{ fontSize: 12, color: mutedText }}>{skin.tagline}</span>
        </Link>

        <nav
          style={{
            display: 'flex',
            gap: 22,
            fontSize: 14,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {skin.pages.map((p) => {
            const isActive = p.slug === activeSegment;
            return (
              <Link
                key={p.slug}
                href={`/widget/${skin.slug}/${p.slug}`}
                style={{
                  color: isActive ? skin.primaryColor : skin.textColor,
                  textDecoration: 'none',
                  fontWeight: isActive ? 600 : 400,
                  borderBottom: isActive
                    ? `2px solid ${skin.primaryColor}`
                    : '2px solid transparent',
                  paddingBottom: 2,
                  transition: 'color 120ms, border-color 120ms',
                }}
              >
                {p.navLabel}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Body — pagina-content (markdown) */}
      <main style={{ flex: 1 }}>{children}</main>

      {/* Footer */}
      <footer
        style={{
          padding: '32px 48px 40px',
          borderTop: `1px solid ${borderColor}`,
          fontSize: 12,
          color: mutedText,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div>
          © {new Date().getFullYear()} {skin.companyName} · Alle rechten voorbehouden
        </div>
        <div style={{ opacity: 0.7 }}>
          Demo-website — content uit ChatManta sandbox-fixtures
        </div>
      </footer>
    </div>
  );
}

function isHexDark(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}
