// V0 Klantendashboard — Scherm 4: Instellingen.
//
// Server component die de chatbot-settings ophaalt en doorgeeft aan de
// client-side SettingsForm. Opslaan persisteert via saveChatbotSettingsAction
// in v0_org_settings; een save purget de org-answer-cache zodat een
// gewijzigde toon/taal/lengte direct in nieuwe antwoorden zichtbaar is.

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { PageHead } from '../components/ui/page-head';
import { SettingsForm, ContactRequestsSection } from './components/settings-form';
import {
  generateStarterQuestionsAction,
  generateFallbackMessageAction,
  extractContactInfoAction,
} from '../actions';

export const dynamic = 'force-dynamic';

export default async function InstellingenPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const settings = await getOrgSettings(activeOrg.slug);

  return (
    <>
      <PageHead
        eyebrow="Instellingen"
        title="Hoe je chatbot praat en denkt"
        subtitle="Naam, taal, toon en gedrag — en wat je chatbot doet als hij een antwoord niet weet. Wijzigingen gelden zodra je opslaat."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <SettingsForm
          key={activeOrg.slug}
          initial={settings.chatbot}
          onGenerateStarters={generateStarterQuestionsAction}
          onGenerateFallback={generateFallbackMessageAction}
          onAutofillContact={extractContactInfoAction}
        />
        <ContactRequestsSection key={`cr-${activeOrg.slug}`} initial={settings.contactRequests} />
      </div>
    </>
  );
}
