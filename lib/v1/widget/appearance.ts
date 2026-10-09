// Uiterlijk van de V1-widget: één vorm voor de echte widget (embed), Preview en
// het live voorbeeld op het Widget-scherm.
//
// Pure module: geen React, geen 'use client', geen server-only. Wordt zowel in
// de server-loader (load-embed) als in client-componenten gebruikt. Alleen
// `import type` uit settings-config: een waarde-import sleept server-code mee de
// client-bundels in.
//
// Privacy: toWidgetAppearance kiest elk veld expliciet. chatbots.settings bevat
// ook interne velden (notificationEmail, extraInstructions, contactgegevens);
// die mogen nooit naar de anonieme bezoekers-widget. Nooit spreaden.

import type { V1ChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import type { WidgetLogoStyle, WidgetPosition } from '@/lib/v0/klantendashboard/types';

export type WidgetAppearance = {
  accentColor: string;
  position: WidgetPosition;
  headerTitle: string;
  subtitle: string;
  welcomeMessage: string;
  launcherText: string;
  logoStyle: WidgetLogoStyle;
  /** Alleen gezet als logoStyle 'custom-logo' is én de data-URL geldig is. */
  customLogoDataUrl: string | null;
  starterQuestions: string[];
};

export const DEFAULT_ACCENT = '#0C1E2E';
export const MAX_STARTERS = 4;
export const MAX_STARTER_CHARS = 120;

// Zelfde regel als de server (settings-config): alleen #rrggbb wordt opgeslagen.
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const LOGO_DATA_URL_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isValidAccent(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

export function safeAccent(value: string | null | undefined): string {
  const v = (value ?? '').trim();
  return HEX_COLOR_RE.test(v) ? v : DEFAULT_ACCENT;
}

/**
 * Alleen een base64-afbeelding als data-URL. Wordt uitsluitend in <img src>
 * gebruikt (geen CSS, geen innerHTML): daar draait ook een SVG geen script.
 */
export function safeLogoDataUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return LOGO_DATA_URL_RE.test(value) ? value : null;
}

export function normalizeStarters(list: unknown, show: boolean | undefined): string[] {
  if (show === false || !Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const q = item.trim();
    if (!q) continue;
    const shown = q.length > MAX_STARTER_CHARS ? `${q.slice(0, MAX_STARTER_CHARS - 1).trimEnd()}…` : q;
    // Dubbele vragen één keer tonen (ook als React-key uniek).
    if (out.includes(shown)) continue;
    out.push(shown);
    if (out.length === MAX_STARTERS) break;
  }
  return out;
}

type AppearanceSource = Pick<
  V1ChatbotSettings,
  | 'accentColor'
  | 'position'
  | 'headerTitle'
  | 'chatbotName'
  | 'subtitle'
  | 'welcomeMessage'
  | 'launcherText'
  | 'logoStyle'
  | 'customLogoDataUrl'
  | 'starterQuestions'
  | 'showStarterQuestions'
>;

export function toWidgetAppearance(s: AppearanceSource, fallbackTitle = 'Chat'): WidgetAppearance {
  const logo = s.logoStyle === 'custom-logo' ? safeLogoDataUrl(s.customLogoDataUrl) : null;
  const logoStyle: WidgetLogoStyle =
    s.logoStyle === 'custom-logo' ? (logo ? 'custom-logo' : 'chat-bubble') : s.logoStyle === 'brand-mark' ? 'brand-mark' : 'chat-bubble';
  return {
    accentColor: safeAccent(s.accentColor),
    position: s.position === 'bottom-left' ? 'bottom-left' : 'bottom-right',
    headerTitle: (s.headerTitle ?? '').trim() || (s.chatbotName ?? '').trim() || fallbackTitle,
    subtitle: (s.subtitle ?? '').trim(),
    welcomeMessage: s.welcomeMessage ?? '',
    launcherText: s.launcherText ?? '',
    logoStyle,
    customLogoDataUrl: logo,
    starterQuestions: normalizeStarters(s.starterQuestions, s.showStarterQuestions),
  };
}
