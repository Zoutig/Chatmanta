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

// ---------- Dagplafond bevestigingsmails ----------
// De bevestiging gaat naar een door de bezoeker ingevuld adres. De per-IP-limiet
// hierboven stopt geen spammer die over IP's roteert; dit globale plafond begrenst
// het totaal per kalenderdag (UTC). Boven het plafond komt de lead nog wél binnen,
// alleen de bevestiging vervalt. Override via SITE_LEAD_CONFIRM_PER_DAY.

const DEFAULT_CONFIRM_PER_DAY = 50;
const DAY_TTL_SEC = 2 * 24 * 60 * 60;

let _budget: { take(): Promise<boolean> } | null = null;

export function getConfirmationBudget(): { take(): Promise<boolean> } {
  if (_budget) return _budget;
  const raw = Number(process.env.SITE_LEAD_CONFIRM_PER_DAY);
  const cap = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CONFIRM_PER_DAY;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redis = process.env.USE_UPSTASH === 'true' && url && token ? new Redis({ url, token }) : null;

  // In-memory terugval (per instance): bij een Redis-storing liever een iets
  // ruimer effectief plafond dan bevestigingen helemaal blokkeren.
  const local = { day: '', count: 0 };
  const takeLocal = (day: string) => {
    if (local.day !== day) {
      local.day = day;
      local.count = 0;
    }
    local.count += 1;
    return local.count <= cap;
  };

  _budget = {
    async take() {
      const day = new Date().toISOString().slice(0, 10);
      if (!redis) return takeLocal(day);
      try {
        const key = `@chatmanta/site-lead-confirm:${day}`;
        const n = await redis.incr(key);
        if (n === 1) await redis.expire(key, DAY_TTL_SEC);
        return n <= cap;
      } catch {
        return takeLocal(day);
      }
    },
  };
  return _budget;
}
