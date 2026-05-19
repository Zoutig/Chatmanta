// Seed-decisions — uit goal-prompt §13.3 plus 2 product-decisions die we al
// expliciet in CLAUDE.md / blueprint hebben staan. Idempotent geladen.

import type { DecisionInput } from './types';

export const SEED_DECISIONS: DecisionInput[] = [
  {
    date: '2026-02-01',
    title: 'ChatManta v1 = knowledge bot, geen action bot',
    decision:
      'Tot en met v1 levert ChatManta uitsluitend kennisantwoorden uit de geïndexeerde content. Acties (bestellen, boeken, reserveren) komen pas in v3.',
    context:
      'Knowledge-only houdt anti-hallucinatie en RAG-kwaliteit beheersbaar. Action-bot vraagt integraties, dependencies en juridische ruimte die we nu niet hebben.',
    impact: 'Hoog',
    decidedBy: ['Sebastiaan', 'Niels'],
    status: 'Actief',
  },
  {
    date: '2026-02-01',
    title: 'V1 focus: betrouwbaarheid boven features',
    decision:
      'Liever 5 features die 95% betrouwbaar werken dan 15 features die soms hallucineren. Anti-hallucinatie-fallback heeft voorrang op completeness.',
    context:
      'Eerste klanten moeten in 14 dagen overtuigd zijn. Eén verkeerde productprijs in een antwoord is killing.',
    impact: 'Hoog',
    decidedBy: ['Sebastiaan'],
    status: 'Actief',
  },
  {
    date: '2026-02-15',
    title: 'Eerste klanten handmatig onboarden',
    decision:
      'Geen self-serve onboarding tot na v1. Sebastiaan + Niels doen de eerste 3-5 setups persoonlijk.',
    context:
      'Onboarding leert ons wat het product écht moet doen. Self-serve schalen we pas als we het patroon kennen.',
    impact: 'Middel',
    decidedBy: ['Sebastiaan', 'Niels'],
    reviewDate: '2026-09-01',
    status: 'Actief',
  },
  {
    date: '2026-02-15',
    title: 'Rolverdeling: Seb = product, Niels = sales',
    decision:
      'Sebastiaan is hoofdverantwoordelijk voor product / build / tech. Niels is hoofdverantwoordelijk voor sales / testklanten / outreach. Beslissingen samen.',
    context: 'Voorkomt double work + maakt duidelijk wie bij welke taak owner is.',
    impact: 'Hoog',
    decidedBy: ['Sebastiaan', 'Niels'],
    status: 'Actief',
  },
  {
    date: '2026-03-10',
    title: 'V0 sandbox = bewust geen multi-tenant-veilig',
    decision:
      'V0-organisaties draaien achter één gedeeld V0_DEMO_PASSWORD zonder per-user auth. Alle access via service-role wrappers. STOP NOOIT echte klantdata in V0.',
    context:
      'V0 is RAG-leerplatform met fake demo-data. Multi-tenant-security komt pas in V1 Phase 1 (Supabase Auth + organization_members).',
    impact: 'Hoog',
    decidedBy: ['Sebastiaan'],
    status: 'Actief',
  },
];
