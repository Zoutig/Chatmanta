// Gedeelde visuele primitives voor alle /widget page-templates.
//
// Bevat:
//   - GradientHero: hero-banner met brand-color gradient + foto-placeholder
//   - SectionBand: full-bleed sectie met optionele afwisselende bg
//   - PhotoPlaceholder: brand-color blok met subtiel patroon (geen externe assets)
//   - emojiForService: keyword-based emoji-icon picker voor service-cards
//   - extractServiceItems: helper die `- **[name](#)** — desc` regels parsed
//   - templateTheme: gedeelde theme-builder voor templates

import type { CSSProperties, ReactNode } from 'react';

import { renderInline, type MarkdownTheme } from '../render-markdown';
import type { ParsedBlock } from '../parse-md';
import type { OrgSkin } from '@/app/widget/org-skins';

// ---------------------------------------------------------------------------
// Theme + color helpers
// ---------------------------------------------------------------------------

export function isHexDark(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}

export function buildTheme(skin: OrgSkin): MarkdownTheme {
  const dark = isHexDark(skin.bgColor);
  return {
    primaryColor: skin.primaryColor,
    textColor: skin.textColor,
    mutedText: dark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.62)',
    borderColor: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)',
    cardColor: skin.cardColor,
  };
}

/** Donkerdere variant van een hex-color voor gradient-eindes. */
export function darkenHex(hex: string, amount = 0.25): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 0xff) * (1 - amount)));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Lichtere variant — voor accent-overlays. */
export function lightenHex(hex: string, amount = 0.15): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) + (255 - ((n >> 16) & 0xff)) * amount));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) + (255 - ((n >> 8) & 0xff)) * amount));
  const b = Math.min(255, Math.round((n & 0xff) + (255 - (n & 0xff)) * amount));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

