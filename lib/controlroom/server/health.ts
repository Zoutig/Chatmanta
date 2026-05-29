// Control Room — afgeleide technische status + health (MD §6.3 / §8.2).
//
// PURE functies (geen 'server-only', geen DB) zodat ze los te unit-testen zijn.
// De DB-signalen worden door signals.ts verzameld en hier ingevoerd. Een
// handmatige technical_status_override (admin_org_profile) wint altijd.

import type { WidgetStatus } from '@/lib/v0/klantendashboard/types';
import type { CrawlJobStatus } from '@/lib/v0/server/crawler';
import type {
  CommercialStatus,
  HealthStatus,
  TechnicalStatus,
} from '../types';

/** Genormaliseerde signalen per org — de input voor de derive-functies. */
export type OrgSignals = {
  hasActiveSources: boolean;
  sourceCount: number;
  widgetStatus: WidgetStatus;
  crawlLatestStatus: CrawlJobStatus | null;
  crawlAnyFailed: boolean;
  /** % gesprekken deze maand dat op fallback eindigde (null = nog geen verkeer). */
  fallbackPct: number | null;
  conversationsThisMonth: number;
  conversationsThisWeek: number;
  /** Open error-severity fout-groepen in de laatste 24u (admin_error_groups).
   *  Optioneel → default 0, zodat bestaande callers/tests niet breken. */
  recentCriticalErrorCount?: number;
};

/** Vanaf dit fallback-% (inclusief) rekenen we een bot als "veel fallback" → degraded. */
export const HIGH_FALLBACK_PCT = 10;

/**
 * Technische botstatus afgeleid uit signalen (MD §8.2). Volgorde = prioriteit:
 * een handmatige override wint; daarna error > degraded > live > ready > setup.
 */
export function deriveTechnicalStatus(
  s: OrgSignals,
  override: TechnicalStatus | null,
): TechnicalStatus {
  if (override) return override;
  if (s.crawlAnyFailed && !s.hasActiveSources) return 'error';
  if (s.crawlAnyFailed && s.hasActiveSources) return 'degraded';
  if (s.fallbackPct != null && s.fallbackPct >= HIGH_FALLBACK_PCT) return 'degraded';
  if (s.widgetStatus === 'active' && s.hasActiveSources) return 'live';
  if (s.hasActiveSources) return 'ready_for_testing';
  return 'setup';
}

export type HealthResult = { status: HealthStatus; reasons: string[] };

/**
 * Health (groen/oranje/rood) afgeleid uit technische status + signalen +
 * commerciële context (MD §6.3). Rood = bot niet bruikbaar of duidelijke fout;
 * oranje = aandacht nodig maar werkt nog; groen = alles in orde.
 */
export function deriveHealth(
  s: OrgSignals,
  technicalStatus: TechnicalStatus,
  commercialStatus: CommercialStatus,
): HealthResult {
  // ── Rood ──────────────────────────────────────────────────────────────
  const red: string[] = [];
  if (technicalStatus === 'error') red.push('Technische status: error');
  if (technicalStatus === 'disabled' && commercialStatus === 'active') {
    red.push('Commercieel actief maar bot uitgeschakeld');
  }
  if (commercialStatus === 'active' && s.widgetStatus === 'not_installed') {
    red.push('Commercieel actief maar widget niet geplaatst');
  }
  if (s.crawlAnyFailed && !s.hasActiveSources) {
    red.push('Laatste crawl gefaald en geen actieve bronnen');
  }
  if (red.length > 0) return { status: 'red', reasons: red };

  // ── Oranje ────────────────────────────────────────────────────────────
  const orange: string[] = [];
  if (technicalStatus === 'degraded') orange.push('Werkt deels');
  if (s.crawlAnyFailed) orange.push('Laatste crawl gefaald');
  if (s.widgetStatus === 'detected') orange.push('Widget gevonden maar nog niet actief');
  if (s.fallbackPct != null && s.fallbackPct >= HIGH_FALLBACK_PCT) {
    orange.push('Hoog fallback-percentage');
  }
  const recentErrors = s.recentCriticalErrorCount ?? 0;
  if (recentErrors > 0) {
    orange.push(`${recentErrors} recente fout${recentErrors === 1 ? '' : 'en'} gelogd (24u)`);
  }
  // Onboarding-voortgang telt bewust NIET mee in health — dat is een
  // commerciële/operationele indicator (zie de Onboarding-tab), geen signaal
  // over de technische gezondheid van de bot.
  if (orange.length > 0) return { status: 'orange', reasons: orange };

  // ── Groen ─────────────────────────────────────────────────────────────
  return { status: 'green', reasons: ['Bot live, bronnen actief, geen open issues'] };
}
