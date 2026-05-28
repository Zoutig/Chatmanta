// Control Room — demo-seed voor de admin-overlay (MD §25). Zet gevarieerde
// klant-profielen op de bestaande KNOWN_ORGS zodat Overview/Klantenlijst direct
// variatie tonen (actief / trial / interne test, verschillende onboarding-fasen).
//
//   npm run controlroom:seed
//
// Upsert (overschrijft handmatige edits). Bedoeld voor een verse demo-omgeving,
// niet voor productie-data.

import { upsertProfile } from '../lib/controlroom/server/profiles';
import { KNOWN_ORGS, type OrgSlug } from '../lib/v0/server/active-org';
import type { AdminOrgProfilePatch } from '../lib/controlroom/types';

const SEED: Partial<Record<OrgSlug, AdminOrgProfilePatch>> = {
  'acme-corp': {
    commercialStatus: 'active',
    onboardingPhase: 'widget_live',
    customerOwner: 'Niels',
    technicalOwner: 'Sebastiaan',
    contactName: 'J. de Boer (fictief)',
    contactEmail: 'info@example-dakwerken.nl',
    nextAction: 'Eerste feedbackmoment inplannen',
    nextActionOwner: 'Niels',
  },
  'globex-inc': {
    commercialStatus: 'trial',
    onboardingPhase: 'internal_testing',
    customerOwner: 'Niels',
    technicalOwner: 'Sebastiaan',
    contactName: 'M. Visser (fictief)',
    nextAction: 'Widgetcode delen met klant',
    nextActionOwner: 'Niels',
  },
  initech: {
    commercialStatus: 'active',
    onboardingPhase: 'first_feedback_received',
    customerOwner: 'Niels',
    technicalOwner: 'Sebastiaan',
    contactName: 'K. Bakker (fictief)',
    nextAction: 'Slechte antwoorden doornemen + bronnen aanvullen',
    nextActionOwner: 'Sebastiaan',
  },
  'demo-nieuw': {
    commercialStatus: 'trial',
    onboardingPhase: 'created',
    customerOwner: 'Niels',
    technicalOwner: 'Sebastiaan',
    nextAction: 'Website-URL toevoegen + eerste crawl',
    nextActionOwner: 'Sebastiaan',
  },
  'dev-org': {
    commercialStatus: 'internal_test',
    onboardingPhase: 'completed',
    customerOwner: 'Sebastiaan',
    technicalOwner: 'Sebastiaan',
  },
};

async function main() {
  console.log('\n=== Control Room demo-seed ===\n');
  for (const [slug, patch] of Object.entries(SEED) as [OrgSlug, AdminOrgProfilePatch][]) {
    const org = KNOWN_ORGS[slug];
    await upsertProfile(org.id, patch);
    console.log(`✓ ${org.name.padEnd(28)} → ${patch.commercialStatus} / ${patch.onboardingPhase}`);
  }
  console.log('\nKlaar. Onboarding-checklists worden lazy geseed bij het openen van een klant.\n');
}

main().catch((err) => {
  console.error('seed faalde:', err);
  process.exit(1);
});
