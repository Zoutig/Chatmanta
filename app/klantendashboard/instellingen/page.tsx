// V0 Klantendashboard — Scherm 4: Instellingen.
//
// Server component die de mock chatbot-settings ophaalt en doorgeeft aan de
// client-side SettingsForm. Save is mock-only — bij V1 wordt dit een server
// action die de settings persisteert in een chatbot_settings tabel.

import { getActiveOrgFromCookies } from '@/lib/v0/server/active-org';
import { getOrgSettings } from '@/lib/v0/klantendashboard/server/settings';
import { PageHeader } from '../components/page-header';
import { SettingsForm } from './components/settings-form';
import { TopQuestionsConfigCard } from './components/top-questions-config-card';

export const dynamic = 'force-dynamic';

export default async function InstellingenPage() {
  const activeOrg = await getActiveOrgFromCookies();
  const settings = await getOrgSettings(activeOrg.slug);

  return (
    <>
      <PageHeader
        title="Instellingen"
        subtitle="Hier bepaal je hoe je chatbot zich gedraagt — naam, taal, toon, en wat hij doet als hij een antwoord niet weet."
      />

      <SettingsForm key={activeOrg.slug} initial={settings.chatbot} />
      <TopQuestionsConfigCard key={`tq-${activeOrg.slug}`} initial={settings.topQuestions} />
    </>
  );
}
