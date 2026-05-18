'use client';

// Fake klant-website voor de /widget demo. Renders een neutrale landing-page
// (hero / features / pricing / about / footer) volledig in inline styles —
// bewust GEEN globals.css of Tailwind utility-classes, want de skin moet
// per org-keuze dynamisch wisselen. Inline-styles voorkomen ook de Tailwind
// v4 PostCSS-drop-quirk waar nieuwe properties op bestaande selectors silent
// gedropt worden (zie memory tailwind_v4_postcss_quirk).

import type { OrgSkin } from '../org-skins';

export function FakeSite({ skin }: { skin: OrgSkin }) {
  const isDark = isHexDark(skin.bgColor);
  const mutedText = isDark
    ? 'rgba(255,255,255,0.65)'
    : 'rgba(0,0,0,0.65)';
  const borderColor = isDark
    ? 'rgba(255,255,255,0.08)'
    : 'rgba(0,0,0,0.08)';

  return (
    <div
      style={{
        background: skin.bgColor,
        color: skin.textColor,
        minHeight: '100vh',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
      }}
    >
      {/* Topbar */}
      <header
        style={{
          padding: '20px 48px',
          borderBottom: `1px solid ${borderColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
        </div>
        <nav style={{ display: 'flex', gap: 28, fontSize: 14 }}>
          <a href="#diensten" style={{ color: skin.textColor, textDecoration: 'none' }}>
            Diensten
          </a>
          <a href="#tarieven" style={{ color: skin.textColor, textDecoration: 'none' }}>
            Tarieven
          </a>
          <a href="#over" style={{ color: skin.textColor, textDecoration: 'none' }}>
            Over ons
          </a>
          <a
            href="#contact"
            style={{
              color: skin.primaryColor,
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Contact
          </a>
        </nav>
      </header>

      {/* Hero */}
      <section
        style={{
          padding: '88px 48px 64px',
          maxWidth: 1080,
          margin: '0 auto',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: skin.primaryColor,
            marginBottom: 18,
          }}
        >
          {skin.hero.eyebrow}
        </span>
        <h1
          style={{
            fontSize: 48,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            fontWeight: 700,
            maxWidth: 760,
            margin: '0 0 22px',
          }}
        >
          {skin.hero.title}
        </h1>
        <p
          style={{
            fontSize: 18,
            lineHeight: 1.55,
            maxWidth: 620,
            color: mutedText,
            margin: '0 0 32px',
          }}
        >
          {skin.hero.subtitle}
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            style={{
              background: skin.primaryColor,
              color: bestForegroundOn(skin.primaryColor),
              padding: '12px 22px',
              borderRadius: 8,
              border: 'none',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {skin.hero.primaryCta}
          </button>
          <button
            type="button"
            style={{
              background: 'transparent',
              color: skin.textColor,
              padding: '12px 22px',
              borderRadius: 8,
              border: `1px solid ${borderColor}`,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            {skin.hero.secondaryCta}
          </button>
        </div>
      </section>

      {/* Features */}
      <section
        id="diensten"
        style={{
          padding: '40px 48px 80px',
          maxWidth: 1080,
          margin: '0 auto',
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: mutedText,
            marginBottom: 28,
          }}
        >
          Wat we doen
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          {skin.features.map((f) => (
            <div
              key={f.title}
              style={{
                background: skin.cardColor,
                border: `1px solid ${borderColor}`,
                borderRadius: 12,
                padding: 22,
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 10px' }}>
                {f.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: mutedText, margin: 0 }}>
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section
        id="tarieven"
        style={{
          padding: '0 48px 80px',
          maxWidth: 1080,
          margin: '0 auto',
        }}
      >
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: mutedText,
            marginBottom: 28,
          }}
        >
          Tarieven
        </h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
          }}
        >
          {skin.pricing.map((p, idx) => {
            const featured = idx === 1;
            return (
              <div
                key={p.name}
                style={{
                  background: featured
                    ? skin.primaryColor
                    : skin.cardColor,
                  border: featured
                    ? `1px solid ${skin.primaryColor}`
                    : `1px solid ${borderColor}`,
                  borderRadius: 12,
                  padding: 24,
                  color: featured ? bestForegroundOn(skin.primaryColor) : skin.textColor,
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 600,
                    marginBottom: 6,
                    opacity: 0.85,
                  }}
                >
                  {p.name}
                </div>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    marginBottom: 16,
                  }}
                >
                  {p.price}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 14, lineHeight: 1.7 }}>
                  {p.perks.map((perk) => (
                    <li key={perk} style={{ opacity: featured ? 0.92 : 0.78 }}>
                      • {perk}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* About + contact */}
      <section
        id="over"
        style={{
          padding: '0 48px 80px',
          maxWidth: 1080,
          margin: '0 auto',
        }}
      >
        <div
          style={{
            background: skin.cardColor,
            border: `1px solid ${borderColor}`,
            borderRadius: 12,
            padding: 32,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 32,
          }}
        >
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>
              {skin.about.title}
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.6, color: mutedText, margin: 0 }}>
              {skin.about.body}
            </p>
          </div>
          <div id="contact">
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, margin: '0 0 12px', color: mutedText }}>
              Contact
            </h3>
            <p style={{ fontSize: 15, lineHeight: 1.8, margin: 0 }}>
              Bel ons of stuur een bericht — we reageren binnen 1 werkdag.
              <br />
              <span style={{ color: skin.primaryColor, fontWeight: 600 }}>
                Of stel direct je vraag aan onze chatbot →
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: '24px 48px 40px',
          borderTop: `1px solid ${borderColor}`,
          fontSize: 12,
          color: mutedText,
          textAlign: 'center',
        }}
      >
        © {new Date().getFullYear()} {skin.companyName} · Alle rechten voorbehouden
      </footer>
    </div>
  );
}

// Heuristic — donker hex (avg < 128) → dark theme, anders light.
function isHexDark(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}

// Kies wit of zwart voorgrond-tekst voor leesbaarheid op een gekleurde knop.
function bestForegroundOn(hex: string): string {
  return isHexDark(hex) ? '#ffffff' : '#0a0a0a';
}
