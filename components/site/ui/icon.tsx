import type { ReactNode } from 'react';

/**
 * Inline-SVG-iconen uit mockup-final. Kleuren via currentColor; maat via CSS
 * (de omringende sectie zet width/height) of de `size`-prop.
 * Nieuw icoon nodig? Voeg het hier toe (één plek), niet inline in een sectie.
 */
const ICONS = {
  /* 16×16 */
  check: {
    vb: '0 0 16 16',
    d: <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  link: {
    vb: '0 0 16 16',
    d: (
      <path
        d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    ),
  },
  chev: {
    vb: '0 0 16 16',
    d: <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  send: {
    vb: '0 0 16 16',
    d: <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  close: {
    vb: '0 0 16 16',
    d: <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  },
  file: {
    vb: '0 0 16 16',
    d: <path d="M4 1.5h5.5l3 3v10h-8.5z" fill="none" stroke="currentColor" strokeWidth="1.4" />,
  },
  warn: {
    vb: '0 0 16 16',
    d: (
      <>
        <path d="M8 2l6.5 11.5h-13z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 6.5v3M8 11.5v.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  info: {
    vb: '0 0 16 16',
    d: (
      <>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5v4M8 11v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  /* 20×20 — vertrouwensstrook */
  globe: {
    vb: '0 0 20 20',
    d: (
      <>
        <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M2.5 10h15M10 2.5c2.2 2.3 2.2 12.7 0 15M10 2.5c-2.2 2.3-2.2 12.7 0 15" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
  },
  docCheck: {
    vb: '0 0 20 20',
    d: (
      <>
        <path d="M5 2.5h7l3 3v12H5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7.5 10.5l2 2 3.5-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  chat: {
    vb: '0 0 20 20',
    d: (
      <>
        <path d="M3 4.5h14v9H8l-4 3v-3H3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M6.5 8h7M6.5 10.5h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  shieldCheck: {
    vb: '0 0 20 20',
    d: (
      <>
        <path d="M10 2.5l6 2.5v4.5c0 4-2.6 6.6-6 8-3.4-1.4-6-4-6-8V5z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M7.3 10l2 2 3.4-3.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  /* 24×24 — bento / kennisbank */
  inbox: {
    vb: '0 0 24 24',
    d: <path d="M3 13l3-8h12l3 8v6H3z M3 13h5l1 2h6l1-2h5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />,
  },
  database: {
    vb: '0 0 24 24',
    d: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </>
    ),
  },
} satisfies Record<string, { vb: string; d: ReactNode }>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size,
  className,
  title,
}: {
  name: IconName;
  /** px; laat leeg om de maat via CSS te zetten. */
  size?: number;
  className?: string;
  /** Alleen zetten als het icoon zelfstandig betekenis draagt (anders decoratief). */
  title?: string;
}) {
  const icon = ICONS[name];
  return (
    <svg
      viewBox={icon.vb}
      width={size}
      height={size}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {icon.d}
    </svg>
  );
}
