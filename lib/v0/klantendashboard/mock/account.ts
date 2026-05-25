// Mock account-info per V0 sandbox-org.
//
// Combineert hard-coded contactgegevens met de echte org-naam uit KNOWN_ORGS.
// Bij V1 wordt dit `account_settings` of vergelijkbaar in DB.

import { KNOWN_ORGS, type OrgSlug } from '../../server/active-org';
import type { AccountInfo } from '../types';

const PROFILES: Record<
  OrgSlug,
  Omit<AccountInfo, 'companyName' | 'workspaceId' | 'workspaceSlug' | 'usage'>
> = {
  'dev-org': {
    websiteUrl: 'https://demo.chatmanta.nl',
    contactPerson: 'Demo Beheerder',
    email: 'demo@chatmanta.nl',
    plan: 'test',
  },
  'acme-corp': {
    websiteUrl: 'https://dakwerkendeboer.nl',
    contactPerson: 'Pieter de Boer',
    email: 'pieter@dakwerkendeboer.nl',
    plan: 'starter',
  },
  'globex-inc': {
    websiteUrl: 'https://fysioplus-utrecht.nl',
    contactPerson: 'Marieke van Dam',
    email: 'marieke@fysioplus-utrecht.nl',
    plan: 'pro',
  },
  initech: {
    websiteUrl: 'https://bakkervermeer.nl',
    contactPerson: 'Joost Vermeer',
    email: 'joost@bakkervermeer.nl',
    plan: 'starter',
  },
  'demo-nieuw': {
    websiteUrl: '',
    contactPerson: 'Nieuwe klant',
    email: 'klant@voorbeeld.nl',
    plan: 'test',
  },
};

export function getMockAccountInfo(
  orgSlug: OrgSlug,
  usage: { conversationsThisMonth: number; documentsCount: number },
): AccountInfo {
  const org = KNOWN_ORGS[orgSlug];
  const profile = PROFILES[orgSlug] ?? PROFILES['dev-org'];
  return {
    companyName: org.name,
    workspaceId: org.id,
    workspaceSlug: org.slug,
    usage,
    ...profile,
  };
}
