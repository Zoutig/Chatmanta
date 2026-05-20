// SVG icon-bank — geport van het ChatManta design (lucide-stijl, 1.6 stroke).
// Geen externe dep om de bundel klein te houden.

type IconName =
  | 'plus' | 'search' | 'dots' | 'send' | 'attach' | 'sparkle' | 'sliders'
  | 'docs' | 'embed' | 'panel-right' | 'copy' | 'thumb-up' | 'thumb-down'
  | 'refresh' | 'check' | 'upload' | 'x' | 'caret' | 'globe' | 'sun' | 'moon'
  | 'monitor' | 'log-out' | 'command' | 'list' | 'trash' | 'edit' | 'alert'
  | 'folder' | 'menu';

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };
  switch (name) {
    case 'plus':
      return (<svg {...props}><path d="M12 5v14M5 12h14" /></svg>);
    case 'search':
      return (<svg {...props}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>);
    case 'dots':
      return (<svg {...props}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>);
    case 'send':
      return (<svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
    case 'attach':
      return (<svg {...props}><path d="m21 12-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" /></svg>);
    case 'sparkle':
      return (<svg {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2" /></svg>);
    case 'sliders':
      return (<svg {...props}><line x1="4" y1="6" x2="11" y2="6" /><line x1="15" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="6" y2="12" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="13" y2="18" /><line x1="17" y1="18" x2="20" y2="18" /><circle cx="13" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></svg>);
    case 'docs':
      return (<svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h4" /></svg>);
    case 'embed':
      return (<svg {...props}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>);
    case 'panel-right':
      return (<svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" /></svg>);
    case 'copy':
      return (<svg {...props}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
    case 'thumb-up':
      return (<svg {...props}><path d="M7 10v12M15 5.88 14 10h5.5a2 2 0 0 1 2 2.5l-2 7a2 2 0 0 1-2 1.5H7" /></svg>);
    case 'thumb-down':
      return (<svg {...props}><path d="M17 14V2M9 18.12 10 14H4.5a2 2 0 0 1-2-2.5l2-7A2 2 0 0 1 6.5 3h10" /></svg>);
    case 'refresh':
      return (<svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>);
    case 'check':
      return (<svg {...props}><path d="M20 6 9 17l-5-5" /></svg>);
    case 'upload':
      return (<svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
    case 'x':
      return (<svg {...props}><path d="M18 6 6 18M6 6l12 12" /></svg>);
    case 'caret':
      return (<svg {...props}><path d="m6 9 6 6 6-6" /></svg>);
    case 'globe':
      return (<svg {...props}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" /></svg>);
    case 'sun':
      return (<svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>);
    case 'moon':
      return (<svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>);
    case 'monitor':
      return (<svg {...props}><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>);
    case 'log-out':
      return (<svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
    case 'command':
      // Lucide layout-dashboard — 4-vakken grid.
      return (<svg {...props}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>);
    case 'list':
      return (<svg {...props}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>);
    case 'trash':
      return (<svg {...props}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></svg>);
    case 'edit':
      return (<svg {...props}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>);
    case 'alert':
      return (<svg {...props}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>);
    case 'folder':
      return (<svg {...props}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>);
    case 'menu':
      return (<svg {...props}><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>);
    default:
      return null;
  }
}