/** RGBA-string vanaf hex + alpha. */
export function hexAlpha(hex: string, alpha: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 0xff},${(n >> 8) & 0xff},${n & 0xff},${alpha})`;
}

// ---------------------------------------------------------------------------
// Hero banner
// ---------------------------------------------------------------------------

export function GradientHero({
  skin,
  title,
  lead,
  eyebrow,
  cta,
  illustration = 'photo',
}: {
  skin: OrgSkin;
  title: string;
  lead?: string;
  eyebrow?: string;
  cta?: { label: string; href?: string };
  illustration?: 'photo' | 'icon' | 'none';
}) {
  const dark = isHexDark(skin.bgColor);
  const dim = darkenHex(skin.primaryColor, 0.3);
  // Gradient: brand-color top-left → darker bottom-right
  const heroBg = `linear-gradient(135deg, ${skin.primaryColor} 0%, ${dim} 100%)`;
  // Heroes zijn altijd "donker" qua tekstkleur op de brand-color background
  const onHero = '#ffffff';
  const onHeroMuted = 'rgba(255,255,255,0.82)';

  return (
    <section
      style={{
        background: heroBg,
        color: onHero,
        padding: '72px 48px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decoratieve overlay-shapes */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: -120,
          right: -80,
          width: 360,
          height: 360,
          borderRadius: '50%',
          background: hexAlpha('#ffffff', 0.06),
          pointerEvents: 'none',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          bottom: -160,
          left: -60,
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: hexAlpha('#ffffff', 0.04),
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: illustration === 'none' ? '1fr' : '1.4fr 1fr',
          gap: 48,
          alignItems: 'center',
          position: 'relative',
        }}
      >
        <div>
          {eyebrow && (
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: onHeroMuted,
                marginBottom: 14,
              }}
            >
              {eyebrow}
            </div>
          )}
          <h1
            style={{
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              lineHeight: 1.1,
              margin: '0 0 18px',
              color: onHero,
            }}
          >
            {title}
          </h1>
          {lead && (
            <p
              style={{
                fontSize: 18,
                lineHeight: 1.55,
                color: onHeroMuted,
                margin: '0 0 28px',
                maxWidth: 580,
              }}
            >
              {lead}
            </p>
          )}
          {cta && (
            <a
              href={cta.href ?? '#'}
              style={{
                display: 'inline-block',
                background: '#ffffff',
                color: skin.primaryColor,
                padding: '12px 22px',
                borderRadius: 999,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: `0 8px 24px ${hexAlpha('#000000', 0.18)}`,
              }}
            >
              {cta.label} →
            </a>
          )}
        </div>

        {illustration === 'photo' && <HeroPhotoPlaceholder skin={skin} />}
        {illustration === 'icon' && <HeroIconMark skin={skin} />}
      </div>

      {/* Onzichtbaar fixje: wanneer een dark-bg-skin op deze gradient zit en
          de pagina-bg eronder donker is, voorkomen we een harde overgang. */}
      {!dark && null}
    </section>
  );
}

function HeroPhotoPlaceholder({ skin }: { skin: OrgSkin }) {
  return (
    <div
      aria-hidden
      style={{
        aspectRatio: '4 / 3',
        background: `linear-gradient(160deg, ${hexAlpha('#ffffff', 0.16)} 0%, ${hexAlpha('#000000', 0.18)} 100%)`,
        borderRadius: 16,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `0 18px 60px ${hexAlpha('#000000', 0.28)}`,
        border: `1px solid ${hexAlpha('#ffffff', 0.18)}`,
      }}
    >
      {/* Patroon — diagonal stripes */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `repeating-linear-gradient(45deg, ${hexAlpha('#ffffff', 0.05)} 0 14px, transparent 14px 28px)`,
        }}
      />
      {/* Centraal mark — bedrijfsnaam-letter */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 96,
          fontWeight: 800,
          color: hexAlpha('#ffffff', 0.32),
          letterSpacing: '-0.05em',
        }}
      >
        {skin.companyName.charAt(0)}
      </span>
    </div>
  );
}

function HeroIconMark({ skin }: { skin: OrgSkin }) {
  return (
    <div
      aria-hidden
      style={{
        aspectRatio: '1 / 1',
        maxWidth: 240,
        margin: '0 auto',
        background: hexAlpha('#ffffff', 0.10),
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 88,
        border: `1px solid ${hexAlpha('#ffffff', 0.22)}`,
      }}
    >
      {emojiForOrg(skin.slug)}
    </div>
  );
}

function emojiForOrg(slug: string): string {
  if (slug === 'acme-corp') return '🏠';
  if (slug === 'globex-inc') return '🧘';
  if (slug === 'initech') return '📊';
  return '💬';
}

// ---------------------------------------------------------------------------
// Section band — full-bleed sectie met optionele bg
// ---------------------------------------------------------------------------

export function SectionBand({
  skin,
  variant = 'plain',
  children,
  style,
}: {
  skin: OrgSkin;
  variant?: 'plain' | 'tinted' | 'card';
  children: ReactNode;
  style?: CSSProperties;
}) {
  const dark = isHexDark(skin.bgColor);
  const tintedBg = dark ? hexAlpha('#ffffff', 0.03) : hexAlpha('#000000', 0.03);
  const cardBg = dark ? hexAlpha('#ffffff', 0.05) : '#ffffff';

  const bgByVariant = {
    plain: 'transparent',
    tinted: tintedBg,
    card: cardBg,
  } as const;

  return (
    <section
      style={{
        background: bgByVariant[variant],
        padding: '72px 48px',
        ...style,
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>{children}</div>
    </section>
  );
}

/** Section-heading met accent. */
export function SectionHeading({
  skin,
  eyebrow,
  title,
  lead,
  align = 'left',
}: {
  skin: OrgSkin;
  eyebrow?: string;
  title: string;
  lead?: string;
  align?: 'left' | 'center';
}) {
  const theme = buildTheme(skin);
  return (
    <header
      style={{
        marginBottom: 36,
        textAlign: align,
        maxWidth: align === 'center' ? 680 : undefined,
        marginLeft: align === 'center' ? 'auto' : undefined,
        marginRight: align === 'center' ? 'auto' : undefined,
      }}
    >
      {eyebrow && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: skin.primaryColor,
            marginBottom: 10,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.18,
          margin: 0,
          color: skin.textColor,
        }}
      >
        {renderInline(title, theme)}
      </h2>
      {lead && (
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: theme.mutedText,
            margin: '12px 0 0',
          }}
        >
          {renderInline(lead, theme)}
        </p>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Service-extractor: vindt `- **[label](#)** — desc` regels in lists
// ---------------------------------------------------------------------------

export type ServiceItem = {
  label: string;
  description: string;
  emoji: string;
};

/** Extract service-items uit lijst-blocks. Pakt `**label** — desc` pattern. */
export function extractServiceItems(blocks: ParsedBlock[]): ServiceItem[] {
  const items: ServiceItem[] = [];
  for (const b of blocks) {
    if (b.type !== 'list') continue;
    for (const raw of b.items) {
      const parsed = parseServiceLine(raw);
      if (parsed) items.push(parsed);
    }
  }
  return items;
}

function parseServiceLine(line: string): ServiceItem | null {
  // Strip leading link/bold formatting om label te extraheren.
  // Patterns:
  //   **[label](href)** — desc
  //   **label** — desc
  //   **[label](href)** - desc
  //   [label](href) — desc
  //   plain line zonder bold
  const labelMatch =
    line.match(/^\*\*\[([^\]]+)\]\([^)]*\)\*\*\s*[—\-:]\s*(.+)$/) ||
    line.match(/^\*\*([^*]+)\*\*\s*[—\-:]\s*(.+)$/) ||
    line.match(/^\[([^\]]+)\]\([^)]*\)\s*[—\-:]\s*(.+)$/);
  if (labelMatch) {
    const label = labelMatch[1].trim();
    const description = labelMatch[2].trim();
    return { label, description, emoji: emojiForService(label) };
  }
  // Geen pattern → behandel hele regel als label, geen desc
  const plain = line
    .replace(/^\*\*([^*]+)\*\*.*/, '$1')
    .replace(/^\[([^\]]+)\]\([^)]*\).*/, '$1')
    .trim();
  if (plain && plain.length < 80) {
    return { label: plain, description: '', emoji: emojiForService(plain) };
  }
  return null;
}

