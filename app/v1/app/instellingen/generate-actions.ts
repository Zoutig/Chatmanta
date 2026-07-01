'use server';

// V1 AI-genereer-acties voor de Instellingen-pagina — directe port van V0's
// #4/#5/#6 actions (app/klantendashboard/actions.ts).
//
// Auth (SA-1): getSessionOrg + requireOrgMember vóór elke service-role-call.
// Cost-rem: per-org 'generate:'-bucket (gedeeld met V0's mutation-limiter maar
// eigen sleutel zodat crawl/mutatie-budgetten elkaar niet verdringen).
// Prompts zijn 1-op-1 overgenomen uit lib/v0/klantendashboard/server/generate.ts
// (de PorteZe-regel: faithful copy, geen vereenvoudiging van de LLM-instructies).
// Contact-extract leest V1-pagina's uit documents (source='website') + hun chunks
// in plaats van V0's website_pages-tabel (pages-as-documents, PR-3a).

import { getSessionOrg, requireOrgMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/v1/server';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { AppError, isAppError } from '@/lib/errors/app-error';
import { actionTry, type ActionResult, type ActionFail } from '@/lib/errors/action';
import { getOrgRateLimiter } from '@/lib/v0/server/rate-limit';
import {
  generateStarterQuestions,
  generateFallbackMessage,
  extractContactInfo,
  type ExtractedContact,
} from '@/lib/v0/klantendashboard/server/generate';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from './settings-config';

/** Map een auth-fout naar ActionFail; laat NEXT_REDIRECT (geen sessie) propageren. */
function authFail(e: unknown): ActionFail {
  if (isAppError(e)) return { ok: false, error: e.message, code: e.code, retryAfterSec: e.retryAfterSec };
  throw e;
}

type GenerateCtx = { orgId: string; chatbotId: string };

/** Resolve org (uit de sessie) + chatbot en gooi bij auth-/setup-fouten. */
async function requireGenerateCtx(): Promise<GenerateCtx> {
  const { orgId } = await getSessionOrg();
  await requireOrgMember(orgId);
  const svc = getV1ServiceRoleClient();
  const chatbot = await getOrgChatbot(svc, orgId);
  if (!chatbot) {
    throw new AppError('NOT_FOUND', { message: 'Geen chatbot geconfigureerd voor deze organisatie.' });
  }
  return { orgId, chatbotId: chatbot.id };
}

/** Gedeelde rate-limit-check voor alle generate-acties. */
async function checkGenerateLimit(orgId: string): Promise<ActionFail | null> {
  const rl = await getOrgRateLimiter().check(`generate:${orgId}`);
  if (!rl.allowed) {
    return {
      ok: false,
      code: 'RATE_LIMIT',
      error: `Te veel verzoeken — probeer over ${rl.retryAfterSec} ${rl.retryAfterSec === 1 ? 'seconde' : 'seconden'} opnieuw.`,
      retryAfterSec: rl.retryAfterSec,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// #4 — Startsuggesties genereren
// ---------------------------------------------------------------------------

/** Genereer 4 startsuggesties vanuit bedrijfsomschrijving + chatbot-naam. */
export async function generateStarterQuestionsV1Action(): Promise<ActionResult<{ questions: string[] }>> {
  let ctx: GenerateCtx;
  try {
    ctx = await requireGenerateCtx();
  } catch (e) {
    return authFail(e);
  }
  const limited = await checkGenerateLimit(ctx.orgId);
  if (limited) return limited;
  return actionTry(async () => {
    const supabase = await createClient();
    const settings = await getChatbotSettings(supabase, ctx.chatbotId);
    const questions = await generateStarterQuestions({
      chatbotName: settings.chatbotName,
      companyDescription: settings.companyDescription,
      primaryLanguage: settings.primaryLanguage,
      topQuestions: [], // V1 heeft nog geen FAQ-snapshot → lege set (startergen werkt prima zonder)
    });
    if (questions.length === 0) {
      throw new AppError('INTERNAL', { message: 'Kon geen suggesties genereren. Probeer het zo nog eens.' });
    }
    return { questions };
  });
}

// ---------------------------------------------------------------------------
// #5 — Fallbackbericht genereren
// ---------------------------------------------------------------------------

/** Genereer een warm, bedrijfsspecifiek fallbackbericht. */
export async function generateFallbackMessageV1Action(): Promise<ActionResult<{ message: string }>> {
  let ctx: GenerateCtx;
  try {
    ctx = await requireGenerateCtx();
  } catch (e) {
    return authFail(e);
  }
  const limited = await checkGenerateLimit(ctx.orgId);
  if (limited) return limited;
  return actionTry(async () => {
    const supabase = await createClient();
    const c = await getChatbotSettings(supabase, ctx.chatbotId);
    const message = await generateFallbackMessage({
      chatbotName: c.chatbotName,
      companyDescription: c.companyDescription,
      toneOfVoice: c.toneOfVoice,
      contactEmail: c.contactEmail,
      contactPhone: c.contactPhone,
      contactPageUrl: c.contactPageUrl,
      primaryLanguage: c.primaryLanguage,
    });
    if (!message) {
      throw new AppError('INTERNAL', { message: 'Kon geen fallbackbericht genereren. Probeer het zo nog eens.' });
    }
    return { message };
  });
}

// ---------------------------------------------------------------------------
// #6 — Contactgegevens autofill uit gecrawlde V1-pagina's
// ---------------------------------------------------------------------------

/** Extraheer contactgegevens uit de gecrawlde V1-website-documenten. */
export async function extractContactInfoV1Action(): Promise<ActionResult<ExtractedContact>> {
  let ctx: GenerateCtx;
  try {
    ctx = await requireGenerateCtx();
  } catch (e) {
    return authFail(e);
  }
  const limited = await checkGenerateLimit(ctx.orgId);
  if (limited) return limited;
  return actionTry(async () => {
    const pagesText = await collectV1ContactPagesText(ctx.orgId, ctx.chatbotId);
    if (!pagesText) {
      throw new AppError('NOT_FOUND', {
        message: "Geen gecrawlde pagina's gevonden. Crawl eerst je website in de Kennisbank.",
      });
    }
    const info = await extractContactInfo({ pagesText });
    if (!info.contactEmail && !info.contactPhone && !info.contactPageUrl) {
      throw new AppError('NOT_FOUND', {
        message: "Geen contactgegevens gevonden op je gecrawlde pagina's. Vul ze handmatig in.",
      });
    }
    return info;
  });
}

// ---------------------------------------------------------------------------
// Hulpfunctie: verzamel contact-relevante V1-paginatekst
// ---------------------------------------------------------------------------

// V1 slaat gecrawlde pagina's op als documents (source='website'); de inhoud zit
// in document_chunks. Spiegelt V0's collectContactPagesText maar leest uit de V1-
// schema's. Lezen via service-role (RLS-bypass), altijd gescoopt op org+chatbot.
// ponytail: parent-chunks (parent_id IS NULL) geven ~800 chars reconstructed text
// per pagina-stuk — goed genoeg voor contactextractie.
const CONTACT_RE = /contact|over-?ons|about|colofon|bereik/i;

async function collectV1ContactPagesText(orgId: string, chatbotId: string): Promise<string> {
  const svc = getV1ServiceRoleClient();

  const { data: docs } = await svc
    .from('documents')
    .select('id, filename, metadata')
    .eq('organization_id', orgId)
    .eq('chatbot_id', chatbotId)
    .eq('source', 'website')
    .is('deleted_at', null)
    .limit(200);

  if (!docs || docs.length === 0) return '';

  // Prefereer contact-achtige pagina's; anders een kleine sample.
  const preferred = docs.filter((d) => {
    const url = String((d.metadata as Record<string, unknown>)?.source_url ?? '');
    const name = String(d.filename ?? '');
    return CONTACT_RE.test(`${url} ${name}`);
  });
  const chosen = (preferred.length > 0 ? preferred : docs).slice(0, 5);

  // Lees de parent-chunks (parent_id IS NULL = de ~800-char reconstructed slices).
  const parts: string[] = [];
  for (const doc of chosen) {
    const { data: chunks } = await svc
      .from('document_chunks')
      .select('content')
      .eq('document_id', doc.id)
      .eq('organization_id', orgId)
      .is('parent_id', null)
      .limit(5);
    if (!chunks || chunks.length === 0) continue;
    const text = chunks
      .map((c) => String(c.content ?? ''))
      .join('\n')
      .slice(0, 4000);
    const url = String((doc.metadata as Record<string, unknown>)?.source_url ?? doc.filename ?? '');
    parts.push(`URL: ${url}\n${text}`);
  }
  return parts.join('\n\n---\n\n').slice(0, 16000);
}
