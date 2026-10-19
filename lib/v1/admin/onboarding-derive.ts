// V1 admin — onboardingchecklist half-automatisch, ZONDER migratie of extra writes.
//
// De checklist zelf (admin_onboarding_items, template in lib/controlroom/onboarding-
// template.ts — gedeeld met V0, dus niet aangepast) blijft handmatig opgeslagen. Hier
// leiden we bij het lezen af welke stappen al uit de data blijken, en tonen die als
// 'Klaar (automatisch)' zolang de opgeslagen status nog 'Te doen' is. Een bewust
// gezette status (klaar, geblokkeerd, n.v.t.) wint altijd.
//
// Plus één V1-stap die het template mist: 'Toegestane domeinen ingesteld' (lege
// allowed_domains = elke site mag de widget plaatsen). Die is virtueel: hij staat
// niet in de tabel (dat zou een seed-write per org zijn), zijn status komt alleen
// uit de data.
//
// PUUR (getest). De loader die de feiten leest staat in onboarding.ts.

import type { OnboardingItem, OnboardingItemStatus } from '@/lib/controlroom/types';

export type OnboardingFacts = {
  contactFilled: boolean;
  websiteSource: boolean;
  crawlStarted: boolean;
  crawlSucceeded: boolean;
  uploadedDocs: boolean;
  allowedDomains: boolean;
  widgetSeen: boolean;
};

/** Template-key → feit + uitleg waarom hij automatisch klaar is. */
const DERIVED: Record<string, { fact: keyof OnboardingFacts | 'always'; reason: string }> = {
  customer_created: { fact: 'always', reason: 'De klant bestaat.' },
  contact_filled: { fact: 'contactFilled', reason: 'Er staat een contactpersoon in het profiel.' },
  website_url_added: { fact: 'websiteSource', reason: 'Er is een website-bron.' },
  first_crawl_started: { fact: 'crawlStarted', reason: 'Er is een crawl gestart.' },
  crawl_succeeded: { fact: 'crawlSucceeded', reason: 'Er is een crawl afgerond.' },
  documents_added: { fact: 'uploadedDocs', reason: 'Er zijn documenten geüpload.' },
  widget_installed: { fact: 'widgetSeen', reason: 'De widget is op een website gezien.' },
  // Bewust NIET afgeleid: first_real_conversations ('Eerste echte gesprekken bekeken')
  // is een handeling van Jorion; dat er een gesprek bestaat (kan een test zijn) zegt
  // niet dat iemand ze bekeken heeft.
};

export const ALLOWED_DOMAINS_KEY = 'v1_allowed_domains_set';
/** De virtuele stap komt vóór deze template-stap te staan. */
const ALLOWED_DOMAINS_BEFORE = 'widget_installed';

export type OnboardingDisplayItem = {
  /** null = virtuele stap (niet opgeslagen, niet handmatig te wijzigen). */
  id: string | null;
  key: string;
  label: string;
  storedStatus: OnboardingItemStatus | null;
  status: OnboardingItemStatus;
  /** Gezet als de status uit de data komt. */
  autoReason: string | null;
};

export function deriveOnboarding(items: OnboardingItem[], facts: OnboardingFacts): OnboardingDisplayItem[] {
  const out: OnboardingDisplayItem[] = [];
  const virtual: OnboardingDisplayItem = {
    id: null,
    key: ALLOWED_DOMAINS_KEY,
    label: 'Toegestane domeinen ingesteld',
    storedStatus: null,
    status: facts.allowedDomains ? 'done' : 'todo',
    autoReason: facts.allowedDomains
      ? 'Er staan toegestane domeinen op de chatbot.'
      : null,
  };
  let placed = false;
  for (const item of items) {
    if (!placed && item.key === ALLOWED_DOMAINS_BEFORE) {
      out.push(virtual);
      placed = true;
    }
    const rule = DERIVED[item.key];
    const factTrue = rule ? rule.fact === 'always' || facts[rule.fact] : false;
    const auto = item.status === 'todo' && factTrue;
    out.push({
      id: item.id,
      key: item.key,
      label: item.label,
      storedStatus: item.status,
      status: auto ? 'done' : item.status,
      autoReason: auto ? rule!.reason : null,
    });
  }
  if (!placed) out.push(virtual);
  return out;
}

export function onboardingProgress(items: Array<{ status: OnboardingItemStatus }>): {
  done: number;
  total: number;
  blocked: number;
} {
  // 'Niet van toepassing' telt niet mee in het totaal.
  const relevant = items.filter((i) => i.status !== 'not_applicable');
  return {
    done: relevant.filter((i) => i.status === 'done').length,
    total: relevant.length,
    blocked: relevant.filter((i) => i.status === 'blocked').length,
  };
}
