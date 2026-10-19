// Daglimieten op de publieke V1-paden (security-audit 2026-10, bevindingen 4 en 5).
//
// Probleem: de widget-token-route kan door elk script worden aangeroepen (Origin/
// Referer zijn zelf in te vullen). Met alleen minuut-limieten kan één IP:
//   - de daglimiet van een klant (standaard 250 vragen) in ~8 minuten opmaken, waarna
//     elke echte bezoeker "daglimiet bereikt" ziet (#4);
//   - de klant met duizenden contactverzoek-mails per dag bestoken (#5).
//
// Alle buckets zijn sliding windows van 24 uur via de bestaande Upstash-limiter
// (getDayRateLimiter, eigen prefix per bucket). Fail-gedrag = gelijk aan de andere
// limiters: bij een Upstash-storing telt een per-instance in-memory teller (nooit een
// 500). Zonder bruikbaar IP ('unknown'/leeg) slaan we de per-IP-buckets over
// (fail-open): anders delen alle bezoekers zonder IP-header één bucket en sluiten ze
// elkaar buiten. Op Vercel is x-forwarded-for er altijd. Sleutels bevatten alleen
// het gehashte IP (AVG).

import { getDayRateLimiter, type RateLimiter } from '@/lib/v0/server/rate-limit';
import { hashIp } from '@/lib/observability/hash-ip';

/**
 * Maximum chatvragen per bezoeker (org + IP) per 24 uur. 40 is ruim voor een echt
 * gesprek (doorgaans 1-10 vragen) en voor een klant die zijn eigen widget een middag
 * test, maar één IP kan zo hooguit ~16% van de standaard-daglimiet opmaken. Voor
 * rotatie over veel IP's blijft de EUR-cap per org het vangnet.
 */
export const VISITOR_DAILY_QUESTION_LIMIT = 40;

/** Maximum contactverzoeken per bezoeker (org + IP) per 24 uur. Een mens stuurt er
 *  één, hooguit een correctie; 5 laat ruimte voor een gedeeld kantoor-IP. */
export const VISITOR_DAILY_CONTACT_LIMIT = 5;

/**
 * Maximum notificatiemails over contactverzoeken per org per 24 uur. Daarboven komt
 * het verzoek nog wél binnen (zichtbaar in het dashboard), alleen de mail vervalt:
 * een echte lead gaat nooit verloren, en de inbox van de klant en de reputatie van
 * ons verzenddomein blijven heel. 30 ligt ver boven wat een MKB-site per dag krijgt.
 */
export const ORG_DAILY_CONTACT_MAIL_LIMIT = 30;

export const VISITOR_DAY_LIMIT_MESSAGE =
  'Je hebt vandaag het maximum aantal vragen aan deze chatbot gesteld. Probeer het morgen opnieuw.';

export type VisitorDayVerdict = { ok: true } | { ok: false; message: string };

async function checkPerIp(limiter: RateLimiter, bucket: string, orgId: string, clientIp: string): Promise<boolean> {
  const ip = clientIp.trim();
  if (!ip || ip === 'unknown') return true;
  const ipHash = hashIp(ip);
  if (!ipHash) return true;
  return (await limiter.check(`${bucket}:${orgId}:${ipHash}`)).allowed;
}

/** Chat: daglimiet per (org, bezoeker-IP). */
export async function checkVisitorDayLimit(
  orgId: string,
  clientIp: string,
  limiter: RateLimiter = getDayRateLimiter('org-ip-chat', VISITOR_DAILY_QUESTION_LIMIT),
): Promise<VisitorDayVerdict> {
  return (await checkPerIp(limiter, 'org-ip-day', orgId, clientIp))
    ? { ok: true }
    : { ok: false, message: VISITOR_DAY_LIMIT_MESSAGE };
}

/** Contactformulier: daglimiet per (org, bezoeker-IP). false = weigeren (429). */
export async function allowVisitorContactToday(
  orgId: string,
  clientIp: string,
  limiter: RateLimiter = getDayRateLimiter('org-ip-contact', VISITOR_DAILY_CONTACT_LIMIT),
): Promise<boolean> {
  return checkPerIp(limiter, 'org-ip-contact-day', orgId, clientIp);
}

/** Contactformulier: mag er vandaag nog een notificatiemail naar deze org? */
export async function allowOrgContactMailToday(
  orgId: string,
  limiter: RateLimiter = getDayRateLimiter('org-contact-mail', ORG_DAILY_CONTACT_MAIL_LIMIT),
): Promise<boolean> {
  return (await limiter.check(`org-contact-mail-day:${orgId}`)).allowed;
}
