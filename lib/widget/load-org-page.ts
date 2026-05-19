import 'server-only';

import { cache } from 'react';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { notFound } from 'next/navigation';

import { findPage } from '@/app/widget/org-skins';

// Server-side loader voor de fake-website pagina's in /widget.
//
// Leest één markdown-bestand uit `scripts/fixtures/sandbox-orgs/<slug>/`
// op basis van de gecureerde mapping in `app/widget/org-skins.ts`. De
// fixtures dubbelen als bron-content voor de chatbot (via v0:seed-orgs)
// én als display-content voor de fake klant-website — zo zien bezoeker
// en chatbot dezelfde feiten.
//
// Cache-strategie: React `cache()` dedupliceert reads binnen één request.
// In dev rehydreert dat per request (file kan tussen requests wijzigen);
// in prod is dat één read per cold start of per render boundary.
//
// Security: pageSlug komt uit de URL (untrusted). `findPage()` valideert
// dat de combinatie in de curated lijst staat — zonder die check zou een
// crafted URL bestanden buiten de fixtures kunnen aanvragen.

const FIXTURES_ROOT = path.join(
  process.cwd(),
  'scripts',
  'fixtures',
  'sandbox-orgs',
);

export type OrgPageContent = {
  navLabel: string;
  mdFile: string;
  markdown: string;
};

export const loadOrgPage = cache(
  async (slug: string, pageSlug: string): Promise<OrgPageContent> => {
    const page = findPage(slug, pageSlug);
    if (!page) notFound();

    const filePath = path.join(FIXTURES_ROOT, slug, page.mdFile);
    let markdown: string;
    try {
      markdown = await readFile(filePath, 'utf8');
    } catch {
      // Bestaat in de curated lijst maar niet op disk — productie-build
      // heeft de fixtures niet meegebundeld, of het bestand is verwijderd.
      notFound();
    }

    return {
      navLabel: page.navLabel,
      mdFile: page.mdFile,
      markdown,
    };
  },
);
