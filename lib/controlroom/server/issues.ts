// Control Room — Issues (MD §15). AFGELEID uit bestaande faalsignalen i.p.v.
// een nieuwe error_logs write-path. PURE functie over de al-opgehaalde
// ControlRoomKlant-lijst: geen extra queries nodig (de signalen — crawl-fail,
// fallback, widget, technische status — zitten al in het klant-object).

import { HIGH_FALLBACK_PCT } from './health';
import type { ControlRoomKlant } from './signals';

export type IssueSeverity = 'critical' | 'warning' | 'info';

export type ControlRoomIssue = {
  severity: IssueSeverity;
  orgSlug: string;
  orgName: string;
  title: string;
  detail: string;
  /** Tab op de klantdetailpagina die de context toont. */
  tab: string;
};

const SEVERITY_RANK: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Leidt de cross-org issue-lijst af uit de klant-signalen. */
export function buildIssues(klanten: ControlRoomKlant[]): ControlRoomIssue[] {
  const issues: ControlRoomIssue[] = [];
  for (const k of klanten) {
    const base = { orgSlug: k.slug, orgName: k.name };

    if (k.technicalStatus === 'error') {
      issues.push({ ...base, severity: 'critical', title: 'Technische status: error', detail: 'Geen actieve bronnen en/of gefaalde crawl — bot niet bruikbaar.', tab: 'overzicht' });
    }
    if (k.crawlAnyFailed) {
      issues.push({ ...base, severity: k.sources.total === 0 ? 'critical' : 'warning', title: 'Laatste crawl gefaald', detail: k.crawlError ?? 'Een website-crawl is mislukt.', tab: 'jobs' });
    }
    if ((k.commercialStatus === 'active' || k.commercialStatus === 'trial') && k.widgetStatus !== 'active') {
      issues.push({ ...base, severity: 'warning', title: 'Widget niet live', detail: k.widgetStatus === 'detected' ? 'Widget gevonden maar nog niet actief.' : 'Widget nog niet geplaatst, terwijl de klant commercieel actief/trial is.', tab: 'widget' });
    }
    if (k.fallbackPct != null && k.fallbackPct > HIGH_FALLBACK_PCT) {
      issues.push({ ...base, severity: 'warning', title: `Hoog fallback-percentage (${k.fallbackPct}%)`, detail: 'De bot kan veel vragen niet beantwoorden — bronnen/kennis aanvullen.', tab: 'gesprekken' });
    }
    if (k.technicalStatus === 'disabled' && k.commercialStatus === 'active') {
      issues.push({ ...base, severity: 'critical', title: 'Bot uitgeschakeld bij actieve klant', detail: 'Technische status is uitgeschakeld terwijl de klant commercieel actief is.', tab: 'overzicht' });
    }
    if (k.unansweredCount > 0) {
      issues.push({ ...base, severity: 'info', title: `${k.unansweredCount} onbeantwoorde vraag/vragen`, detail: 'Fallback-vragen in de laatste 30 dagen — kandidaat voor kennisbank-aanvulling.', tab: 'gesprekken' });
    }
  }
  return issues.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.orgName.localeCompare(b.orgName),
  );
}
