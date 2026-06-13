// V0 Klantendashboard — Scherm 4: Instellingen.
//
// Server component die de chatbot-settings ophaalt en doorgeeft aan de
// client-side SettingsForm. Opslaan persisteert via saveChatbotSettingsAction
// in v0_org_settings; een save purget de org-answer-cache zodat een
// gewijzigde toon/taal/lengte direct in nieuwe antwoorden zichtbaar is.

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { PageHead } from '../components/ui/page-head';
import { SettingsForm } from './components/settings-form';
import { TopQuestionsConfigCard } from './components/top-questions-config-card';

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

      <SettingsForm key={activeOrg.slug} initial={settings.chatbot} />
      <TopQuestionsConfigCard key={`tq-${activeOrg.slug}`} initial={settings.topQuestions} />
    </>
  );
}
