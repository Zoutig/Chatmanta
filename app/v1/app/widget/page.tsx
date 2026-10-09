// V1 Widget (spec §7.6): drie stappen onder elkaar, 1. Uiterlijk (met live
// voorbeeld), 2. Installeren, 3. Status.
//
// Auth-keten = die van /v1/app: geen sessie → getSessionOrg → requireAuth → redirect
// /v1/login; geen lid → AUTH_FORBIDDEN → "Geen toegang". Org uit de sessie
// (organization_members), niet uit env. Reads onder de session-client (RLS).
// Opslaan via de BESTAANDE saveChatbotSettingsAction; aan/uit en installatie-test
// via ./actions (ongewijzigd). allowed_domains is Jorion-beheerd: alleen-lezen.
//
// Hydration: origin (voor de embed-code) en "al een week niet gezien" worden hier
// op de server bepaald, niet tijdens de client-render.

import Link from 'next/link';
import { headers } from 'next/headers';
import { getSessionOrg } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { createClient } from '@/lib/supabase/v1/server';
import { getShellCounts } from '@/lib/v1/dashboard/shell-counts';
import { WIDGET_MISSING_AFTER_MS } from '@/lib/v1/dashboard/attention';
import { normalizeStarters } from '@/lib/v1/widget/appearance';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { StatusPill } from '@/app/v1/_ui/feedback';
import { buttonClass } from '@/app/v1/_ui/button';
import { getOrgChatbot } from '../rag-config';
import { getChatbotSettings } from '../instellingen/settings-config';
import { V1WidgetForm, type EditableAppearance } from './widget-form';
import '../preview/preview.css';
import './widget-screen.css';

export const dynamic = 'force-dynamic';

const TITLE = 'Widget';
const DESCRIPTION = 'Zo ziet je chatbot eruit op je website, en zo zet je hem erop.';

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return 'https://www.chatmanta.nl';
  // Achter meerdere proxies kan dit een lijst zijn ("https,http"): eerste waarde.
  const proto = h.get('x-forwarded-proto')?.split(',')[0].trim() || (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function V1WidgetPage() {
  let orgId: string;
  try {
    ({ orgId } = await getSessionOrg());
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return <PageHeader title="Geen toegang" description="Je bent geen lid van deze organisatie." />;
    }
    throw e; // NEXT_REDIRECT (geen sessie) → laat propageren naar /v1/login
  }

  const supabase = await createClient();
  const chatbot = await getOrgChatbot(supabase, orgId);
  if (!chatbot) {
    return <PageHeader title={TITLE} description="Er is nog geen chatbot ingesteld." />;
  }

  const [settings, orgRes, botRes, counts, origin] = await Promise.all([
    getChatbotSettings(supabase, chatbot.id),
    supabase.from('organizations').select('slug').eq('id', orgId).maybeSingle(),
    supabase
      .from('chatbots')
      .select('allowed_domains, is_active, widget_last_seen_at, widget_last_seen_origin')
      .eq('id', chatbot.id)
      .maybeSingle(),
    // Zelfde statusregel als zijbalk en Overzicht (dubbele reads met de layout
    // bewust geaccepteerd; de client is een argument, dus React.cache helpt niet).
    getShellCounts(supabase, orgId, chatbot.id),
    requestOrigin(),
  ]);

  const botRow = botRes.data;
  const allowedDomains = ((botRow?.allowed_domains as string[] | null) ?? []).filter(Boolean);
  const isActive = botRow?.is_active !== false;
  const lastSeenAt = (botRow?.widget_last_seen_at as string | null) ?? null;
  const lastSeenMs = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  const widgetMissing = isActive && Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs > WIDGET_MISSING_AFTER_MS;
  const status = isActive ? counts.chatbotStatus : 'paused';

  // Alleen de bewerkbare uiterlijk-velden naar de client (expliciet per veld).
  const initial: EditableAppearance = {
    accentColor: settings.accentColor,
    position: settings.position,
    headerTitle: settings.headerTitle,
    subtitle: settings.subtitle,
    welcomeMessage: settings.welcomeMessage,
    launcherText: settings.launcherText,
    logoStyle: settings.logoStyle,
    customLogoDataUrl: settings.customLogoDataUrl,
  };

  return (
    <div className="v1-page">
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        actions={
          <>
            <StatusPill status={status} />
            <Link href="/v1/app/preview" className={buttonClass({ variant: 'secondary' })}>
              Bekijk chatbot
            </Link>
          </>
        }
      />
      <V1WidgetForm
        initial={initial}
        fallbackTitle={settings.chatbotName.trim() || chatbot.name}
        starterQuestions={normalizeStarters(settings.starterQuestions, settings.showStarterQuestions)}
        slug={(orgRes.data?.slug as string | undefined) ?? ''}
        origin={origin}
        allowedDomains={allowedDomains}
        liveStatus={{
          isActive,
          lastSeenAt,
          lastSeenOrigin: (botRow?.widget_last_seen_origin as string | null) ?? null,
        }}
        widgetMissing={widgetMissing}
        missingAfterMs={WIDGET_MISSING_AFTER_MS}
      />
    </div>
  );
}
