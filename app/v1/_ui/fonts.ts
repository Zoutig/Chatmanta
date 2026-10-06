import { Plus_Jakarta_Sans } from 'next/font/google';

// Eigen instantie voor V1 met body-gewichten: de root-layout laadt Jakarta
// alleen in 600-800 (voor het V0-wordmark). Los variabelenaam → V0 ongemoeid.
export const v1Font = Plus_Jakarta_Sans({
  variable: '--font-v1',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
