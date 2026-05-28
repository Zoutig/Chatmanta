// Control Room — standaard onboarding-checklist (MD §10.4, 20 items).
//
// Elke nieuwe tenant-org krijgt deze items één keer geseed
// (lib/controlroom/server/onboarding.ts → ensureOnboardingSeeded). De `key` is
// stabiel en uniek per org (DB-constraint unique(organization_id, key)); labels
// mogen wijzigen zonder de status te verliezen.

export type OnboardingTemplateItem = {
  key: string;
  label: string;
};

export const ONBOARDING_TEMPLATE: readonly OnboardingTemplateItem[] = [
  { key: 'customer_created', label: 'Klant aangemaakt' },
  { key: 'contact_filled', label: 'Contactpersoon ingevuld' },
  { key: 'website_url_added', label: 'Website-URL toegevoegd' },
  { key: 'first_crawl_started', label: 'Eerste crawl gestart' },
  { key: 'crawl_succeeded', label: 'Crawl succesvol' },
  { key: 'documents_added', label: 'Documenten toegevoegd indien nodig' },
  { key: 'tone_of_voice_set', label: 'Tone of voice ingesteld' },
  { key: 'welcome_message_set', label: 'Welkomstbericht ingesteld' },
  { key: 'fallback_message_set', label: 'Fallbackbericht ingesteld' },
  { key: 'ten_test_questions', label: '10 testvragen uitgevoerd' },
  { key: 'bad_answers_flagged', label: 'Slechte antwoorden gemarkeerd' },
  { key: 'sources_adjusted', label: 'Bronnen aangepast indien nodig' },
  { key: 'widget_code_generated', label: 'Widgetcode gegenereerd' },
  { key: 'widget_code_shared', label: 'Widgetcode gedeeld met klant' },
  { key: 'widget_installed', label: 'Widget geplaatst door klant of developer' },
  { key: 'widget_live_verified', label: 'Widget live gecontroleerd' },
  { key: 'first_real_conversations', label: 'Eerste echte gesprekken bekeken' },
  { key: 'feedback_scheduled', label: 'Feedbackmoment ingepland' },
  { key: 'first_feedback_processed', label: 'Eerste feedback verwerkt' },
  { key: 'marked_live', label: 'Klant gemarkeerd als live/afgerond' },
] as const;
