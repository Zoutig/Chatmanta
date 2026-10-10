// Inline-SVG icoonset voor het klantendashboard-designsysteem (geport uit het
// Quiet-Light/Aurora-prototype). currentColor + stroke 1.6, sizes via prop.
// Server-component: puur presentational, geen state.
//
// Bewust een eigen set i.p.v. lucide voor de nieuwe schermen: één consistente
// stroke-taal en geen per-icoon import. Bestaande schermen mogen lucide blijven
// gebruiken tot ze herbouwd worden.

import type { CSSProperties } from 'react';

export type IconName =
  | 'home'
  | 'library'
  | 'play'
  | 'sliders'
  | 'code'
  | 'chat'
  | 'user'
  | 'arrow-right'
  | 'arrow-up-right'
  | 'check'
  | 'sparkles'
  | 'alert'
  | 'plus'
  | 'search'
  | 'bell'
  | 'sun'
  | 'moon'
  | 'trend-up'
  | 'message'
  | 'doc'
  | 'globe'
  | 'help'
  | 'dot'
  | 'wand'
  | 'inbox';

export function Icon({
  name,
  size = 16,
  strokeWidth = 1.6,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
}) {
  const s: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-block',
    verticalAlign: 'middle',
    flexShrink: 0,
    ...style,
  };
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" {...p} />
        </svg>
      );
    case 'library':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M4 5v15M9 5v15M14 5l5 14M19 5l-5 14" {...p} />
        </svg>
      );
    case 'play':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="9" {...p} />
          <path d="M10 9l5 3-5 3z" {...p} fill="currentColor" />
        </svg>
      );
    case 'sliders':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M4 6h10M4 18h6M14 12h6M4 12h6M18 4v4M14 16v4" {...p} />
        </svg>
      );
    case 'code':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" {...p} />
        </svg>
      );
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M4 5h16v11H8l-4 4z" {...p} />
        </svg>
      );
    case 'user':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="9" r="3.5" {...p} />
          <path d="M5 20a7 7 0 0 1 14 0" {...p} />
        </svg>
      );
    case 'arrow-right':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M5 12h14M13 6l6 6-6 6" {...p} />
        </svg>
      );
    case 'arrow-up-right':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M7 17L17 7M9 7h8v8" {...p} />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M5 12l5 5L20 7" {...p} strokeWidth={strokeWidth + 0.4} />
        </svg>
      );
    case 'sparkles':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M12 4v4M12 16v4M4 12h4M16 12h4M7 7l2 2M17 17l-2-2M7 17l2-2M17 7l-2 2" {...p} />
        </svg>
      );
    case 'alert':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M12 8v5M12 16v.5M3 19l9-15 9 15z" {...p} />
        </svg>
      );
    case 'plus':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M12 5v14M5 12h14" {...p} />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="11" cy="11" r="6" {...p} />
          <path d="M16 16l4 4" {...p} />
        </svg>
      );
    case 'bell':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3zM10 19a2 2 0 0 0 4 0" {...p} />
        </svg>
      );
    case 'sun':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="4" {...p} />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" {...p} />
        </svg>
      );
    case 'moon':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10z" {...p} />
        </svg>
      );
    case 'trend-up':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M4 17l6-6 4 4 6-7M14 8h6v6" {...p} />
        </svg>
      );
    case 'message':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M4 5h16v11H8l-4 4z" {...p} />
        </svg>
      );
    case 'doc':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M6 3h9l5 5v13H6z M15 3v5h5" {...p} />
        </svg>
      );
    case 'globe':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="9" {...p} />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" {...p} />
        </svg>
      );
    case 'help':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="9" {...p} />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 1-1 1.7M12 17v.5" {...p} />
        </svg>
      );
    case 'dot':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      );
    case 'wand':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M15 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM4 20l7-7M14 11l3 3" {...p} />
        </svg>
      );
    case 'inbox':
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <path d="M4 13l3-9h10l3 9v6H4zM4 13h5l1 2h4l1-2h5" {...p} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" style={s}>
          <circle cx="12" cy="12" r="6" {...p} />
        </svg>
      );
  }
}
