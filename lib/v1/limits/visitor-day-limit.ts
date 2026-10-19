// Daglimiet per bezoeker (org + gehasht IP) op het publieke chatpad
// (security-audit 2026-10, bevinding 4).
//
// Probleem: de widget-token-route kan door elk script worden aangeroepen (Origin/
// Referer zijn zelf in te vullen). Met alleen de minuut-limiet per IP (30/min) en de
// dag-/maandlimiet per ORG kan één IP de daglimiet van een klant (standaard 250) in
// ongeveer 8 minuten opmaken. Daarna ziet elke echte bezoeker "daglimiet bereikt".
//
// Deze bucket begrenst één bezoeker per klant per 24 uur (sliding window). 40 is
// ruim voor een echt gesprek (een bezoeker stelt er doorgaans 1-10) en ook voor een
// klant die zijn eigen widget een middag test, maar zo laag dat één IP hooguit
// ~16% van de standaard-daglimiet kan opmaken. Voor rotatie over veel IP's blijft de
// EUR-cap het vangnet; dit stopt het goedkope enkel-IP-scenario.
//
// Fail-gedrag = gelijk aan de andere limiters: bij een Upstash-storing telt een
// per-instance in-memory teller (nooit een 500). Zonder bruikbaar IP ('unknown'/leeg)
// slaan we deze bucket over (fail-open): anders zouden alle bezoekers zonder IP-header
// één gedeelde bucket delen en elkaar buitensluiten. Op Vercel is x-forwarded-for er
// altijd; de per-IP-minuutlimiet blijft in dat geval gewoon gelden.

import { getOrgIpDayRateLimiter, type RateLimiter } from '@/lib/v0/server/rate-limit';
import { hashIp } from '@/lib/observability/hash-ip';

/** Maximum vragen per bezoeker (org + IP) per 24 uur. Zie de uitleg hierboven. */
export const VISITOR_DAILY_QUESTION_LIMIT = 40;

export const VISITOR_DAY_LIMIT_MESSAGE =
  'Je hebt vandaag het maximum aantal vragen aan deze chatbot gesteld. Probeer het morgen opnieuw.';

export type VisitorDayVerdict = { ok: true } | { ok: false; message: string };

export async function checkVisitorDayLimit(
  orgId: string,
  clientIp: string,
  limiter: RateLimiter = getOrgIpDayRateLimiter(VISITOR_DAILY_QUESTION_LIMIT),
): Promise<VisitorDayVerdict> {
  const ip = clientIp.trim();
  if (!ip || ip === 'unknown') return { ok: true };
  const ipHash = hashIp(ip);
  if (!ipHash) return { ok: true };
  const verdict = await limiter.check(`org-ip-day:${orgId}:${ipHash}`);
  return verdict.allowed ? { ok: true } : { ok: false, message: VISITOR_DAY_LIMIT_MESSAGE };
}
