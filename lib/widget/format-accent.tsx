// Parser voor de launcher-tooltip / chatknop-tekst van de klant-widget.
//
// Klanten typen in /klantendashboard/widget een korte boodschap die rondom
// de chat-knop wordt getoond. Met enkele sterretjes mag de klant woorden
// accentueren — `Hoi! *Heb je een vraag?*` → "Hoi!" plain + de rest bold
// in de accent-kleur (header-color van de widget).
//
// Bewust simpel:
//   - alleen `*woord(en)*` met enkele sterretjes
//   - geen nesting, geen escape, geen markdown beyond accent
//   - onbalans (`*foo`) of dubbele sterretjes (`**bold**`) blijven as-is —
//     dubbel-* is het terrein van de bot's markdown-lite in chat-antwoorden
//     (zie chatmanta-widget.tsx → renderMarkdownLite)

import type { ReactNode } from 'react';

/**
 * Render een tekst met `*accent*`-syntax als React-nodes. Alles tussen
 * enkele sterretjes wordt bold + accent-color. Leeg/whitespace-only input
 * → lege array; caller bepaalt zelf de fallback.
 */
export function formatAccentText(raw: string, accentColor: string): ReactNode[] {
  if (!raw) return [];
  // Match alleen sterretjes die NIET door een ander sterretje omringd zijn —
  // zo blijft de bot's `**bold**` (uit chat-antwoorden) gespaard, ook als hij
  // ergens in deze tekst zou voorkomen. Lookbehind+lookahead wordt sinds
  // ES2018 / Node 10 in alle moderne browsers ondersteund.
  const parts = raw.split(/((?<!\*)\*[^*\n]+\*(?!\*))/g);
  return parts
    .filter((p) => p.length > 0)
    .map((part, i) => {
      if (part.length >= 3 && part.startsWith('*') && part.endsWith('*')) {
        return (
          <strong
            key={i}
            style={{ color: accentColor, fontWeight: 600 }}
          >
            {part.slice(1, -1)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
}
