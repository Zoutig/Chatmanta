// Fail-safe vangnet voor de Upstash-rate-limiter — in een EIGEN module zonder
// 'server-only'/'next/headers' zodat het gedrag puur te unit-testen is (zelfde
// patroon als startup-assert.ts).
//
// Waarom dit bestaat: de Upstash REST-call (`ratelimit.limit()`) kan falen —
// Redis down, netwerk, of een misgeconfigureerde credential. Zonder vangnet
// bubbelt die fout door als een 500 op ÉLKE rate-limited route (widget/token,
// chat, feedback, ping, client-error). Op 2026-06-03 legde precies dat de
// publieke widget plat toen er per ongeluk een TCP-connection-string i.p.v. de
// REST-URL stond. Beleid: faal NIET de request — val terug op een per-instance
// in-memory teller (houdt de ergste runaway nog steeds tegen, alleen niet meer
// globaal gedeeld zolang de storing duurt) en sla alarm.

import type { RateLimiter, RateLimitVerdict } from './rate-limit';

/**
 * Voert de primaire (Upstash) check uit; faalt die, dan valt 'ie terug op de
 * meegegeven fallback-limiter en roept `onError` (gedempt alarm). Een falend
 * alarm mag het vangnet zelf nooit ondermijnen, dus dat wordt apart afgevangen.
 *
 * Geëxporteerd als losse functie zodat het fail-safe-contract puur te testen is
 * zonder echte Redis of een 'server-only'-import.
 */
export async function checkWithFallback(
  primary: () => Promise<RateLimitVerdict>,
  fallback: RateLimiter,
  key: string,
  onError?: (err: unknown) => void,
): Promise<RateLimitVerdict> {
  try {
    return await primary();
  } catch (err) {
    try {
      onError?.(err);
    } catch {
      // Een kapot alarm mag de terugval niet blokkeren — slik het bewust.
    }
    return fallback.check(key);
  }
}
