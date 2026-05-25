// V0 multi-org: curated voorbeeldvragen per sandbox-org voor de EmptyState
// op de chat-pagina. Per slug 8–12 vragen die zijn afgeleid uit de gescrapete
// FAQ-fixtures (scripts/fixtures/sandbox-orgs/<slug>/) zodat een klik op een
// voorbeeld een on-topic RAG-antwoord oplevert. Geen DB, geen async — een
// statische map die op de server wordt opgehaald en als prop wordt doorgegeven
// aan de client-component.
//
// Onbekende slug → fallback naar `dev-org`, dezelfde safety-net die
// getActiveOrgFromCookies() hanteert.

import type { OrgSlug } from './active-org';

export type ExampleQuestion = { label: string; q: string };

export const EXAMPLES_BY_ORG: Record<OrgSlug, ExampleQuestion[]> = {
  // dev-org's RAG-content is de ChatManta-blueprint zelf — bestaande lijst
  // blijft hier zinvol.
  'dev-org': [
    { label: 'Wat doet het?', q: 'wat doet ChatManta?' },
    { label: 'Stack', q: 'welke stack gebruiken jullie?' },
    { label: 'Doelgroep', q: 'voor welke doelgroep is het?' },
    { label: 'Kernprincipes', q: 'wat zijn de kernprincipes?' },
    { label: 'Jorion', q: 'wat is Jorion Solutions?' },
    { label: 'Multi-tenancy', q: 'hoe werkt multi-tenancy?' },
    { label: 'Anti-hallucinatie', q: 'hoe voorkomt de bot hallucinaties?' },
    { label: 'Cost-discipline', q: 'hoe worden de kosten beheerst?' },
    { label: 'Embedding-model', q: 'welk embedding-model wordt gebruikt?' },
    { label: 'Crawler', q: "hoeveel pagina's kan Firecrawl crawlen?" },
    { label: 'Hosting', q: 'waar draait ChatManta?' },
    { label: 'Widget', q: 'hoe wordt de chatbot op een klantsite gezet?' },
  ],

  // Dakwerken De Boer — vragen direct uit 17-faq.md (offerte / EPDM / btw /
  // garantie / veiligheid) plus pannen-/zonnepaneel-content uit 07 en 12.
  'acme-corp': [
    { label: 'Offerte', q: 'komt iemand kosteloos kijken voor een offerte?' },
    { label: 'Btw-tarief', q: 'welk btw-tarief geldt voor dakwerk aan een woning?' },
    { label: 'Werkgarantie', q: 'wat valt onder de werkgarantie van 10 jaar?' },
    { label: 'EPDM vs bitumen', q: 'wat is het verschil tussen EPDM en bitumen?' },
    { label: 'Duur dakvernieuwing', q: 'hoe lang duurt een nieuw pannendak?' },
    { label: 'Zonnepanelen', q: 'plaatsen jullie zonnepanelen op het dak?' },
    { label: 'Spoedreparatie', q: 'wat doen jullie bij een acute daklekkage?' },
    { label: 'Asbestsanering', q: 'kunnen jullie asbest van mijn dak halen?' },
    { label: 'Werkgebied', q: 'in welk werkgebied komen jullie langs?' },
    { label: 'Veiligheid', q: 'werken jullie met steiger of hoogwerker?' },
    { label: 'Groendaken', q: 'leggen jullie sedumdaken aan?' },
    { label: 'Onderhoudscontract', q: 'wat houdt een onderhoudscontract in?' },
  ],

  // FysioPlus Utrecht — vragen uit 20-faq.md (wachttijd / vergoeding /
  // sessies) plus behandelingen-content uit 06–09.
  'globex-inc': [
    { label: 'Wachttijd', q: 'hoe snel kan ik een eerste afspraak krijgen?' },
    { label: 'Vergoeding', q: 'hoeveel sessies vergoedt mijn verzekering?' },
    { label: 'Bekkenfysio', q: 'doen jullie aan bekkenfysiotherapie?' },
    { label: 'Sportblessure', q: 'kunnen jullie helpen bij een hardloopblessure?' },
    { label: 'Manuele therapie', q: 'wat is manuele therapie?' },
    { label: 'Zonder verwijzing', q: 'kan ik zonder huisartsverwijzing komen?' },
    { label: 'Aantal sessies', q: 'hoeveel sessies heb ik nodig bij lage rugklacht?' },
    { label: 'Zwangerschap', q: 'mag ik fysio tijdens mijn zwangerschap?' },
    { label: 'Tarieven', q: 'wat kost een behandeling?' },
    { label: 'Eigen risico', q: 'telt fysio mee voor mijn eigen risico?' },
    { label: 'Annuleren', q: 'wat als ik mijn afspraak moet annuleren?' },
    { label: 'Locaties', q: 'op welke vestigingen werken jullie?' },
  ],

  // Bakker & Vermeer Accountants — vragen uit 22-faq-zzp.md en 23-faq-bv.md
  // plus core content uit 07, 09, 11.
  initech: [
    { label: 'Zzp-pakketten', q: 'wat kost een zzp-pakket bij jullie?' },
    { label: 'Urencriterium', q: 'wat is het urencriterium voor zelfstandigenaftrek?' },
    { label: 'KOR', q: 'wat is de Kleine Ondernemers Regeling?' },
    { label: 'Bv oprichten', q: 'wanneer is een bv beter dan een eenmanszaak?' },
    { label: 'Gebruikelijk loon', q: 'wat is gebruikelijk loon voor een DGA in 2026?' },
    { label: 'Vpb-tarief', q: 'wat is het Vpb-tarief in 2026?' },
    { label: 'Btw-aangifte', q: 'hoe vaak moet ik btw-aangifte doen?' },
    { label: 'Holding', q: 'wanneer is een holding-structuur zinvol?' },
    { label: 'Loonadministratie', q: 'verzorgen jullie ook de loonadministratie?' },
    { label: 'Werkkamer aftrekken', q: 'mag ik mijn werkkamer thuis fiscaal aftrekken?' },
    { label: 'Jaarrekening', q: 'wat doen jullie bij een jaarrekening?' },
    { label: 'Erfbelasting', q: 'kunnen jullie helpen bij erfbelasting en schenking?' },
  ],

  // Demo Nieuw — lege demo-org zonder fixtures. Generieke starter-vragen zodat
  // de chat-empty-state niet leeg is. Zonder RAG-content leunen antwoorden op
  // het fallback-pad; dat is bewust — dit is de "verse klant"-demo.
  'demo-nieuw': [
    { label: 'Wat doen jullie?', q: 'wat doen jullie?' },
    { label: 'Diensten', q: 'welke diensten bieden jullie aan?' },
    { label: 'Openingstijden', q: 'wat zijn jullie openingstijden?' },
    { label: 'Tarieven', q: 'wat kost het?' },
    { label: 'Contact', q: 'hoe kan ik contact opnemen?' },
    { label: 'Locatie', q: 'waar zijn jullie gevestigd?' },
  ],
};

const FALLBACK: ExampleQuestion[] = EXAMPLES_BY_ORG['dev-org'];

export function getExamplesForOrg(slug: string): ExampleQuestion[] {
  return (EXAMPLES_BY_ORG as Record<string, ExampleQuestion[] | undefined>)[slug] ?? FALLBACK;
}
