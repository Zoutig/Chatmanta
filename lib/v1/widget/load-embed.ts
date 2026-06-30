// Server-side data-load voor de V1-embed-pagina: resolve org+chatbot by slug via
// service-role, evalueer de origin-allowlist, mint het embed-token en lever de
// widget-appearance. Bewust hier (lib/v1/widget, allowlisted voor de v1-service-role-
// import) zodat de embed-PAGINA zelf geen @/lib/supabase/v1/* hoeft te importeren —
// dat houdt de no-adhoc-service-client grep-gate groen zonder allowlist-uitbreiding.
import 'server-only';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { mergeChatbotSettings } from '@/app/v1/app/instellingen/settings-config';
import { evaluateEmbedAccess } from '@/lib/widget/origin-allowlist';
import { createEmbedToken } from './embed-token';
import type { V1WidgetProps } from '@/app/embed-v1/[slug]/v1-widget';

export type EmbedLoadResult =
  | { kind: 'notfound' }
  | { kind: 'blocked' }
  | { kind: 'ok'; props: V1WidgetProps };

/**
 * Laad alles wat de embed-pagina nodig heeft. `parentHost` = de host van de
 * ouderpagina (Referer of ?h=), waartegen we de allowlist matchen.
 */
export async function loadV1Embed(slug: string, parentHost: string | null): Promise<EmbedLoadResult> {
  const svc = getV1ServiceRoleClient();

  const { data: org } = await svc
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (!org) return { kind: 'notfound' };

  const { data: chatbot } = await svc
    .from('chatbots')
    .select('id, name, bot_version, settings, allowed_domains')
    .eq('organization_id', org.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!chatbot) return { kind: 'notfound' };

  // Origin-allowlist (Jorion-beheerd). Leeg/NULL → fail-open. Block → geen token,
  // geen widget. Afgedwongen bij token-uitgifte (de embed-pagina), net als V0.
  const allowed = (chatbot.allowed_domains as string[] | null) ?? undefined;
  if (evaluateEmbedAccess(allowed, parentHost) === 'block') return { kind: 'blocked' };

  let token: string;
  try {
    token = createEmbedToken(slug);
  } catch {
    // Fail-closed: geen EMBED_TOKEN_SECRET → geen token → behandel als geblokkeerd.
    return { kind: 'blocked' };
  }

  const settings = mergeChatbotSettings(chatbot.settings);
  const headerTitle = settings.headerTitle.trim() || settings.chatbotName.trim() || chatbot.name;
  // Per-org feature-flag (settings-agent voegt het veld toe aan settings-config).
  // Defensief gelezen zodat dit ook vóór die wiring werkt (fail-closed → false).
  // De submit-route is de autoritatieve gate; dit stuurt alleen de UI-zichtbaarheid.
  const contactRequestsEnabled =
    (settings as { contactRequestsEnabled?: unknown }).contactRequestsEnabled === true;

  return {
    kind: 'ok',
    props: {
      slug,
      embedToken: token,
      botVersion: chatbot.bot_version,
      accentColor: settings.accentColor,
      position: settings.position,
      headerTitle,
      welcomeMessage: settings.welcomeMessage,
      launcherText: settings.launcherText,
      contactRequestsEnabled,
    },
  };
}
