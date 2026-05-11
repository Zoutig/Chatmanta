import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

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

// Inline FOUC-prevention: zet <html class="dark"> + data-theme + data-style
// synchroon vóór React hydrateert. Twee onafhankelijke IIFE's zodat een fout
// in de ene block de andere niet blokkeert.
const themeBootScript = `
(function() {
  try {
    var k = 'chatmanta-theme';
    var c = localStorage.getItem(k);
    if (c !== 'light' && c !== 'dark' && c !== 'system') c = 'system';
    var resolved = c;
    if (c === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    root.setAttribute('data-theme', resolved);
  } catch (e) {}
})();
(function() {
  try {
    var k = 'chatmanta-style';
    var s = localStorage.getItem(k);
    if (s !== 'classic' && s !== 'refined') s = 'classic';
    document.documentElement.setAttribute('data-style', s);
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