/** Keyword-based emoji-picker — dekt de meest voorkomende service-namen. */
export function emojiForService(label: string): string {
  const l = label.toLowerCase();
  // Dakwerk
  if (/(bitumen|dakbedek)/.test(l)) return '🏗️';
  if (/(epdm|kunststof)/.test(l)) return '🧱';
  if (/(pannen|leien|riet)/.test(l)) return '🏠';
  if (/(zink|goot|loodwerk)/.test(l)) return '🔧';
  if (/(dakvenster|velux|fakro)/.test(l)) return '🪟';
  if (/(isolat)/.test(l)) return '🧊';
  if (/(zonnepaneel|pv)/.test(l)) return '☀️';
  if (/(asbest)/.test(l)) return '⚠️';
  if (/(monument)/.test(l)) return '🏛️';
  if (/(spoed|lekkage)/.test(l)) return '🚨';
  if (/(onderhoud)/.test(l)) return '🛠️';
  // Fysio
  if (/(manuele|manipulat)/.test(l)) return '🦴';
  if (/(sport|hardloop|loop|knie)/.test(l)) return '🏃';
  if (/(rug|nek|schouder)/.test(l)) return '🧍';
  if (/(dry needling|naald)/.test(l)) return '💉';
  if (/(echog|echo)/.test(l)) return '🩻';
  if (/(oncolog|kanker)/.test(l)) return '🎗️';
  if (/(kinder)/.test(l)) return '🧒';
  if (/(zwanger|bekken)/.test(l)) return '🤰';
  if (/(geriatr|ouder|senior)/.test(l)) return '🧓';
  if (/(neurolog|hersenen)/.test(l)) return '🧠';
  if (/(behandel|therap|revalid)/.test(l)) return '💆';
  if (/(massage)/.test(l)) return '💆';
  // Accountant
  if (/(zzp|eenmans)/.test(l)) return '👤';
  if (/(mkb|bv|bedrijf)/.test(l)) return '🏢';
  if (/(loon|salaris|payroll)/.test(l)) return '💼';
  if (/(btw|omzetbelast)/.test(l)) return '🧾';
  if (/(ib-aangifte|inkomstenbel|aangifte)/.test(l)) return '📋';
  if (/(jaarrekening|balans|samenstel)/.test(l)) return '📑';
  if (/(advies|consult|begeleid)/.test(l)) return '💡';
  if (/(controle|audit)/.test(l)) return '🔍';
  if (/(over|verkoop|due dilig)/.test(l)) return '🤝';
  if (/(erfbelast|schenk)/.test(l)) return '🎁';
  if (/(software|online dossier|twinfield|exact|moneybird|afas)/.test(l)) return '💻';
  if (/(bezwaar|fiscaal)/.test(l)) return '⚖️';
  // Algemeen
  if (/(contact|telefoon|email|bereikbaar)/.test(l)) return '📞';
  if (/(werkgebied|locatie|vestig|adres)/.test(l)) return '📍';
  if (/(faq|vraag)/.test(l)) return '❓';
  if (/(prijs|tarief|kost)/.test(l)) return '💶';
  return '✨';
}
