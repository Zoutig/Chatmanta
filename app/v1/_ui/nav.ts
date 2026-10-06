// Pure helpers voor de V1-schil (zijbalk). Geen React, zodat ze los testbaar zijn.
import type { ChatbotStatus } from '@/lib/v0/klantendashboard/types';

/** Hoogte van een nav-item (40px) + gap (2px): de stapgrootte van de glijdende markering. */
export const NAV_ITEM_PITCH = 42;

export function isNavActive(pathname: string, href: string, exact = false): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function activeIndex(
  pathname: string,
  items: ReadonlyArray<{ href: string; exact?: boolean }>,
): number {
  return items.findIndex((i) => isNavActive(pathname, i.href, i.exact));
}

/** Tellertekst voor een menu-item; null = geen teller tonen. */
export function formatCount(n: number | undefined): string | null {
  if (!n || n < 1) return null;
  return n > 99 ? '99+' : String(n);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'CM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export const STATUS_LABEL: Record<ChatbotStatus, string> = {
  concept: 'Concept',
  testing: 'Testmodus',
  live: 'Live',
  paused: 'Gepauzeerd',
};
