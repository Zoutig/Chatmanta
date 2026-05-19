import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import './styles/manta.css';

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'] });
// Plus Jakarta Sans alleen voor het ChatManta-wordmark in de sidebar.
const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'ChatManta V0',
  description: 'V0 RAG demo — Jorion Solutions.',
};

// Mobiele schaling + iOS safe-area. Zonder dit rendert elke mobiele browser
// de hele app als een 980px-desktop in mini — alle responsive @media rules
// blijven dan dood.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

// Inline FOUC-prevention: zet <html class="dark"> + data-theme + data-style
// synchroon vóór React hydrateert. Twee onafhankelijke IIFE's zodat een fout
// in de ene block de andere niet blokkeert.
const themeBootScript = `
(function() {
  try {
    var k = 'chatmanta-theme';
    var c = localStorage.getItem(k);
    // Default voor nieuwe sessies: 'light' (volgt user-preference 2026-05-12).
    if (c !== 'light' && c !== 'dark' && c !== 'system') c = 'light';
    var resolved = c;
    if (c === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.setAttribute('data-theme', resolved);
  } catch (e) {}
})();
(function() {
  try {
    var k = 'chatmanta-style';
    var s = localStorage.getItem(k);
    // Migratie: 'refined' en 'glass' beide → 'classic'. Glass-CSS werd door
    // Tailwind v4 PostCSS uit de bundle gestript waardoor het visueel gelijk
    // werd aan Classic; optie is verwijderd uit de UI.
    if (s === 'refined' || s === 'glass') {
      s = 'classic';
      try { localStorage.setItem(k, s); } catch (e) {}
    }
    // Default voor nieuwe sessies = 'manta'. Bestaande classic-keuze blijft.
    if (s !== 'classic' && s !== 'manta') s = 'manta';
    document.documentElement.setAttribute('data-style', s);
  } catch (e) {}
})();
(function() {
  try {
    var k = 'chatmanta-accent';
    var a = localStorage.getItem(k);
    var valid = { '#00CC9B': 1, '#009292': 1, '#01637E': 1, '#024D50': 1 };
    if (!a || !valid[a]) a = '#009292';
    document.documentElement.setAttribute('data-accent', a);
    document.documentElement.style.setProperty('--manta-accent', a);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="nl"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrains.variable} ${jakarta.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
