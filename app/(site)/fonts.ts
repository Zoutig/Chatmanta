// Site-fonts (gedeeld door app/(site)/layout.tsx en app/global-not-found.tsx).
import { Azeret_Mono, Plus_Jakarta_Sans } from 'next/font/google';

// Plus Jakarta Sans als variable font (één bestand, dekt 400-800). Enige UI-font.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-site',
  display: 'swap',
});
// Azeret Mono ALLEEN voor het codefragment (gewone 0, geen punt/streep). Niet preloaden:
// staat ver onder de vouw.
const azeret = Azeret_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-site-mono',
  display: 'swap',
  preload: false,
});

export const siteFontClasses = `${jakarta.variable} ${azeret.variable}`;
