// Control Room — cross-org overzicht: alle klanten + de samengevatte kaarten +
// aandachtslijsten voor de Overview-pagina (MD §6). getControlRoomKlanten doet
// de per-org fan-out; buildOverviewSummary is een PURE functie over die lijst
// (los te unit-testen).

import 'server-only';

import { listKnownOrgs } from '@/lib/v0/server/active-org';
import { getProfilesMap } from './profiles';
import { getOrgSignals, type ControlRoomKlant } from './signals';

export async function getControlRoomKlanten(): Promise<ControlRoomKlant[]> {
  const orgs = listKnownOrgs();
  const profiles = await getProfilesMap(orgs.map((o) => o.id));
  const klanten = await Promise.all(
    orgs.map((o) => getOrgSignals(o.slug, profiles.get(o.id)!)),
  );
  return klanten;
}

const HEALTH_RANK = { red: 0, orange: 1, green: 2 } as const;
const NO_ACTIVITY_DAYS = 14;

export type OverviewSummary = {
  totalCustomers: number;
  activeCustomers: number;
  trials: number;
  withErrors: number;
  needAttention: number;
  crawlsRunning: number;
  crawlsFailed: number;
  conversationsThisWeek: number;
  conversationsThisMonth: number;
  monthCostUsd: number;
  // Aandachtslijsten
  attention: ControlRoomKlant[];
  failedCrawls: ControlRoomKlant[];
  noRecentActivity: ControlRoomKlant[];
  widgetNotLive: ControlRoomKlant[];
  withUnanswered: ControlRoomKlant[];
};

function isStale(lastActivityAt: string | null): boolean {
  if (!lastActivityAt) return true;
  const t = new Date(lastActivityAt).getTime();
  if (Number.isNaN(t)) return true;
  return Date.now() - t > NO_ACTIVITY_DAYS * 86_400_000;
}

/** PURE: vat de klanten-lijst samen tot kaart-cijfers + gesorteerde
 *  aandachtslijsten. Geen DB/IO — triviaal te testen. */
export function buildOverviewSummary(klanten: ControlRoomKlant[]): OverviewSummary {
  const byHealth = [...klanten].sort(
    (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health],
  );
  return {
    totalCustomers: klanten.length,
    activeCustomers: klanten.filter((k) => k.commercialStatus === 'active').length,
    trials: klanten.filter((k) => k.commercialStatus === 'trial').length,
    withErrors: klanten.filter((k) => k.health === 'red').length,
    needAttention: klanten.filter((k) => k.health !== 'green').length,
    crawlsRunning: klanten.filter((k) => k.crawlStatus === 'processing' || k.crawlStatus === 'pending').length,
    crawlsFailed: klanten.filter((k) => k.crawlAnyFailed).length,
    conversationsThisWeek: klanten.reduce((a, k) => a + k.conversationsThisWeek, 0),
    conversationsThisMonth: klanten.reduce((a, k) => a + k.conversationsThisMonth, 0),
    monthCostUsd: klanten.reduce((a, k) => a + k.monthCostUsd, 0),
    attention: byHealth.filter((k) => k.health !== 'green'),
    failedCrawls: klanten.filter((k) => k.crawlAnyFailed),
    noRecentActivity: klanten.filter((k) => isStale(k.lastActivityAt)),
    widgetNotLive: klanten.filter(
      (k) =>
        (k.commercialStatus === 'active' || k.commercialStatus === 'trial') &&
        k.widgetStatus !== 'active',
    ),
    withUnanswered: klanten
      .filter((k) => k.unansweredCount > 0)
      .sort((a, b) => b.unansweredCount - a.unansweredCount),
  };
}
