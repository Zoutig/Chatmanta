import 'server-only';

// Eigen rate-limit-bucket voor het kennismakingsformulier. Hergebruikt de
// bestaande limiter-klassen uit lib/v0/server/rate-limit.ts (Upstash sliding
// window met fail-safe in-memory-terugval), met dezelfde env-keuze als
// buildLimiter() daar: USE_UPSTASH=true + UPSTASH_REDIS_REST_URL/_TOKEN → Redis,
// anders per-process in-memory. buildLimiter zelf is niet geëxporteerd; de
// factory hieronder spiegelt 'm in vier regels i.p.v. het gedeelde bestand aan te
// passen (contract: niet buiten het eigen pakket wijzigen).
//
// Een eigen bucket (prefix @chatmanta/rl-site-lead), zodat formulier-spam het
// chat-/mutatiebudget van V0 niet leegtrekt en omgekeerd. Streng: een mens
// verstuurt dit formulier hooguit een paar keer.

import { Redis } from '@upstash/redis';
import { InMemoryRateLimiter, UpstashRateLimiter, type RateLimiter } from '@/lib/v0/server/rate-limit';

const DEFAULT_PER_MIN = 3;

let _instance: RateLimiter | null = null;

export function getKennismakingRateLimiter(): RateLimiter {
  if (_instance) return _instance;
  const raw = Number(process.env.SITE_LEAD_RATE_LIMIT_PER_MIN);
  const limit = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_PER_MIN;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  _instance =
    process.env.USE_UPSTASH === 'true' && url && token
      ? new UpstashRateLimiter({
          maxRequestsPerMin: limit,
          prefix: '@chatmanta/rl-site-lead',
          redis: new Redis({ url, token }),
        })
      : new InMemoryRateLimiter({ maxRequestsPerMin: limit });
  return _instance;
}
