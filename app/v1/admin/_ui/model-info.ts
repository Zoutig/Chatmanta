// V1 admin — wat V1 écht draait, rechtstreeks uit de RAG-config (geen hardcoded
// modelnamen meer op Instellingen). V1 erft de LATEST V0-bot + V1-overrides
// (app/v1/app/rag-config.ts); de index-versie per chatbot kiest het embeddingmodel.
// Alleen lezen. Server-only gebruik (rag-config trekt de bot-registry mee).

import 'server-only';

import { V1_RAG_DEFAULTS } from '@/app/v1/app/rag-config';
import { LATEST_BOT_VERSION } from '@/lib/v0/server/bots';
import { embedModelFor, type IndexVersion } from '@/lib/rag/index-version';

export type V1ModelInfo = {
  inheritedBotVersion: string;
  chatModel: string;
  chatServiceTier: string | null;
  auxModel: string;
  auxServiceTier: string | null;
  cascade: string | null;
  similarityThreshold: number;
  cacheEnabled: boolean;
};

export function getV1ModelInfo(): V1ModelInfo {
  const c = V1_RAG_DEFAULTS;
  return {
    inheritedBotVersion: LATEST_BOT_VERSION,
    chatModel: c.chatModel,
    chatServiceTier: c.chatServiceTier ?? null,
    auxModel: c.auxModel ?? c.chatModel,
    auxServiceTier: c.auxServiceTier ?? null,
    cascade: c.cascadeOnLowConfidence ? c.cascadeModel : null,
    similarityThreshold: c.similarityThreshold,
    cacheEnabled: c.cacheEnabled === true,
  };
}

/** 'priority' in de config betekent: Fast mode bij klanten waar die aan staat
 *  (organizations.fast_mode_enabled, lib/v1/limits/fast-mode.ts); anders standaard. */
export function serviceTierLabel(tier: string | null): string {
  return tier === 'priority' ? 'Fast mode alleen bij klanten waar die aan staat, anders standaard' : 'standaard snelheid';
}

export function embeddingLabel(v: IndexVersion): string {
  return `${embedModelFor(v)} (index ${v})`;
}
