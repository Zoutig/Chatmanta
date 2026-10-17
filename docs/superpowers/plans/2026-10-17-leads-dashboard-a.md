# Leads-dashboard deel A (bellijst): bouwplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een apart leads-dashboard op `/v1/leads` waarmee Sebastiaan en Niels koude belletjes doen (belmodus met uitkomstknoppen), leads opvolgen met de ingebouwde opvolgmail, en alles terugzien in een inzichtdashboard. Het wordt gevuld met de 1.404 leads uit Niels' tool.

**Architecture:** Drie admin-only tabellen in de V1-productiedatabase (RLS aan, geen policies, geen `organization_id`: uitzondering met akkoord). Alle toegang via server actions met `requireJorionAdmin()` + `getV1ServiceRoleClient()`. De regels (wat gebeurt er na uitkomst X, werkdagen, mailbouwer, import-opschoning) zitten als pure functies in `lib/leads/` met unit-tests. De UI hergebruikt de V1-ontwerplaag (`app/v1/_ui`, `app/v1/admin/_ui`).

**Tech Stack:** Next.js 16 App Router (server components + server actions), React 19, TypeScript, Supabase (Postgres, supabase-js), `node:test` + tsx voor unit-tests, Playwright voor e2e, npm-pakket `qrcode` (nieuw, akkoord 2026-10-17).

**Spec:** `docs/superpowers/specs/2026-10-17-leads-dashboard-design.md`. Lees die eerst.

---

## Werkafspraken voor de uitvoerder

- **Werkmap:** worktree `C:\Users\solys\Documents\Code\chatmanta-leads`, branch `feat/seb/leads-dashboard`. Gebruik relatieve paden of paden met `chatmanta-leads`; een absoluut pad naar `...\Code\chatmanta\...` schrijft in de verkeerde repo. Check `git rev-parse --abbrev-ref HEAD` vóór elke commit.
- **Shell:** Git Bash op Windows. Meerregelige commit-messages: schrijf naar een tijdelijk bestand en `git commit -F`. Elke commit eindigt met de regel `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Unit-tests:** bestanden heten `*.test.ts` en staan in een map `__tests__`. Eén bestand draaien: `node --import tsx --conditions=react-server --test lib/leads/__tests__/<naam>.test.ts`. Alles: `npm run test:unit`.
- **Lees vóór je begint** `AGENTS.md` (hard rules), `docs/AGENT_LANDMIJNEN.md` secties "Supabase & migraties" en "Stack & Build", en `node_modules/next/dist/docs/` voor server actions in Next 16 als je twijfelt.
- **Productie:** de V1-database is productie. `npm run migrate:v1` (Task 8) en de import met `--toepassen` (Task 21) pas na akkoord van Sebastiaan in de chat. Testdata krijgt altijd `bron = 'test'` en wordt opgeruimd.
- **Publieke repo:** geen telefoonnummers, e-mailadressen of bedrijfsgegevens van echte leads in code, tests, commits of de PR. Gebruik in tests verzonnen bedrijven (`Bouwbedrijf Jansen`, `jansen-bouw.nl`, `06 12345678`).

## Bestandsoverzicht

| Bestand | Verantwoordelijkheid |
|---|---|
| `lib/leads/types.ts` | Statussen, uitkomsten, bezwaren, labels, `Stand`, `Lead`, `Activiteit`, `Afzender`. |
| `lib/leads/normaliseren.ts` | Domein, website-URL, telefoon (+31), e-mailvalidatie, telefoon tonen. |
| `lib/leads/werkdagen.ts` | Tijd in `Europe/Amsterdam`: werkdagen, dagdelen, periodes, mail-dagdeel. |
| `lib/leads/volgende-stand.ts` | Pure overgangen: uitkomst → nieuwe stand; mail verstuurd; handmatige status. |
| `lib/leads/opvolgmail.ts` | Port van de opvolgmail-maker: `bouwOpvolgmail()`. |
| `lib/leads/ics.ts` | Agenda-afspraak (.ics) voor een kennismaking. |
| `lib/leads/import-opschonen.ts` | Niels' `leads.json`/`status.json`/CSV's → schone leads + activiteiten + rapport. |
| `lib/leads/server/db.ts` | Alle DB-toegang (service-role), alleen aangeroepen vanuit actions/pages ná de admin-check. |
| `lib/leads/server/inzicht.ts` | Ophalen van de inzicht-RPC en de vorige periode. |
| `supabase/migrations-v1/0032_v1_leads.sql` | Tabellen, indexen, RLS, triggers, claim- en opschoonfuncties. |
| `supabase/migrations-v1/0033_v1_leads_inzicht.sql` | SQL-functie `leads_inzicht()`. |
| `app/v1/leads/layout.tsx` + `_ui/*` | Gate, kopbalk, gedeelde componenten, CSS. |
| `app/v1/leads/actions.ts` | Alle server actions. |
| `app/v1/leads/page.tsx` | Overzicht met tabbladen, lijst, filters, bulk, + Lead. |
| `app/v1/leads/bellen/page.tsx` | Belmodus. |
| `app/v1/leads/[id]/page.tsx` | Detail. |
| `app/v1/leads/inzicht/page.tsx` | Inzichtdashboard. |
| `app/v1/leads/instellingen/page.tsx` | Afzenderprofiel. |
| `app/v1/admin/_shell/sidebar.tsx` | Knop "Leads ↗". |
| `scripts/leads-import.ts` | Import-CLI. |
| `scripts/leads-test-rls.ts` | Check dat `authenticated`/`anon` niets kunnen op de leads-tabellen. |
| `tests/v1/leads.spec.ts` | Playwright e2e. |

---

### Task 0: Voorbereiding

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Controleer werkmap en branch**

Run: `cd /c/Users/solys/Documents/Code/chatmanta-leads && git rev-parse --abbrev-ref HEAD && git status --short`
Expected: `feat/seb/leads-dashboard` en een schone tree (alleen eventueel het plan).

- [ ] **Step 2: Migratienummer bevestigen**

Gebruik de `check-migration`-skill voor `supabase/migrations-v1/`. Expected: volgende vrije nummer is `0032` (en daarna `0033`). Is dat anders, gebruik dan de nummers die de skill geeft in Task 7 en Task 17, en pas de bestandsnamen in dit plan in gedachten aan.

- [ ] **Step 3: `qrcode` installeren**

Run: `npm install qrcode@1.5.4 && npm install -D @types/qrcode@1.5.5`
Expected: beide in `package.json`, geen errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -F /tmp/msg.txt   # inhoud: "chore(leads): qrcode toevoegen voor de belmodus" + Co-Authored-By-regel
```

---

### Task 1: Types en labels

**Files:**
- Create: `lib/leads/types.ts`

- [ ] **Step 1: Schrijf `lib/leads/types.ts`**

```ts
// Gedeelde types en vaste lijsten van het leads-dashboard (/v1/leads).
// Geen runtime-afhankelijkheden: veilig in client- én servercode.

export const LEAD_STATUSSEN = [
  'open',
  'terugbellen',
  'opvolgen',
  'kans',
  'klant',
  'geen_interesse',
  'niet_bellen',
  'heeft_chatbot',
  'archief',
] as const;
export type LeadStatus = (typeof LEAD_STATUSSEN)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  open: 'Open',
  terugbellen: 'Terugbellen',
  opvolgen: 'Opvolgen',
  kans: 'Kans',
  klant: 'Klant',
  geen_interesse: 'Geen interesse',
  niet_bellen: 'Niet bellen',
  heeft_chatbot: 'Heeft chatbot',
  archief: 'Archief',
};

export const UITKOMSTEN = [
  'niet_opgenomen',
  'terugbellen',
  'wil_mail',
  'interesse',
  'geen_interesse',
  'niet_bellen',
] as const;
export type Uitkomst = (typeof UITKOMSTEN)[number];

export const UITKOMST_LABEL: Record<Uitkomst, string> = {
  niet_opgenomen: 'Niet opgenomen',
  terugbellen: 'Terugbellen',
  wil_mail: 'Wil een mail',
  interesse: 'Interesse',
  geen_interesse: 'Geen interesse',
  niet_bellen: 'Niet bellen',
};

export const BEZWAREN = [
  'geen_interesse',
  'chatbots_irritant',
  'heeft_chatbot',
  'wil_mens',
  'te_duur',
  'te_klein',
  'te_ingewikkeld',
  'vertrouwt_ai_niet',
  'volgende_maand',
] as const;
export type Bezwaar = (typeof BEZWAREN)[number];

export const BEZWAAR_LABEL: Record<Bezwaar, string> = {
  geen_interesse: 'Geen interesse',
  chatbots_irritant: 'Chatbots zijn irritant',
  heeft_chatbot: 'Heeft al een chatbot',
  wil_mens: 'Klanten willen een mens',
  te_duur: 'Te duur',
  te_klein: 'Te klein',
  te_ingewikkeld: 'Te ingewikkeld',
  vertrouwt_ai_niet: 'Vertrouwt AI niet',
  volgende_maand: 'Bel volgende maand',
};

export const NIET_BELLEN_REDENEN = [
  'verkeerd_nummer',
  'geen_doelgroep',
  'al_klant',
  'bestaat_niet_meer',
  'heeft_chatbot',
] as const;
export type NietBellenReden = (typeof NIET_BELLEN_REDENEN)[number];

export const NIET_BELLEN_LABEL: Record<NietBellenReden, string> = {
  verkeerd_nummer: 'Verkeerd nummer',
  geen_doelgroep: 'Geen doelgroep',
  al_klant: 'Al klant',
  bestaat_niet_meer: 'Bestaat niet meer',
  heeft_chatbot: 'Heeft al een chatbot',
};

export const OPVOLG_SITUATIES = ['info', 'test', 'kennis', 'klaar', 'herinnering'] as const;
export type OpvolgSituatie = (typeof OPVOLG_SITUATIES)[number];

export const OPVOLG_SITUATIE_LABEL: Record<OpvolgSituatie, { titel: string; uitleg: string }> = {
  info: { titel: 'Interesse, wil meer weten', uitleg: 'Info plus aanbod van een gratis testversie' },
  test: { titel: 'Testversie afgesproken', uitleg: 'Bevestiging; jij zet hem klaar' },
  kennis: { titel: 'Wil eerst kennismaken', uitleg: 'Kort gesprek voorstellen' },
  klaar: { titel: 'Testversie staat klaar', uitleg: 'Link naar hun eigen chatbot' },
  herinnering: { titel: 'Korte herinnering', uitleg: 'Na 3 à 4 werkdagen zonder reactie' },
};

export const ACTIVITEIT_SOORTEN = ['belpoging', 'mail', 'notitie', 'status', 'kennismaking', 'import'] as const;
export type ActiviteitSoort = (typeof ACTIVITEIT_SOORTEN)[number];

/** De "stand"-kolommen van een lead: wat een uitkomst verandert en wat ongedaan maken terugzet. */
export type Stand = {
  status: LeadStatus;
  status_reden: string | null;
  volgende_actie_op: string | null; // ISO
  volgende_actie_notitie: string | null;
  pogingen_niet_opgenomen: number;
  laatste_poging_op: string | null;
  kennismaking_op: string | null;
  opvolgmail_gestuurd_op: string | null;
  opvolgmail_situatie: OpvolgSituatie | null;
};

export const STAND_KOLOMMEN = [
  'status',
  'status_reden',
  'volgende_actie_op',
  'volgende_actie_notitie',
  'pogingen_niet_opgenomen',
  'laatste_poging_op',
  'kennismaking_op',
  'opvolgmail_gestuurd_op',
  'opvolgmail_situatie',
] as const satisfies readonly (keyof Stand)[];

export function pakStand(l: Stand): Stand {
  return {
    status: l.status,
    status_reden: l.status_reden,
    volgende_actie_op: l.volgende_actie_op,
    volgende_actie_notitie: l.volgende_actie_notitie,
    pogingen_niet_opgenomen: l.pogingen_niet_opgenomen,
    laatste_poging_op: l.laatste_poging_op,
    kennismaking_op: l.kennismaking_op,
    opvolgmail_gestuurd_op: l.opvolgmail_gestuurd_op,
    opvolgmail_situatie: l.opvolgmail_situatie,
  };
}

export type Lead = Stand & {
  id: string;
  domein: string | null;
  telefoon: string | null;
  bedrijfsnaam: string;
  website_url: string | null;
  niche: string | null;
  plaats: string | null;
  provincie: string | null;
  telefoons_extra: string[];
  email: string | null;
  emails_gevonden: string[];
  contactpersoon: string | null;
  aanspreekvorm: 'je' | 'u';
  haakje: string | null;
  notitie: string | null;
  google_rating: number | null;
  google_reviews: number | null;
  heeft_chatbot: boolean | null;
  chatbot_naam: string | null;
  platform: string | null;
  woorden: number | null;
  score: number | null;
  score_max: number | null;
  score_redenen: string[];
  score_voorlopig: boolean;
  labels: string[];
  geclaimd_door: string | null;
  geclaimd_tot: string | null;
  bron: string;
  created_at: string;
  updated_at: string;
};

/** Velden die de beller zelf mag bewerken (detail + belmodus). */
export const BEWERKBARE_VELDEN = [
  'bedrijfsnaam',
  'website_url',
  'niche',
  'plaats',
  'telefoon',
  'email',
  'contactpersoon',
  'aanspreekvorm',
  'haakje',
  'notitie',
] as const satisfies readonly (keyof Lead)[];
export type BewerkbaarVeld = (typeof BEWERKBARE_VELDEN)[number];

export type Activiteit = {
  id: string;
  lead_id: string;
  user_id: string | null;
  soort: ActiviteitSoort;
  uitkomst: Uitkomst | null;
  details: Record<string, unknown>;
  vorige_staat: Stand | null;
  ongedaan_op: string | null;
  created_at: string;
};

export type Afzender = {
  naam: string;
  voornaam: string;
  functie: string;
  telefoon: string;
  email: string;
  fotoUrl: string | null;
};

export const LABEL_TEKST: Record<string, string> = {
  keten: 'Keten/vestiging',
  generieke_naam: 'Generieke naam',
  site_onbereikbaar: 'Site onbereikbaar',
  weinig_tekst: 'Weinig tekst',
};
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p . 2>&1 | grep "lib/leads" ; echo klaar`
Expected: geen regels met `lib/leads`, dan `klaar`.

- [ ] **Step 3: Commit** — `feat(leads): types en vaste lijsten`

---

### Task 2: Normaliseren (domein, URL, telefoon, e-mail)

**Files:**
- Create: `lib/leads/normaliseren.ts`
- Test: `lib/leads/__tests__/normaliseren.test.ts`

- [ ] **Step 1: Schrijf de test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseerDomein,
  schoneWebsiteUrl,
  normaliseerTelefoon,
  toonTelefoon,
  isGeldigEmail,
  telLink,
} from '../normaliseren';

test('normaliseerDomein: kleine letters, zonder www, pad, query of poort', () => {
  assert.equal(normaliseerDomein('https://www.Jansen-Bouw.nl/contact?utm_source=x'), 'jansen-bouw.nl');
  assert.equal(normaliseerDomein('jansen-bouw.nl'), 'jansen-bouw.nl');
  assert.equal(normaliseerDomein('http://jansen-bouw.nl:8080/'), 'jansen-bouw.nl');
  assert.equal(normaliseerDomein('  '), null);
  assert.equal(normaliseerDomein(null), null);
  assert.equal(normaliseerDomein('geen domein'), null);
});

test('schoneWebsiteUrl: haalt query en hash weg, houdt host en pad', () => {
  assert.equal(
    schoneWebsiteUrl('http://www.jansen-bouw.nl/?utm_source=google&utm_medium=cpc#top'),
    'http://www.jansen-bouw.nl/',
  );
  assert.equal(schoneWebsiteUrl('jansen-bouw.nl/vestiging/ede'), 'https://jansen-bouw.nl/vestiging/ede');
  assert.equal(schoneWebsiteUrl(''), null);
});

test('normaliseerTelefoon: NL-nummers naar +31', () => {
  assert.equal(normaliseerTelefoon('06 12345678'), '+31612345678');
  assert.equal(normaliseerTelefoon('06-12 34 56 78'), '+31612345678');
  assert.equal(normaliseerTelefoon('+31 6 12345678'), '+31612345678');
  assert.equal(normaliseerTelefoon('0031612345678'), '+31612345678');
  assert.equal(normaliseerTelefoon('026 123 4567'), '+31261234567');
  assert.equal(normaliseerTelefoon('(026) 1234567'), '+31261234567');
});

test('normaliseerTelefoon: onzin en te kort wordt null, buitenlands blijft', () => {
  assert.equal(normaliseerTelefoon('1234'), null);
  assert.equal(normaliseerTelefoon('bel ons'), null);
  assert.equal(normaliseerTelefoon(''), null);
  assert.equal(normaliseerTelefoon('+49 30 1234567'), '+49301234567');
});

test('toonTelefoon: leesbaar en tel-link', () => {
  assert.equal(toonTelefoon('+31612345678'), '06 12 34 56 78');
  assert.equal(toonTelefoon('+31261234567'), '026 123 4567');
  assert.equal(toonTelefoon('+49301234567'), '+49301234567');
  assert.equal(telLink('+31612345678'), 'tel:+31612345678');
});

test('isGeldigEmail', () => {
  assert.equal(isGeldigEmail('jan@jansen-bouw.nl'), true);
  assert.equal(isGeldigEmail('info@jansen-bouw.co.uk'), true);
  assert.equal(isGeldigEmail('0612345678'), false);
  assert.equal(isGeldigEmail(''), false);
  assert.equal(isGeldigEmail('jan@jansen'), false);
  assert.equal(isGeldigEmail('jan @jansen.nl'), false);
  assert.equal(isGeldigEmail('afbeelding@2x.png'), false);
});
```

- [ ] **Step 2: Run, verwacht FAIL** (`Cannot find module '../normaliseren'`)

Run: `node --import tsx --conditions=react-server --test lib/leads/__tests__/normaliseren.test.ts`

- [ ] **Step 3: Schrijf `lib/leads/normaliseren.ts`**

```ts
// Normalisatie van lead-sleutels. Domein en telefoon zijn de dubbelchecks
// (partiële unieke indexen in migr 0032), dus deze functies MOETEN stabiel zijn.

function parseUrl(input: string): URL | null {
  const s = input.trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

/** "https://www.Jansen-Bouw.nl/x?y" → "jansen-bouw.nl". Null bij geen geldige host. */
export function normaliseerDomein(input: string | null | undefined): string | null {
  if (!input) return null;
  const url = parseUrl(input);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}

/** Website-link om te openen: zonder query (utm e.d.) en hash, host en pad blijven. */
export function schoneWebsiteUrl(input: string | null | undefined): string | null {
  if (!input) return null;
  const url = parseUrl(input);
  if (!url || !normaliseerDomein(url.hostname)) return null;
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/** Naar E.164. NL: 10 cijfers met voorloop-0 → +31…; buitenlands met + blijft. */
export function normaliseerTelefoon(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim();
  const plus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (!plus && digits.startsWith('00')) {
    digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? normaliseerTelefoon(`+${digits}`) : null;
  }
  if (plus) {
    if (digits.startsWith('31')) {
      const rest = digits.slice(2).replace(/^0/, '');
      return rest.length === 9 ? `+31${rest}` : null;
    }
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10 && digits.startsWith('0')) return `+31${digits.slice(1)}`;
  return null;
}

/** "+31612345678" → "06 12 34 56 78"; vaste lijn "+31261234567" → "026 123 4567". */
export function toonTelefoon(e164: string | null | undefined): string {
  if (!e164) return '';
  if (!e164.startsWith('+31') || e164.length !== 12) return e164;
  const nat = `0${e164.slice(3)}`;
  if (nat.startsWith('06')) return `06 ${nat.slice(2).replace(/(\d{2})(?=\d)/g, '$1 ')}`;
  return `${nat.slice(0, 3)} ${nat.slice(3, 6)} ${nat.slice(6)}`;
}

export function telLink(e164: string): string {
  return `tel:${e164}`;
}

const AFBEELDING = /\.(png|jpe?g|gif|svg|webp)$/i;

export function isGeldigEmail(input: string | null | undefined): boolean {
  if (!input) return false;
  const s = input.trim();
  if (AFBEELDING.test(s)) return false;
  return /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(s);
}
```

- [ ] **Step 4: Run, verwacht PASS** (zelfde commando, alle tests ok)

- [ ] **Step 5: Commit** — `feat(leads): normaliseren van domein, telefoon en e-mail`

---

### Task 3: Werkdagen en tijd in Amsterdam

**Files:**
- Create: `lib/leads/werkdagen.ts`
- Test: `lib/leads/__tests__/werkdagen.test.ts`

- [ ] **Step 1: Schrijf de test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  amsDelen,
  amsTijdstip,
  plusWerkdagenOm,
  volgendeWerkdagOm,
  plusMaandenOm,
  isOchtend,
  beginVanDag,
  beginVanMorgen,
  beginVanWeek,
  beginVanMaand,
  dagdeelVoorMail,
} from '../werkdagen';

// 2026-10-16 is een vrijdag. Zomertijd (UTC+2) tot zondag 2026-10-25 03:00.
const VR_1030 = new Date('2026-10-16T08:30:00Z'); // vr 10:30 Amsterdam
const VR_1500 = new Date('2026-10-16T13:00:00Z'); // vr 15:00 Amsterdam

test('amsDelen en amsTijdstip zijn elkaars inverse', () => {
  const d = amsDelen(VR_1030);
  assert.deepEqual([d.jaar, d.maand, d.dag, d.uur, d.minuut, d.weekdag], [2026, 10, 16, 10, 30, 5]);
  assert.equal(amsTijdstip(2026, 10, 16, 10, 30).toISOString(), VR_1030.toISOString());
  // wintertijd (UTC+1)
  assert.equal(amsTijdstip(2026, 10, 26, 9).toISOString(), '2026-10-26T08:00:00.000Z');
});

test('volgendeWerkdagOm slaat het weekend over', () => {
  assert.equal(volgendeWerkdagOm(VR_1030, 13).toISOString(), '2026-10-19T11:00:00.000Z'); // ma 13:00
});

test('plusWerkdagenOm over de wissel naar wintertijd', () => {
  const vr = new Date('2026-10-23T08:00:00Z'); // vr 23 okt 10:00
  assert.equal(plusWerkdagenOm(vr, 1, 9).toISOString(), '2026-10-26T08:00:00.000Z'); // ma 9:00 CET
  assert.equal(plusWerkdagenOm(vr, 3, 10).toISOString(), '2026-10-28T09:00:00.000Z'); // wo 10:00 CET
});

test('plusMaandenOm klemt op de laatste dag van de maand', () => {
  const d = amsTijdstip(2026, 11, 30, 11);
  assert.equal(plusMaandenOm(d, 3, 10).toISOString(), amsTijdstip(2027, 2, 28, 10).toISOString());
});

test('isOchtend', () => {
  assert.equal(isOchtend(VR_1030), true);
  assert.equal(isOchtend(VR_1500), false);
});

test('periodes', () => {
  assert.equal(beginVanDag(VR_1500).toISOString(), '2026-10-15T22:00:00.000Z');
  assert.equal(beginVanMorgen(VR_1500).toISOString(), '2026-10-16T22:00:00.000Z');
  assert.equal(beginVanWeek(VR_1500).toISOString(), '2026-10-11T22:00:00.000Z'); // ma 12 okt 0:00
  assert.equal(beginVanMaand(VR_1500).toISOString(), '2026-09-30T22:00:00.000Z');
});

test('dagdeelVoorMail', () => {
  assert.equal(dagdeelVoorMail(VR_1030, VR_1500), 'vanochtend');
  assert.equal(dagdeelVoorMail(VR_1500, VR_1500), 'vanmiddag');
  assert.equal(dagdeelVoorMail(new Date('2026-10-15T13:00:00Z'), VR_1500), 'gisteren');
  assert.equal(dagdeelVoorMail(new Date('2026-10-10T13:00:00Z'), VR_1500), 'vandaag');
  assert.equal(dagdeelVoorMail(null, VR_1500), 'vandaag');
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `node --import tsx --conditions=react-server --test lib/leads/__tests__/werkdagen.test.ts`

- [ ] **Step 3: Schrijf `lib/leads/werkdagen.ts`**

```ts
// Alle tijdrekening van het leads-dashboard in Europe/Amsterdam, zonder library.
// Kalenderrekenen gebeurt op datum-niveau in UTC (geen DST-gedoe), het omzetten
// naar een echt tijdstip via amsTijdstip (corrigeert de offset iteratief).

const TZ = 'Europe/Amsterdam';
const WEEKDAG: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
});

export type Delen = { jaar: number; maand: number; dag: number; uur: number; minuut: number; weekdag: number };

export function amsDelen(d: Date): Delen {
  const p: Record<string, string> = {};
  for (const x of FMT.formatToParts(d)) p[x.type] = x.value;
  return {
    jaar: Number(p.year),
    maand: Number(p.month),
    dag: Number(p.day),
    uur: Number(p.hour),
    minuut: Number(p.minute),
    weekdag: WEEKDAG[p.weekday],
  };
}

/** Het echte tijdstip van een Amsterdamse wandkloktijd. */
export function amsTijdstip(jaar: number, maand: number, dag: number, uur: number, minuut = 0): Date {
  const doel = Date.UTC(jaar, maand - 1, dag, uur, minuut);
  let t = doel;
  for (let i = 0; i < 3; i++) {
    const p = amsDelen(new Date(t));
    const diff = Date.UTC(p.jaar, p.maand - 1, p.dag, p.uur, p.minuut) - doel;
    if (diff === 0) break;
    t -= diff;
  }
  return new Date(t);
}

type Kalenderdag = { jaar: number; maand: number; dag: number; weekdag: number };

function kalender(jaar: number, maand: number, dag: number, plus: number): Kalenderdag {
  const d = new Date(Date.UTC(jaar, maand - 1, dag + plus));
  return { jaar: d.getUTCFullYear(), maand: d.getUTCMonth() + 1, dag: d.getUTCDate(), weekdag: d.getUTCDay() };
}

const isWerkdag = (k: Kalenderdag) => k.weekdag !== 0 && k.weekdag !== 6;

/** n werkdagen na vandaag (ma-vr, feestdagen genegeerd), om `uur`:00. */
export function plusWerkdagenOm(nu: Date, n: number, uur: number): Date {
  const v = amsDelen(nu);
  let k = kalender(v.jaar, v.maand, v.dag, 0);
  let plus = 0;
  let gezien = 0;
  while (gezien < n) {
    plus++;
    k = kalender(v.jaar, v.maand, v.dag, plus);
    if (isWerkdag(k)) gezien++;
  }
  return amsTijdstip(k.jaar, k.maand, k.dag, uur);
}

export function volgendeWerkdagOm(nu: Date, uur: number): Date {
  return plusWerkdagenOm(nu, 1, uur);
}

export function plusMaandenOm(nu: Date, n: number, uur: number): Date {
  const v = amsDelen(nu);
  const eerste = new Date(Date.UTC(v.jaar, v.maand - 1 + n, 1));
  const jaar = eerste.getUTCFullYear();
  const maand = eerste.getUTCMonth() + 1;
  const laatste = new Date(Date.UTC(jaar, maand, 0)).getUTCDate();
  return amsTijdstip(jaar, maand, Math.min(v.dag, laatste), uur);
}

export function isOchtend(d: Date): boolean {
  return amsDelen(d).uur < 12;
}

export function beginVanDag(nu: Date): Date {
  const v = amsDelen(nu);
  return amsTijdstip(v.jaar, v.maand, v.dag, 0);
}

/** Begin van morgen = einde (exclusief) van vandaag. */
export function beginVanMorgen(nu: Date): Date {
  const v = amsDelen(nu);
  const k = kalender(v.jaar, v.maand, v.dag, 1);
  return amsTijdstip(k.jaar, k.maand, k.dag, 0);
}

/** Maandag 0:00 van deze week. */
export function beginVanWeek(nu: Date): Date {
  const v = amsDelen(nu);
  const terug = (v.weekdag + 6) % 7;
  const k = kalender(v.jaar, v.maand, v.dag, -terug);
  return amsTijdstip(k.jaar, k.maand, k.dag, 0);
}

export function beginVanMaand(nu: Date): Date {
  const v = amsDelen(nu);
  return amsTijdstip(v.jaar, v.maand, 1, 0);
}

export type Dagdeel = 'vanochtend' | 'vanmiddag' | 'vandaag' | 'gisteren';

/** Voor "Ons gesprek van …" in de opvolgmail, op basis van de laatste belpoging. */
export function dagdeelVoorMail(poging: Date | null, nu: Date): Dagdeel {
  if (!poging) return 'vandaag';
  const p = amsDelen(poging);
  const n = amsDelen(nu);
  if (p.jaar === n.jaar && p.maand === n.maand && p.dag === n.dag) return p.uur < 12 ? 'vanochtend' : 'vanmiddag';
  const g = kalender(n.jaar, n.maand, n.dag, -1);
  if (p.jaar === g.jaar && p.maand === g.maand && p.dag === g.dag) return 'gisteren';
  return 'vandaag';
}

/** "vr 16 okt 14:00" voor in lijsten. */
export function toonMoment(iso: string | null, nu: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const v = amsDelen(d);
  const n = amsDelen(nu);
  const morgen = kalender(n.jaar, n.maand, n.dag, 1);
  const tijd = `${String(v.uur).padStart(2, '0')}:${String(v.minuut).padStart(2, '0')}`;
  if (v.jaar === n.jaar && v.maand === n.maand && v.dag === n.dag) return `vandaag ${tijd}`;
  if (v.jaar === morgen.jaar && v.maand === morgen.maand && v.dag === morgen.dag) return `morgen ${tijd}`;
  const datum = new Intl.DateTimeFormat('nl-NL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  return `${datum} ${tijd}`;
}
```

- [ ] **Step 4: Run, verwacht PASS**

- [ ] **Step 5: Commit** — `feat(leads): werkdagen en tijd in Amsterdam`

---

### Task 4: Overgangen na een uitkomst (`volgendeStand`)

**Files:**
- Create: `lib/leads/volgende-stand.ts`
- Test: `lib/leads/__tests__/volgende-stand.test.ts`

- [ ] **Step 1: Schrijf de test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { volgendeStand, naMailVerstuurd, handmatigeStatus, isLaatstePoging, MAX_POGINGEN } from '../volgende-stand';
import type { Stand } from '../types';

const VR_1030 = new Date('2026-10-16T08:30:00Z');
const VR_1500 = new Date('2026-10-16T13:00:00Z');

const open: Stand = {
  status: 'open',
  status_reden: null,
  volgende_actie_op: null,
  volgende_actie_notitie: null,
  pogingen_niet_opgenomen: 0,
  laatste_poging_op: null,
  kennismaking_op: null,
  opvolgmail_gestuurd_op: null,
  opvolgmail_situatie: null,
};

test('niet opgenomen in de ochtend → volgende werkdag 13:00', () => {
  const r = volgendeStand(open, { uitkomst: 'niet_opgenomen', voicemail: true }, VR_1030);
  assert.equal(r.stand.status, 'open');
  assert.equal(r.stand.pogingen_niet_opgenomen, 1);
  assert.equal(r.stand.volgende_actie_op, '2026-10-19T11:00:00.000Z');
  assert.equal(r.stand.laatste_poging_op, VR_1030.toISOString());
  assert.deepEqual(r.details, { voicemail: true, poging: 1 });
  assert.equal(r.opentMail, null);
});

test('niet opgenomen in de middag → volgende werkdag 9:00', () => {
  const r = volgendeStand(open, { uitkomst: 'niet_opgenomen' }, VR_1500);
  assert.equal(r.stand.volgende_actie_op, '2026-10-19T07:00:00.000Z');
});

test('een gemiste terugbelafspraak wordt weer open', () => {
  const r = volgendeStand({ ...open, status: 'terugbellen' }, { uitkomst: 'niet_opgenomen' }, VR_1500);
  assert.equal(r.stand.status, 'open');
});

test('derde keer niet opgenomen vraagt een keuze', () => {
  const twee = { ...open, pogingen_niet_opgenomen: MAX_POGINGEN - 1 };
  assert.equal(isLaatstePoging(twee), true);
  assert.equal(isLaatstePoging(open), false);
  assert.throws(() => volgendeStand(twee, { uitkomst: 'niet_opgenomen' }, VR_1500), /keuze/);
  const mail = volgendeStand(twee, { uitkomst: 'niet_opgenomen', naDerde: 'mail' }, VR_1500);
  assert.equal(mail.stand.status, 'opvolgen');
  assert.equal(mail.opentMail, 'info');
  const arch = volgendeStand(twee, { uitkomst: 'niet_opgenomen', naDerde: 'archief' }, VR_1500);
  assert.equal(arch.stand.status, 'archief');
  assert.equal(arch.stand.status_reden, '3x niet opgenomen');
  assert.equal(arch.stand.volgende_actie_op, null);
});

test('terugbellen eist een moment in de toekomst', () => {
  assert.throws(() => volgendeStand(open, { uitkomst: 'terugbellen', op: '2026-10-16T07:00:00Z' }, VR_1030), /toekomst/);
  const r = volgendeStand(open, { uitkomst: 'terugbellen', op: '2026-10-19T12:00:00Z', notitie: ' vraag naar Jan ' }, VR_1030);
  assert.equal(r.stand.status, 'terugbellen');
  assert.equal(r.stand.volgende_actie_op, '2026-10-19T12:00:00.000Z');
  assert.equal(r.stand.volgende_actie_notitie, 'vraag naar Jan');
});

test('wil een mail → opvolgen, +3 werkdagen, mail-pop-up info', () => {
  const r = volgendeStand(open, { uitkomst: 'wil_mail' }, VR_1030);
  assert.equal(r.stand.status, 'opvolgen');
  assert.equal(r.stand.volgende_actie_op, '2026-10-21T08:00:00.000Z'); // wo 10:00
  assert.equal(r.opentMail, 'info');
});

test('interesse met kennismaking → kans, actie op de kennismaking, mail "kennis"', () => {
  const km = '2026-10-20T08:00:00.000Z';
  const r = volgendeStand(open, { uitkomst: 'interesse', mail: true, kennismakingOp: km }, VR_1030);
  assert.equal(r.stand.status, 'kans');
  assert.equal(r.stand.kennismaking_op, km);
  assert.equal(r.stand.volgende_actie_op, km);
  assert.equal(r.opentMail, 'kennis');
  assert.equal(r.kennismaking, true);
});

test('interesse alleen mail → mail "info"; zonder keuze is fout', () => {
  const r = volgendeStand(open, { uitkomst: 'interesse', mail: true, kennismakingOp: null }, VR_1030);
  assert.equal(r.opentMail, 'info');
  assert.equal(r.kennismaking, false);
  assert.throws(() => volgendeStand(open, { uitkomst: 'interesse', mail: false, kennismakingOp: null }, VR_1030));
});

test('interesse alleen kennismaking → geen mail', () => {
  const r = volgendeStand(open, { uitkomst: 'interesse', mail: false, kennismakingOp: '2026-10-20T08:00:00Z' }, VR_1030);
  assert.equal(r.opentMail, null);
});

test('geen interesse: weg of over 3 maanden', () => {
  const weg = volgendeStand(open, { uitkomst: 'geen_interesse', bezwaar: 'te_duur', opnieuwOver3Maanden: false }, VR_1030);
  assert.equal(weg.stand.status, 'geen_interesse');
  assert.equal(weg.stand.status_reden, 'te_duur');
  assert.deepEqual(weg.details, { bezwaar: 'te_duur', opnieuw: false });
  const later = volgendeStand(open, { uitkomst: 'geen_interesse', bezwaar: null, opnieuwOver3Maanden: true }, VR_1030);
  assert.equal(later.stand.status, 'terugbellen');
  assert.equal(later.stand.volgende_actie_op, '2027-01-16T09:00:00.000Z');
});

test('niet bellen; heeft chatbot gaat naar zijn eigen tabblad', () => {
  assert.equal(volgendeStand(open, { uitkomst: 'niet_bellen', reden: 'verkeerd_nummer' }, VR_1030).stand.status, 'niet_bellen');
  assert.equal(volgendeStand(open, { uitkomst: 'niet_bellen', reden: 'heeft_chatbot' }, VR_1030).stand.status, 'heeft_chatbot');
});

test('naMailVerstuurd: open → opvolgen; kans blijft kans met actie op de kennismaking', () => {
  const a = naMailVerstuurd(open, 'info', VR_1030);
  assert.equal(a.status, 'opvolgen');
  assert.equal(a.opvolgmail_situatie, 'info');
  assert.equal(a.opvolgmail_gestuurd_op, VR_1030.toISOString());
  assert.equal(a.volgende_actie_op, '2026-10-21T08:00:00.000Z');
  const km = '2026-10-20T08:00:00.000Z';
  const b = naMailVerstuurd({ ...open, status: 'kans', kennismaking_op: km }, 'kennis', VR_1030);
  assert.equal(b.status, 'kans');
  assert.equal(b.volgende_actie_op, km);
});

test('handmatigeStatus: terug naar open reset pogingen en actie', () => {
  const r = handmatigeStatus({ ...open, status: 'archief', pogingen_niet_opgenomen: 3, volgende_actie_op: 'x' }, 'open');
  assert.equal(r.status, 'open');
  assert.equal(r.pogingen_niet_opgenomen, 0);
  assert.equal(r.volgende_actie_op, null);
  assert.equal(handmatigeStatus(open, 'archief', 'adresgids').status_reden, 'adresgids');
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `node --import tsx --conditions=react-server --test lib/leads/__tests__/volgende-stand.test.ts`

- [ ] **Step 3: Schrijf `lib/leads/volgende-stand.ts`**

```ts
// Alle regels "wat gebeurt er na uitkomst X" op één plek, puur en getest.
// De server action past alleen het resultaat toe en logt `details`.

import type { Bezwaar, NietBellenReden, OpvolgSituatie, Stand } from './types';
import { isOchtend, plusMaandenOm, plusWerkdagenOm, volgendeWerkdagOm } from './werkdagen';

export const MAX_POGINGEN = 3;

export type UitkomstOpties =
  | { uitkomst: 'niet_opgenomen'; voicemail?: boolean; naDerde?: 'mail' | 'archief' }
  | { uitkomst: 'terugbellen'; op: string; notitie?: string | null }
  | { uitkomst: 'wil_mail' }
  | { uitkomst: 'interesse'; mail: boolean; kennismakingOp: string | null }
  | { uitkomst: 'geen_interesse'; bezwaar: Bezwaar | null; opnieuwOver3Maanden: boolean }
  | { uitkomst: 'niet_bellen'; reden: NietBellenReden };

export type Overgang = {
  stand: Stand;
  details: Record<string, unknown>;
  /** Welke opvolgmail-situatie de UI meteen moet openen (of null). */
  opentMail: OpvolgSituatie | null;
  /** True als er een kennismaking is gepland (extra activiteit 'kennismaking'). */
  kennismaking: boolean;
};

export function isLaatstePoging(s: Pick<Stand, 'pogingen_niet_opgenomen'>): boolean {
  return s.pogingen_niet_opgenomen + 1 >= MAX_POGINGEN;
}

function geldigeDatum(iso: string, fout: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(fout);
  return d;
}

export function volgendeStand(huidig: Stand, o: UitkomstOpties, nu: Date): Overgang {
  const basis: Stand = {
    ...huidig,
    laatste_poging_op: nu.toISOString(),
    volgende_actie_notitie: null,
    status_reden: null,
  };
  const zonder = { opentMail: null, kennismaking: false } as const;

  switch (o.uitkomst) {
    case 'niet_opgenomen': {
      const poging = huidig.pogingen_niet_opgenomen + 1;
      const details = { voicemail: Boolean(o.voicemail), poging };
      if (poging >= MAX_POGINGEN) {
        if (o.naDerde === 'mail') {
          return {
            stand: { ...basis, pogingen_niet_opgenomen: poging, status: 'opvolgen', volgende_actie_op: nu.toISOString() },
            details: { ...details, naDerde: 'mail' },
            opentMail: 'info',
            kennismaking: false,
          };
        }
        if (o.naDerde === 'archief') {
          return {
            stand: {
              ...basis,
              pogingen_niet_opgenomen: poging,
              status: 'archief',
              status_reden: '3x niet opgenomen',
              volgende_actie_op: null,
            },
            details: { ...details, naDerde: 'archief' },
            ...zonder,
          };
        }
        throw new Error('Bij de laatste poging is een keuze nodig: mail sturen of archiveren.');
      }
      const volgende = isOchtend(nu) ? volgendeWerkdagOm(nu, 13) : volgendeWerkdagOm(nu, 9);
      return {
        stand: { ...basis, pogingen_niet_opgenomen: poging, status: 'open', volgende_actie_op: volgende.toISOString() },
        details,
        ...zonder,
      };
    }

    case 'terugbellen': {
      const op = geldigeDatum(o.op, 'Kies een moment in de toekomst.');
      if (op.getTime() <= nu.getTime()) throw new Error('Kies een moment in de toekomst.');
      const notitie = o.notitie?.trim() || null;
      return {
        stand: { ...basis, status: 'terugbellen', volgende_actie_op: op.toISOString(), volgende_actie_notitie: notitie },
        details: { op: op.toISOString(), notitie },
        ...zonder,
      };
    }

    case 'wil_mail':
      return {
        stand: { ...basis, status: 'opvolgen', volgende_actie_op: plusWerkdagenOm(nu, 3, 10).toISOString() },
        details: {},
        opentMail: 'info',
        kennismaking: false,
      };

    case 'interesse': {
      if (!o.mail && !o.kennismakingOp) throw new Error('Kies mail sturen, kennismaking of allebei.');
      const km = o.kennismakingOp
        ? geldigeDatum(o.kennismakingOp, 'Ongeldige datum voor de kennismaking.').toISOString()
        : null;
      return {
        stand: {
          ...basis,
          status: 'kans',
          kennismaking_op: km ?? huidig.kennismaking_op,
          volgende_actie_op: km ?? plusWerkdagenOm(nu, 3, 10).toISOString(),
        },
        details: { mail: o.mail, kennismaking_op: km },
        opentMail: o.mail ? (km ? 'kennis' : 'info') : null,
        kennismaking: km !== null,
      };
    }

    case 'geen_interesse': {
      const details = { bezwaar: o.bezwaar ?? null, opnieuw: o.opnieuwOver3Maanden };
      if (o.opnieuwOver3Maanden) {
        return {
          stand: {
            ...basis,
            status: 'terugbellen',
            status_reden: o.bezwaar ?? null,
            volgende_actie_op: plusMaandenOm(nu, 3, 10).toISOString(),
            volgende_actie_notitie: 'Over 3 maanden opnieuw proberen',
          },
          details,
          ...zonder,
        };
      }
      return {
        stand: { ...basis, status: 'geen_interesse', status_reden: o.bezwaar ?? null, volgende_actie_op: null },
        details,
        ...zonder,
      };
    }

    case 'niet_bellen':
      return {
        stand: {
          ...basis,
          status: o.reden === 'heeft_chatbot' ? 'heeft_chatbot' : 'niet_bellen',
          status_reden: o.reden,
          volgende_actie_op: null,
        },
        details: { reden: o.reden },
        ...zonder,
      };

    default: {
      const nooit: never = o;
      throw new Error(`Onbekende uitkomst: ${JSON.stringify(nooit)}`);
    }
  }
}

/** Na "Verstuurd? → ja" in de mail-pop-up. */
export function naMailVerstuurd(huidig: Stand, situatie: OpvolgSituatie, nu: Date): Stand {
  const blijft = huidig.status === 'kans' || huidig.status === 'klant';
  const kmToekomst = huidig.kennismaking_op && new Date(huidig.kennismaking_op).getTime() > nu.getTime();
  return {
    ...huidig,
    status: blijft ? huidig.status : 'opvolgen',
    opvolgmail_gestuurd_op: nu.toISOString(),
    opvolgmail_situatie: situatie,
    volgende_actie_op:
      huidig.status === 'kans' && kmToekomst ? huidig.kennismaking_op : plusWerkdagenOm(nu, 3, 10).toISOString(),
  };
}

export type HandmatigeStatus = 'open' | 'archief' | 'niet_bellen' | 'klant' | 'geen_interesse';

/** Knoppen in lijst/detail: archiveren, terug naar open, klant geworden, afgehaakt, niet bellen. */
export function handmatigeStatus(huidig: Stand, naar: HandmatigeStatus, reden: string | null = null): Stand {
  return {
    ...huidig,
    status: naar,
    status_reden: reden,
    volgende_actie_op: null,
    volgende_actie_notitie: null,
    pogingen_niet_opgenomen: naar === 'open' ? 0 : huidig.pogingen_niet_opgenomen,
  };
}
```

- [ ] **Step 4: Run, verwacht PASS**

- [ ] **Step 5: Commit** — `feat(leads): overgangen na een beluitkomst`

---

### Task 5: Opvolgmail-bouwer (port van de maker)

Bron van waarheid: `C:\Users\solys\Documents\ChatManta-opvolgmails\opvolgmail-maker.html` (functies `teksten()` en `mail()`). Lees hem vóór je begint. De teksten hieronder zijn er letterlijk uit overgenomen; wijk er niet van af. Verschillen: de afzender komt als parameter binnen (geen hardcoded `IK`), de foto-cel valt weg zonder `fotoUrl`, alle velden van de afzender gaan door `esc()`, en er komt een platte-tekstversie bij.

**Files:**
- Create: `lib/leads/opvolgmail.ts`
- Test: `lib/leads/__tests__/opvolgmail.test.ts`

- [ ] **Step 1: Schrijf de test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bouwOpvolgmail, standaardInvoer, type OpvolgInvoer } from '../opvolgmail';
import type { Afzender } from '../types';

const AFZ: Afzender = {
  naam: 'Test Beller',
  voornaam: 'Test',
  functie: 'Oprichter',
  telefoon: '06 12345678',
  email: 'test@example.com',
  fotoUrl: 'https://www.chatmanta.nl/mail/foto.png',
};

const basis: OpvolgInvoer = {
  ...standaardInvoer(),
  naam: 'Jan',
  bedrijf: 'Bouwbedrijf Jansen',
  dagdeel: 'vanmiddag',
};

test('info (je): onderwerp, aanhef, haakje vet, twee knoppen, handtekening', () => {
  const m = bouwOpvolgmail({ ...basis, haakje: 'planning en beschikbaarheid' }, AFZ);
  assert.equal(m.onderwerp, 'Ons gesprek van vanmiddag');
  assert.match(m.html, /Hoi Jan,/);
  assert.match(m.html, /<strong>planning en beschikbaarheid<\/strong>/);
  assert.match(m.html, /knop-demo-hoofd\.png/);
  assert.match(m.html, /knop-kennismaking\.png/);
  assert.match(m.html, /Leuk dat ik je vanmiddag even kon spreken\./);
  assert.match(m.html, /Test Beller/);
  assert.match(m.html, /foto\.png/);
  assert.deepEqual(m.ontbreekt, []);
  assert.match(m.tekst, /Hoi Jan,/);
  assert.match(m.tekst, /Bekijk de demo: https:\/\/www\.chatmanta\.nl\/voorbeeld\?utm_source=opvolgmail/);
});

test('u-vorm', () => {
  const m = bouwOpvolgmail({ ...basis, vorm: 'u', naam: 'meneer Jansen' }, AFZ);
  assert.match(m.html, /Beste meneer Jansen,/);
  assert.match(m.html, /Fijn dat ik u vanmiddag even kon spreken\./);
  assert.match(m.html, /uw eigen website/);
});

test('alle situaties bouwen zonder fout en hebben het juiste onderwerp', () => {
  assert.equal(bouwOpvolgmail({ ...basis, situatie: 'test' }, AFZ).onderwerp, 'Ons gesprek van vanmiddag');
  assert.equal(bouwOpvolgmail({ ...basis, situatie: 'kennis' }, AFZ).onderwerp, 'Ons gesprek van vanmiddag');
  assert.equal(
    bouwOpvolgmail({ ...basis, situatie: 'klaar', link: 'https://x.example/bot' }, AFZ).onderwerp,
    'Jullie testversie van ChatManta staat klaar',
  );
  const her = bouwOpvolgmail({ ...basis, situatie: 'herinnering' }, AFZ);
  assert.equal(her.onderwerp, 'Re: Ons gesprek van vanmiddag');
  assert.doesNotMatch(her.html, /logo\.png/); // kaal: zonder logo
});

test('ontbreekt: naam, bedrijf en https-link bij klaar', () => {
  const m = bouwOpvolgmail({ ...basis, naam: '', bedrijf: '' }, AFZ);
  assert.deepEqual(m.ontbreekt.map((x) => x.veld), ['naam', 'bedrijf']);
  assert.match(m.html, /\[naam\]/);
  const k = bouwOpvolgmail({ ...basis, situatie: 'klaar', link: 'http://onveilig.example' }, AFZ);
  assert.deepEqual(k.ontbreekt.map((x) => x.veld), ['link']);
});

test('alle vrije tekst wordt ge-escaped', () => {
  const m = bouwOpvolgmail(
    {
      ...basis,
      naam: '<b>Jan</b>',
      bedrijf: 'A&B "Bouw"',
      haakje: '<script>x</script>',
      eigen: '<img src=x>',
      ps: '<i>ps</i>',
    },
    { ...AFZ, naam: '<x>', telefoon: '06"1' },
  );
  assert.doesNotMatch(m.html, /<b>Jan<\/b>|<script>|<img src=x>|<i>ps<\/i>|<x>/);
  assert.match(m.html, /&lt;b&gt;Jan&lt;\/b&gt;/);
  assert.match(m.html, /A&amp;B &quot;Bouw&quot;/);
});

test('zonder foto geen foto-cel', () => {
  const m = bouwOpvolgmail(basis, { ...AFZ, fotoUrl: null });
  assert.doesNotMatch(m.html, /foto\.png/);
});

test('P.S. krijgt geen dubbel "P.S."', () => {
  const m = bouwOpvolgmail({ ...basis, ps: 'P.S. mooie foto’s' }, AFZ);
  assert.match(m.html, /P\.S\. mooie foto’s/);
  assert.doesNotMatch(m.html, /P\.S\. P\.S\./);
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `node --import tsx --conditions=react-server --test lib/leads/__tests__/opvolgmail.test.ts`

- [ ] **Step 3: Schrijf `lib/leads/opvolgmail.ts`**

```ts
// Opvolgmail na een belletje: port van opvolgmail-maker.html (buiten de repo,
// bron van waarheid voor teksten en ontwerp B). Puur: geen DOM, geen fetch.
// Tabellen + inline styles + knoppen als PNG overleven plakken in Outlook.
// Niet emailLayout() gebruiken: dat is de navy app-mailstijl.

import type { Afzender, OpvolgSituatie } from './types';
import type { Dagdeel } from './werkdagen';

export type OpvolgInvoer = {
  situatie: OpvolgSituatie;
  vorm: 'je' | 'u';
  naam: string;
  bedrijf: string;
  dagdeel: Dagdeel;
  haakje: string;
  termijn: string;
  link: string;
  eigen: string;
  ps: string;
};

export function standaardInvoer(): OpvolgInvoer {
  return {
    situatie: 'info',
    vorm: 'je',
    naam: '',
    bedrijf: '',
    dagdeel: 'vanmiddag',
    haakje: '',
    termijn: 'binnen twee werkdagen',
    link: '',
    eigen: '',
    ps: '',
  };
}

export type Ontbrekend = { veld: 'naam' | 'bedrijf' | 'link'; label: string };
export type Opvolgmail = { onderwerp: string; html: string; tekst: string; ontbreekt: Ontbrekend[] };

const IMG = 'https://www.chatmanta.nl/mail/';
const UTM = 'utm_source=opvolgmail&utm_medium=email';
export const MAIL_URL = {
  demo: `https://www.chatmanta.nl/voorbeeld?${UTM}`,
  kennismaking: `https://www.chatmanta.nl/kennismaking?bron=opvolgmail&${UTM}`,
  site: `https://www.chatmanta.nl/?${UTM}`,
};

const F = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#0c1e2e';
const MUTED = '#4d6074';
const LINE = '#e2e8ef';
const TEAL = '#0f766e';

export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function p(html: string, extra = ''): string {
  return `<p style="margin:0 0 14px;${F};font-size:15px;line-height:1.6;color:${INK};${extra}">${html}</p>`;
}

/** Leeg verplicht veld: gemarkeerd in het voorbeeld; kopiëren is dan geblokkeerd. */
function veld(w: string, label: string): string {
  return w
    ? esc(w)
    : `<span style="background:#fef3c7;color:#92400e;padding:0 4px;border-radius:4px">[${label}]</span>`;
}

// Breedte in css-px (het beeld is 3x zo groot). Bron: scripts/mail-assets.mjs.
const KNOP: Record<string, [string, number]> = {
  'demo-hoofd': ['Bekijk de demo', 164],
  demo: ['Bekijk de demo', 149],
  'kennismaking-hoofd': ['Plan een kennismaking', 213],
  kennismaking: ['Plan een kennismaking', 199],
  'testbot-hoofd': ['Probeer de chatbot', 193],
};

function knop(href: string, naam: string): string {
  const [alt, w] = KNOP[naam];
  return `<a href="${esc(href)}" target="_blank" style="text-decoration:none"><img src="${IMG}knop-${naam}.png?v=1" width="${w}" height="46" alt="${esc(alt)}" style="display:block;width:${w}px;height:46px;border:0;${F};font-size:14px;font-weight:600;color:${TEAL}"></a>`;
}

function knoppen(lijst: [string, string][]): string {
  return (
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px"><tr>' +
    lijst
      .map(
        (k, i) =>
          `<td style="padding:0 ${i < lijst.length - 1 ? '4px' : '0'} 0 0;vertical-align:top">${knop(k[0], k[1])}</td>`,
      )
      .join('') +
    '</tr></table>'
  );
}

type Teksten = { onderwerp: string; tekst: string[]; knoppen: [string, string][]; kaal?: boolean };

function teksten(v: OpvolgInvoer): Teksten {
  const u = v.vorm === 'u';
  const J = (je: string, uu: string) => (u ? uu : je);
  const bedrijf = veld(v.bedrijf, 'bedrijfsnaam');
  const eigen = v.eigen ? p(esc(v.eigen)) : '';
  const opening = `${J('Leuk dat ik je ', 'Fijn dat ik u ')}${esc(v.dagdeel)} even kon spreken.`;
  const wat =
    (v.haakje
      ? `${J('Je vertelde dat jullie veel vragen krijgen over ', 'U vertelde dat u veel vragen krijgt over ')}<strong>${esc(v.haakje)}</strong>. Met ChatManta komt er een chatbot op ${J('jullie', 'uw')} website die zulke vragen meteen beantwoordt`
      : `Met ChatManta komt er een chatbot op ${J('jullie', 'uw')} website die vragen van klanten meteen beantwoordt`) +
    `, ook 's avonds en in het weekend. Dat scheelt ${J('jullie', 'u')} telefoontjes en mails.`;
  const vertrouwen = `Hij haalt zijn antwoorden uit ${J('jullie', 'uw')} eigen website. Weet hij iets niet, dan zegt hij dat eerlijk en verwijst hij de klant naar ${J('jullie', 'u')}.`;
  const vast = J('Je zit nergens aan vast.', 'U zit nergens aan vast.');

  switch (v.situatie) {
    case 'info':
      return {
        onderwerp: `Ons gesprek van ${v.dagdeel}`,
        tekst: [
          p(`${opening} Zoals beloofd stuur ik ${J('je', 'u')} wat meer informatie.`),
          eigen,
          p(wat),
          p(vertrouwen),
          p(`Het makkelijkste is om het zelf te zien. Ik zet graag een gratis testversie voor ${bedrijf} klaar, getraind op ${J('jullie', 'uw')} eigen website. ${vast}`),
          p(`Zal ik die voor ${J('je', 'u')} maken? Een kort "ja" als antwoord op deze mail is genoeg.`),
          p('Eerst zelf rondkijken kan ook:', `margin:0 0 10px;color:${MUTED}`),
        ],
        knoppen: [
          [MAIL_URL.demo, 'demo-hoofd'],
          [MAIL_URL.kennismaking, 'kennismaking'],
        ],
      };
    case 'test':
      return {
        onderwerp: `Ons gesprek van ${v.dagdeel}`,
        tekst: [
          p(`${opening} Zoals afgesproken zet ik een gratis testversie van ChatManta voor ${bedrijf} klaar.`),
          eigen,
          p(wat),
          p(vertrouwen),
          p(`Ik train hem op ${J('jullie', 'uw')} eigen website en stuur ${J('je', 'u')} de link ${esc(v.termijn || 'binnen twee werkdagen')}. Dan ${J('kun je', 'kunt u')} hem zelf uitproberen met de vragen die ${J('jullie vaak krijgen', 'u vaak krijgt')}. ${vast}`),
          p(`${J('Wil je', 'Wilt u')} alvast zien hoe het werkt?`, `margin:0 0 10px;color:${MUTED}`),
        ],
        knoppen: [[MAIL_URL.demo, 'demo-hoofd']],
      };
    case 'kennis':
      return {
        onderwerp: `Ons gesprek van ${v.dagdeel}`,
        tekst: [
          p(`${opening} ${J('Je gaf aan dat je', 'U gaf aan dat u')} eerst wat meer wilt weten, dus hierbij een korte uitleg.`),
          eigen,
          p(wat),
          p(vertrouwen),
          p(`Zullen we een keer kort bellen of afspreken? Dan kijken we samen naar ${J('jullie', 'uw')} website en laat ik zien hoe het voor ${bedrijf} zou werken.`),
          p(`Plan hieronder een moment, of stuur me gewoon een paar tijden die ${J('jou', 'u')} uitkomen.`, 'margin:0 0 10px'),
        ],
        knoppen: [
          [MAIL_URL.kennismaking, 'kennismaking-hoofd'],
          [MAIL_URL.demo, 'demo'],
        ],
      };
    case 'klaar':
      return {
        onderwerp: `${J('Jullie', 'Uw')} testversie van ChatManta staat klaar`,
        tekst: [
          p(`Zoals beloofd: de testversie van ChatManta voor ${bedrijf} staat klaar. Hij is getraind op ${J('jullie', 'uw')} eigen website.`),
          eigen,
          p(`Probeer hem gerust uit met vragen die klanten ${J('jullie', 'u')} vaak stellen${v.haakje ? `, bijvoorbeeld over <strong>${esc(v.haakje)}</strong>` : ''}. Zo ${J('zie je', 'ziet u')} meteen hoe hij antwoordt.`),
          p(`Klopt er iets niet of mist hij informatie? Laat het me weten, dan pas ik het aan. ${vast}`),
          p('Liever even samen doorlopen? Plan dan een kennismaking.', `margin:0 0 10px;color:${MUTED}`),
        ],
        knoppen: [
          [v.link || '#', 'testbot-hoofd'],
          [MAIL_URL.kennismaking, 'kennismaking'],
        ],
      };
    case 'herinnering':
      return {
        onderwerp: `Re: Ons gesprek van ${v.dagdeel}`,
        kaal: true,
        tekst: [
          p(`Ik stuurde ${J('je', 'u')} laatst een mail over een gratis testversie van ChatManta voor ${bedrijf}.`),
          eigen,
          p(`Zal ik die gewoon voor ${J('je', 'u')} klaarzetten? Een kort "ja" is genoeg. Past het nu niet, dan hoor ik dat ook graag.`),
        ],
        knoppen: [],
      };
  }
}

function ontbreekt(v: OpvolgInvoer): Ontbrekend[] {
  const m: Ontbrekend[] = [];
  if (!v.naam.trim()) m.push({ veld: 'naam', label: 'naam' });
  if (!v.bedrijf.trim()) m.push({ veld: 'bedrijf', label: 'bedrijfsnaam' });
  if (v.situatie === 'klaar' && !/^https:\/\/\S+$/.test(v.link.trim()))
    m.push({ veld: 'link', label: 'link naar de testversie (https://…)' });
  return m;
}

/** Platte tekst voor text/plain op het klembord. Werkt op onze eigen, voorspelbare HTML. */
function naarTekst(html: string): string {
  return html
    .replace(/<a href="([^"]*)"[^>]*><img [^>]*alt="([^"]*)"[^>]*><\/a>/g, (_m, href, alt) => `${alt}: ${href}\n`)
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/p>/g, '\n\n')
    .replace(/<\/div>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function bouwOpvolgmail(invoer: OpvolgInvoer, afz: Afzender): Opvolgmail {
  const v: OpvolgInvoer = {
    ...invoer,
    naam: invoer.naam.trim(),
    bedrijf: invoer.bedrijf.trim(),
    haakje: invoer.haakje.trim(),
    eigen: invoer.eigen.trim(),
    ps: invoer.ps.trim(),
    link: invoer.link.trim(),
    termijn: invoer.termijn.trim(),
  };
  const s = teksten(v);
  const aanhef = `${v.vorm === 'u' ? 'Beste ' : 'Hoi '}${veld(v.naam, 'naam')},`;
  const kop =
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px"><tr>' +
    `<td style="padding-bottom:14px"><a href="${MAIL_URL.site}" target="_blank"><img src="${IMG}logo.png?v=2" width="142" height="24" alt="ChatManta" style="display:block;width:142px;height:24px;border:0"></a></td></tr>` +
    '<tr><td height="3" bgcolor="#2dd4bf" style="height:3px;line-height:3px;font-size:0;background:#2dd4bf">&nbsp;</td></tr></table>';
  const telDigits = afz.telefoon.replace(/[^\d+]/g, '');
  const foto = afz.fotoUrl
    ? `<td width="70" style="width:70px;padding-top:16px;vertical-align:middle"><img src="${esc(afz.fotoUrl)}" width="56" height="56" alt="${esc(afz.naam)}" style="display:block;width:56px;height:56px;border:0"></td>`
    : '';
  const handtekening =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;border-top:1px solid ${LINE}"><tr>` +
    foto +
    `<td style="padding-top:16px;vertical-align:middle;${F};font-size:14px;line-height:1.5;color:${MUTED}">` +
    `<div style="font-size:15px;font-weight:700;color:${INK}">${esc(afz.naam)}</div>` +
    `<div>${esc(afz.functie)}, ChatManta &nbsp;·&nbsp; <a href="${MAIL_URL.site}" target="_blank" style="color:${TEAL};text-decoration:none">chatmanta.nl</a></div>` +
    `<div><a href="tel:${esc(telDigits)}" style="color:${MUTED};text-decoration:none">${esc(afz.telefoon)}</a>` +
    ` &nbsp;·&nbsp; <a href="mailto:${esc(afz.email)}" style="color:${TEAL};text-decoration:none">${esc(afz.email)}</a></div></td>` +
    '</tr></table>';
  const ps = v.ps ? p(`P.S. ${esc(v.ps.replace(/^p\.?\s*s\.?:?\s*/i, ''))}`, 'margin:16px 0 0') : '';
  const html =
    `<div style="${F};color:${INK};max-width:560px">` +
    (s.kaal ? '' : kop) +
    p(aanhef) +
    s.tekst.join('') +
    (s.knoppen.length ? knoppen(s.knoppen) : '') +
    p(`Groet,<br>${esc(afz.voornaam)}`, 'margin:22px 0 0') +
    ps +
    handtekening +
    '</div>';
  return { onderwerp: s.onderwerp, html, tekst: naarTekst(html), ontbreekt: ontbreekt(v) };
}
```

- [ ] **Step 4: Run, verwacht PASS**

- [ ] **Step 5: Vergelijk met de maker**

Open `C:\Users\solys\Documents\ChatManta-opvolgmails\opvolgmail-maker.html` in de browser, vul Jan / Bouwbedrijf Jansen / vanmiddag / haakje "planning" in voor situatie info. Draai daarna:

```bash
node --import tsx -e "import('./lib/leads/opvolgmail.ts').then(m=>{const r=m.bouwOpvolgmail({...m.standaardInvoer(),naam:'Jan',bedrijf:'Bouwbedrijf Jansen',haakje:'planning'},{naam:'Sebastiaan Olyslag',voornaam:'Sebastiaan',functie:'Oprichter',telefoon:'06 00000000',email:'sebastiaan@chatmanta.com',fotoUrl:'https://www.chatmanta.nl/mail/foto.png'});require('fs').writeFileSync(process.env.TEMP+'/opvolg-port.html',r.html)})"
```

Open `%TEMP%\opvolg-port.html` naast de maker. Expected: zelfde tekst, knoppen, logo en handtekening (alleen het telefoonnummer verschilt).

- [ ] **Step 6: Commit** — `feat(leads): opvolgmail-bouwer (port van de maker)`

---

### Task 6: Agenda-afspraak (.ics)

**Files:**
- Create: `lib/leads/ics.ts`
- Test: `lib/leads/__tests__/ics.test.ts`

- [ ] **Step 1: Schrijf de test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maakIcs } from '../ics';

test('maakIcs: geldige VEVENT met UTC-tijden, escaping en CRLF', () => {
  const ics = maakIcs({
    uid: 'lead-123',
    start: new Date('2026-10-20T08:00:00Z'),
    duurMinuten: 30,
    titel: 'Kennismaking Bouwbedrijf Jansen',
    beschrijving: 'Tel: 06 12345678\nNotitie: wil demo; vraag naar Jan, na 14:00',
    nu: new Date('2026-10-16T08:30:00Z'),
  });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261020T080000Z\r\n/);
  assert.match(ics, /DTEND:20261020T083000Z\r\n/);
  assert.match(ics, /DTSTAMP:20261016T083000Z\r\n/);
  assert.match(ics, /UID:lead-123@chatmanta\.nl\r\n/);
  assert.match(ics, /DESCRIPTION:Tel: 06 12345678\\nNotitie: wil demo\\; vraag naar Jan\\, na 14:00\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
```

- [ ] **Step 2: Run, verwacht FAIL**

- [ ] **Step 3: Schrijf `lib/leads/ics.ts`**

```ts
// Minimale iCalendar-afspraak (RFC 5545) voor "Zet in agenda". Geen library.

function stempel(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

export function maakIcs(o: {
  uid: string;
  start: Date;
  duurMinuten: number;
  titel: string;
  beschrijving: string;
  nu?: Date;
}): string {
  const eind = new Date(o.start.getTime() + o.duurMinuten * 60_000);
  const regels = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChatManta//Leads//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${o.uid}@chatmanta.nl`,
    `DTSTAMP:${stempel(o.nu ?? new Date())}`,
    `DTSTART:${stempel(o.start)}`,
    `DTEND:${stempel(eind)}`,
    `SUMMARY:${escIcs(o.titel)}`,
    `DESCRIPTION:${escIcs(o.beschrijving)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return regels.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Run, verwacht PASS**

- [ ] **Step 5: Commit** — `feat(leads): agenda-afspraak (.ics) voor kennismakingen`

---

### Task 7: Migratie 0032 (tabellen, RLS, claim en opschonen)

**Files:**
- Create: `supabase/migrations-v1/0032_v1_leads.sql`

- [ ] **Step 1: Schrijf de migratie**

```sql
-- =============================================================================
-- Migration 0032 (V1) — leads-dashboard (/v1/leads): leads, lead_activiteiten,
-- lead_afzenders.
--
-- GESANCTIONEERDE UITZONDERING op hard rule 2 (organization_id NOT NULL): leads
-- zijn geen klantdata maar ChatManta's eigen verkoopdata (koude acquisitie).
-- Akkoord Sebastiaan 2026-10-16, zelfde categorie als audit_logs.
--
-- RLS AAN, GEEN policies (patroon 0017/0019): geen tenant-leespad. Alleen
-- bereikbaar via de service-role in server actions ná requireJorionAdmin().
-- Ontwerp: docs/superpowers/specs/2026-10-17-leads-dashboard-design.md
-- =============================================================================

create table if not exists public.leads (
  id                      uuid primary key default gen_random_uuid(),
  domein                  text,
  telefoon                text,
  bedrijfsnaam            text not null,
  website_url             text,
  niche                   text,
  plaats                  text,
  provincie               text,
  telefoons_extra         text[] not null default '{}',
  email                   text,
  emails_gevonden         text[] not null default '{}',
  contactpersoon          text,
  aanspreekvorm           text not null default 'je' check (aanspreekvorm in ('je','u')),
  haakje                  text,
  notitie                 text,
  google_rating           numeric,
  google_reviews          integer,
  heeft_chatbot           boolean,
  chatbot_naam            text,
  platform                text,
  woorden                 integer,
  score                   integer,
  score_max               integer,
  score_redenen           jsonb not null default '[]'::jsonb,
  score_voorlopig         boolean not null default true,
  labels                  text[] not null default '{}',
  status                  text not null default 'open' check (status in (
    'open','terugbellen','opvolgen','kans','klant','geen_interesse','niet_bellen','heeft_chatbot','archief'
  )),
  status_reden            text,
  volgende_actie_op       timestamptz,
  volgende_actie_notitie  text,
  pogingen_niet_opgenomen integer not null default 0,
  laatste_poging_op       timestamptz,
  kennismaking_op         timestamptz,
  opvolgmail_gestuurd_op  timestamptz,
  opvolgmail_situatie     text check (opvolgmail_situatie in ('info','test','kennis','klaar','herinnering')),
  geclaimd_door           uuid references public.users(id) on delete set null,
  geclaimd_tot            timestamptz,
  bron                    text not null,
  bron_data               jsonb not null default '{}'::jsonb,
  aangemaakt_door         uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint leads_sleutel_aanwezig check (domein is not null or telefoon is not null)
);

create unique index if not exists leads_domein_uniek on public.leads (domein) where domein is not null;
create unique index if not exists leads_telefoon_uniek on public.leads (telefoon) where telefoon is not null;
create index if not exists leads_wachtrij_idx on public.leads (status, volgende_actie_op);
create index if not exists leads_niche_plaats_idx on public.leads (niche, plaats);

alter table public.leads enable row level security;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch
  before update on public.leads
  for each row execute function public.v1_touch_updated_at();

create table if not exists public.lead_activiteiten (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  user_id      uuid references public.users(id) on delete set null,
  soort        text not null check (soort in ('belpoging','mail','notitie','status','kennismaking','import')),
  uitkomst     text check (uitkomst in ('niet_opgenomen','terugbellen','wil_mail','interesse','geen_interesse','niet_bellen')),
  details      jsonb not null default '{}'::jsonb,
  -- Stand-kolommen van de lead vóór deze actie (ongedaan maken).
  vorige_staat jsonb,
  ongedaan_op  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists lead_activiteiten_lead_idx on public.lead_activiteiten (lead_id, created_at desc);
create index if not exists lead_activiteiten_tijd_idx on public.lead_activiteiten (created_at);

alter table public.lead_activiteiten enable row level security;

create table if not exists public.lead_afzenders (
  user_id    uuid primary key references public.users(id) on delete cascade,
  naam       text not null,
  voornaam   text not null,
  functie    text not null default 'Oprichter',
  telefoon   text not null,
  email      text not null,
  foto_url   text,
  updated_at timestamptz not null default now()
);

alter table public.lead_afzenders enable row level security;

drop trigger if exists lead_afzenders_touch on public.lead_afzenders;
create trigger lead_afzenders_touch
  before update on public.lead_afzenders
  for each row execute function public.v1_touch_updated_at();

-- ----------------------------------------------------------------------------
-- leads_claim_volgende(): pakt ATOMAIR de volgende lead voor de belmodus en
-- zet hem op naam van p_user (FOR UPDATE SKIP LOCKED: twee bellers krijgen nooit
-- dezelfde). Eerst een eigen lopende claim (pagina herladen), dan terugbellen
-- die aan de beurt zijn, dan open leads op score.
-- ----------------------------------------------------------------------------
create or replace function public.leads_claim_volgende(
  p_user    uuid,
  p_niche   text default null,
  p_plaats  text default null,
  p_minuten integer default 10
) returns setof public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select l.id into v_id
  from public.leads l
  where l.geclaimd_door = p_user
    and l.geclaimd_tot > now()
    and l.status in ('open','terugbellen')
    and (p_niche is null or l.niche = p_niche)
    and (p_plaats is null or l.plaats = p_plaats)
  limit 1;

  if v_id is null then
    select l.id into v_id
    from public.leads l
    where l.status in ('open','terugbellen')
      and (l.volgende_actie_op is null or l.volgende_actie_op <= now())
      and (l.geclaimd_tot is null or l.geclaimd_tot < now() or l.geclaimd_door = p_user)
      and (p_niche is null or l.niche = p_niche)
      and (p_plaats is null or l.plaats = p_plaats)
    order by
      (l.status = 'terugbellen') desc,
      case when l.status = 'terugbellen' then l.volgende_actie_op end asc nulls last,
      l.score desc nulls last,
      l.google_reviews desc nulls last,
      l.created_at asc
    limit 1
    for update skip locked;
  end if;

  if v_id is null then
    return;
  end if;

  return query
    update public.leads
    set geclaimd_door = p_user,
        geclaimd_tot = now() + make_interval(mins => p_minuten)
    where id = v_id
    returning *;
end;
$$;

revoke execute on function public.leads_claim_volgende(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.leads_claim_volgende(uuid, text, text, integer) to service_role;

-- ----------------------------------------------------------------------------
-- leads_opschonen(): AVG-bewaartermijn (12 maanden). Idempotent en goedkoop;
-- aangeroepen vanuit de app (hooguit 1x per dag per server-instance).
-- ----------------------------------------------------------------------------
create or replace function public.leads_opschonen() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_weg integer;
  v_kaal integer;
begin
  delete from public.leads
  where status in ('geen_interesse','archief')
    and updated_at < now() - interval '12 months';
  get diagnostics v_weg = row_count;

  update public.leads
  set bedrijfsnaam = '(verwijderd)',
      website_url = null, niche = null, plaats = null, provincie = null,
      telefoons_extra = '{}', email = null, emails_gevonden = '{}', contactpersoon = null,
      haakje = null, notitie = null, bron_data = '{}'::jsonb, score_redenen = '[]'::jsonb
  where status = 'niet_bellen'
    and updated_at < now() - interval '12 months'
    and bedrijfsnaam <> '(verwijderd)';
  get diagnostics v_kaal = row_count;

  delete from public.lead_activiteiten a
  using public.leads l
  where a.lead_id = l.id and l.bedrijfsnaam = '(verwijderd)';

  return v_weg + v_kaal;
end;
$$;

revoke execute on function public.leads_opschonen() from public, anon, authenticated;
grant execute on function public.leads_opschonen() to service_role;
```

- [ ] **Step 2: Lees de migratie-landmijnen**

Lees `docs/AGENT_LANDMIJNEN.md` sectie "Supabase & migraties" en controleer: geen CRLF-probleem (het bestand mag LF of CRLF zijn, zie memory over de 0026/0027-drift), `v1_touch_updated_at` bestaat (migr 0013).

- [ ] **Step 3: Commit** — `feat(leads): migratie 0032 leads-tabellen (admin-only)`

---

### Task 8: Migratie draaien en RLS controleren

**Files:**
- Create: `scripts/leads-test-rls.ts`
- Modify: `package.json` (script `leads:test-rls`)

- [ ] **Step 1: Vraag akkoord in de chat**

Bericht aan Sebastiaan: "Migratie 0032 staat klaar (drie admin-only tabellen, RLS aan zonder policies, twee functies). Mag ik `npm run migrate:v1` op V1-productie draaien?" Wacht op "ja".

- [ ] **Step 2: Draai de migratie**

Run: `npm run migrate:v1:status && npm run migrate:v1`
Expected: `0032_v1_leads.sql` toegepast, geen errors. Bij een pooler-timeout: zie memory "npm run migrate bereikt prod soms niet" (status opnieuw checken, niet blind herhalen).

- [ ] **Step 3: Schrijf `scripts/leads-test-rls.ts`**

```ts
// Check: anon en een ingelogde niet-admin kunnen NIETS op de leads-tabellen.
// Draait tegen V1-prod met de seed-accounts. Schrijft niets (pogingen falen).
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_V1_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_V1_SUPABASE_ANON_KEY!;
const TABELLEN = ['leads', 'lead_activiteiten', 'lead_afzenders'] as const;

async function check(label: string, client: ReturnType<typeof createClient>) {
  let fouten = 0;
  for (const t of TABELLEN) {
    const r = await client.from(t).select('*').limit(1);
    if (r.data && r.data.length > 0) {
      console.error(`FOUT ${label}: kan ${t} lezen`);
      fouten++;
    }
    const w = await client.from(t).insert({ bedrijfsnaam: 'rls-test', bron: 'test', domein: 'rls-test.invalid' } as never);
    if (!w.error) {
      console.error(`FOUT ${label}: kan in ${t} schrijven`);
      fouten++;
    }
  }
  const rpc = await client.rpc('leads_claim_volgende', { p_user: '00000000-0000-0000-0000-000000000000' });
  if (!rpc.error) {
    console.error(`FOUT ${label}: kan leads_claim_volgende aanroepen`);
    fouten++;
  }
  console.log(`${label}: ${fouten === 0 ? 'ok' : `${fouten} fout(en)`}`);
  return fouten;
}

async function main() {
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  let fouten = await check('anon', anon);
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await user.auth.signInWithPassword({
    email: 'outsider@example.com',
    password: process.env.V1_SEED_OUTSIDER_PW!,
  });
  if (error) throw new Error(`login outsider faalde: ${error.message}`);
  fouten += await check('authenticated (niet-admin)', user);
  // Ook een admin-sessie mag via de gewone client niets: toegang loopt alleen via service-role.
  const admin = createClient(url, anonKey, { auth: { persistSession: false } });
  const a = await admin.auth.signInWithPassword({ email: 'member@example.com', password: process.env.V1_SEED_MEMBER_PW! });
  if (a.error) throw new Error(`login member faalde: ${a.error.message}`);
  fouten += await check('authenticated (admin, zonder service-role)', admin);
  process.exit(fouten ? 1 : 0);
}

main();
```

Voeg toe in `package.json` bij de scripts:

```json
"leads:test-rls": "node --env-file=.env.local --import tsx scripts/leads-test-rls.ts",
```

- [ ] **Step 4: Draai de check**

Run: `npm run leads:test-rls`
Expected: drie regels eindigend op `ok`, exit 0.

- [ ] **Step 5: Commit** — `test(leads): RLS-check voor de leads-tabellen`

---

### Task 9: Import-opschoning (pure functies)

**Files:**
- Create: `lib/leads/import-opschonen.ts`
- Test: `lib/leads/__tests__/import-opschonen.test.ts`

Niels' `leads.json` is een array met per lead o.a.: `url, bedrijfsnaam, niche, woorden, emails[], telefoons[], heeft_chatbot, chatbot_naam, platform, fout, sitemap_paginas, google_score, google_reviews, plaats, provincie, score, max_score, knockout, redenen[]`. De CSV's `gevonden_*.csv` hebben de kop `url,niche,bedrijfsnaam,telefoon,google_score,google_reviews,plaats,provincie` (komma-gescheiden; `telefoon` = het Google-nummer). `status.json` is een object per domein met `mail_verstuurd, gebeld, reactie_ontvangen` (jjjj-mm-dd of null), `uitkomst` (`geen|interesse|demo gepland|klant|geen interesse`), `notitie, niet_benaderen, kanaal, rechtsvorm, opvolging_gemaakt, heeft_chatbot`. Rechtsvorm en kanaal negeren we.

- [ ] **Step 1: Schrijf de test**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verwerkImport, leesCsv, type NielsLead } from '../import-opschonen';

const L = (x: Partial<NielsLead>): NielsLead => ({
  url: 'https://jansen-bouw.nl/',
  bedrijfsnaam: 'Bouwbedrijf Jansen',
  niche: 'installateur',
  woorden: 1200,
  emails: ['info@jansen-bouw.nl'],
  telefoons: ['06 12345678'],
  heeft_chatbot: false,
  chatbot_naam: null,
  platform: 'wordpress',
  fout: null,
  google_score: 4.5,
  google_reviews: 10,
  plaats: 'Ede',
  provincie: 'Gelderland',
  score: 9,
  max_score: 14,
  knockout: null,
  redenen: ['Contentomvang 1/2'],
  ...x,
});

test('normaliseert URL, telefoon en e-mail; neemt score voorlopig over', () => {
  const r = verwerkImport([L({ url: 'http://www.jansen-bouw.nl/?utm_source=g' })]);
  assert.equal(r.leads.length, 1);
  const l = r.leads[0];
  assert.equal(l.domein, 'jansen-bouw.nl');
  assert.equal(l.website_url, 'http://www.jansen-bouw.nl/');
  assert.equal(l.telefoon, '+31612345678');
  assert.equal(l.email, 'info@jansen-bouw.nl');
  assert.equal(l.score, 9);
  assert.equal(l.score_voorlopig, true);
  assert.equal(l.status, 'open');
  assert.equal(l.bron, 'import_niels');
});

test('Google-nummer uit de CSV wordt hoofdnummer, max 3 extra', () => {
  const csv = new Map([['jansen-bouw.nl', '026 123 4567']]);
  const r = verwerkImport([L({ telefoons: ['06 12345678', '06 22222222', '06 33333333', '06 44444444', '06 55555555'] })], { googleTelefoon: csv });
  assert.equal(r.leads[0].telefoon, '+31261234567');
  assert.deepEqual(r.leads[0].telefoons_extra, ['+31612345678', '+31622222222', '+31633333333']);
});

test('adresgidsen eruit, kapotte e-mails eruit, knock-outs blijven met label', () => {
  const r = verwerkImport([
    L({ url: 'https://nlmappoint.org/x', telefoons: ['06 11111111'] }),
    L({ url: 'https://a.nl', emails: ['0612345678', ''], telefoons: ['06 22222222'], knockout: 'geen e-mailadres gevonden' }),
    L({ url: 'https://b.nl', telefoons: ['06 33333333'], fout: 'timeout', knockout: 'niet gescand: website niet bereikbaar' }),
    L({ url: 'https://c.nl', telefoons: ['06 44444444'], woorden: 120, knockout: 'te weinig content (120 woorden)' }),
  ]);
  assert.equal(r.rapport.adresgids, 1);
  assert.deepEqual(r.leads.map((l) => l.domein), ['a.nl', 'b.nl', 'c.nl']);
  assert.equal(r.leads[0].email, null);
  assert.deepEqual(r.leads[1].labels, ['site_onbereikbaar']);
  assert.deepEqual(r.leads[2].labels, ['weinig_tekst']);
});

test('chatbot → eigen status; vestiging → keten; generieke naam → label', () => {
  const r = verwerkImport([
    L({ url: 'https://a.nl', telefoons: ['06 11111111'], heeft_chatbot: true, chatbot_naam: 'Trengo' }),
    L({ url: 'https://keten.nl/vestiging/ede', telefoons: ['06 22222222'] }),
    L({ url: 'https://c.nl', telefoons: ['06 33333333'], bedrijfsnaam: 'Dakdekker Ede', niche: 'dakdekker' }),
  ]);
  assert.equal(r.leads[0].status, 'heeft_chatbot');
  assert.equal(r.leads[0].chatbot_naam, 'Trengo');
  assert.deepEqual(r.leads[1].labels, ['keten']);
  assert.deepEqual(r.leads[2].labels, ['generieke_naam']);
});

test('dubbel domein en dubbel telefoonnummer worden één lead (meeste reviews wint)', () => {
  const r = verwerkImport([
    L({ url: 'https://a.nl', telefoons: ['06 11111111'], google_reviews: 3 }),
    L({ url: 'https://www.a.nl/contact', telefoons: ['06 99999999'] }),
    L({ url: 'https://b.nl', telefoons: ['06 11111111'], google_reviews: 30 }),
  ]);
  assert.equal(r.leads.length, 1);
  assert.equal(r.leads[0].domein, 'b.nl');
  assert.deepEqual(r.leads[0].bron_data.andere_domeinen, ['a.nl']);
  assert.equal(r.rapport.dubbelDomein, 1);
  assert.equal(r.rapport.samengevoegdTelefoon, 1);
});

test('zonder telefoon én domein wordt overgeslagen', () => {
  const r = verwerkImport([L({ url: '', telefoons: [] })]);
  assert.equal(r.leads.length, 0);
  assert.equal(r.rapport.zonderSleutel, 1);
});

test('status.json: uitkomsten en activiteiten', () => {
  const r = verwerkImport(
    [
      L({ url: 'https://a.nl', telefoons: ['06 11111111'] }),
      L({ url: 'https://b.nl', telefoons: ['06 22222222'] }),
      L({ url: 'https://c.nl', telefoons: ['06 33333333'] }),
    ],
    {
      status: {
        'a.nl': { gebeld: '2026-10-16', uitkomst: 'geen interesse', notitie: 'te duur' },
        'b.nl': { mail_verstuurd: '2026-10-15', uitkomst: 'demo gepland' },
        'c.nl': { niet_benaderen: true },
      },
    },
  );
  const [a, b, c] = r.leads;
  assert.equal(a.status, 'geen_interesse');
  assert.equal(a.notitie, 'te duur');
  assert.equal(b.status, 'kans');
  assert.equal(c.status, 'niet_bellen');
  const actA = r.activiteiten.get('a.nl')!;
  assert.deepEqual(actA.map((x) => x.soort), ['import']);
  assert.equal(actA[0].details.gebeld, '2026-10-16');
  assert.equal(r.activiteiten.get('b.nl')![0].details.mail_verstuurd, '2026-10-15');
});

test('leesCsv: kop + komma-gescheiden + aanhalingstekens', () => {
  const rijen = leesCsv('url,niche,bedrijfsnaam,telefoon\nhttps://a.nl,hovenier,"Groen, en Zo",06 11111111\n');
  assert.deepEqual(rijen, [{ url: 'https://a.nl', niche: 'hovenier', bedrijfsnaam: 'Groen, en Zo', telefoon: '06 11111111' }]);
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `node --import tsx --conditions=react-server --test lib/leads/__tests__/import-opschonen.test.ts`

- [ ] **Step 3: Schrijf `lib/leads/import-opschonen.ts`**

```ts
// Import van Niels' ChatbotScanner-data → schone leads. Puur (geen fs, geen DB);
// het script scripts/leads-import.ts leest de bestanden en schrijft.
// Bewust: knock-outs "geen e-mail", "onbereikbaar" en "te weinig content" blijven
// staan (om te bellen is een telefoonnummer genoeg); ze krijgen hooguit een label.

import type { LeadStatus } from './types';
import { isGeldigEmail, normaliseerDomein, normaliseerTelefoon, schoneWebsiteUrl } from './normaliseren';

export type NielsLead = {
  url: string;
  bedrijfsnaam: string;
  niche: string | null;
  woorden: number | null;
  emails: string[];
  telefoons: string[];
  heeft_chatbot: boolean;
  chatbot_naam: string | null;
  platform: string | null;
  fout: string | null;
  google_score: number | null;
  google_reviews: number | null;
  plaats: string | null;
  provincie: string | null;
  score: number | null;
  max_score: number | null;
  knockout: string | null;
  redenen: string[];
};

export type NielsStatus = {
  mail_verstuurd?: string | null;
  gebeld?: string | null;
  reactie_ontvangen?: string | null;
  uitkomst?: string | null;
  notitie?: string | null;
  niet_benaderen?: boolean | null;
  heeft_chatbot?: boolean | null;
};

export type ImportLead = {
  domein: string | null;
  telefoon: string | null;
  bedrijfsnaam: string;
  website_url: string | null;
  niche: string | null;
  plaats: string | null;
  provincie: string | null;
  telefoons_extra: string[];
  email: string | null;
  emails_gevonden: string[];
  notitie: string | null;
  google_rating: number | null;
  google_reviews: number | null;
  heeft_chatbot: boolean | null;
  chatbot_naam: string | null;
  platform: string | null;
  woorden: number | null;
  score: number | null;
  score_max: number | null;
  score_redenen: string[];
  score_voorlopig: true;
  labels: string[];
  status: LeadStatus;
  status_reden: string | null;
  bron: 'import_niels';
  bron_data: { url: string; knockout: string | null; andere_domeinen?: string[] };
};

export type ImportActiviteit = { soort: 'import'; details: Record<string, unknown> };

export type ImportRapport = {
  gelezen: number;
  leads: number;
  adresgids: number;
  zonderSleutel: number;
  dubbelDomein: number;
  samengevoegdTelefoon: number;
  emailsAfgekeurd: number;
  metChatbot: number;
  labels: Record<string, number>;
  statusOvergenomen: number;
};

export const ADRESGIDSEN = new Set([
  'nlmappoint.org',
  'nlpathmap.org',
  'openingstijden.nl',
  'telefoonboek.nl',
  'detelefoongids.nl',
  'goudengids.nl',
  'werkspot.nl',
  'trustoo.nl',
  'homedeal.nl',
  'bouwbedrijven.nl',
]);

const NICHE_WOORDEN = ['dakdekker', 'hovenier', 'installateur', 'installatiebedrijf', 'schoonmaak', 'schoonmaakbedrijf', 'loodgieter', 'aannemer', 'tuinman'];

function isGeneriekeNaam(naam: string, plaats: string | null): boolean {
  const w = naam.toLowerCase().trim();
  const woorden = w.split(/\s+/);
  if (woorden.length > 4) return false;
  const heeftNiche = NICHE_WOORDEN.some((n) => w.includes(n));
  const heeftPlaats = plaats ? w.includes(plaats.toLowerCase()) : false;
  return heeftNiche && heeftPlaats;
}

function kiesEmail(geldig: string[], domein: string | null): string | null {
  if (!geldig.length) return null;
  const eigen = domein ? geldig.find((e) => e.toLowerCase().endsWith(`@${domein}`)) : undefined;
  return eigen ?? geldig[0];
}

function labelsVoor(n: NielsLead, url: string | null): string[] {
  const labels: string[] = [];
  if (url && /\/vestiging(en)?\//i.test(url)) labels.push('keten');
  if (isGeneriekeNaam(n.bedrijfsnaam, n.plaats)) labels.push('generieke_naam');
  const ko = (n.knockout ?? '').toLowerCase();
  if (n.fout || ko.includes('niet bereikbaar') || ko.includes('niet gescand')) labels.push('site_onbereikbaar');
  if (ko.includes('te weinig content')) labels.push('weinig_tekst');
  return labels;
}

function mapStatus(s: NielsStatus | undefined): { status?: LeadStatus; activiteit?: ImportActiviteit; notitie?: string } {
  if (!s) return {};
  const uitkomst = (s.uitkomst ?? 'geen').toLowerCase().replace(/[_-]/g, ' ').trim();
  let status: LeadStatus | undefined;
  if (s.niet_benaderen) status = 'niet_bellen';
  else if (s.heeft_chatbot) status = 'heeft_chatbot';
  else if (uitkomst === 'geen interesse') status = 'geen_interesse';
  else if (uitkomst === 'interesse' || uitkomst === 'demo gepland') status = 'kans';
  else if (uitkomst === 'klant') status = 'klant';
  else if (s.mail_verstuurd) status = 'opvolgen';
  const details: Record<string, unknown> = {};
  if (s.gebeld) details.gebeld = s.gebeld;
  if (s.mail_verstuurd) details.mail_verstuurd = s.mail_verstuurd;
  if (s.reactie_ontvangen) details.reactie_ontvangen = s.reactie_ontvangen;
  if (uitkomst !== 'geen') details.uitkomst = s.uitkomst;
  const activiteit = Object.keys(details).length ? { soort: 'import' as const, details } : undefined;
  return { status, activiteit, notitie: s.notitie?.trim() || undefined };
}

export function verwerkImport(
  ruw: NielsLead[],
  opties: { googleTelefoon?: Map<string, string>; status?: Record<string, NielsStatus> } = {},
): { leads: ImportLead[]; activiteiten: Map<string, ImportActiviteit[]>; rapport: ImportRapport } {
  const rapport: ImportRapport = {
    gelezen: ruw.length,
    leads: 0,
    adresgids: 0,
    zonderSleutel: 0,
    dubbelDomein: 0,
    samengevoegdTelefoon: 0,
    emailsAfgekeurd: 0,
    metChatbot: 0,
    labels: {},
    statusOvergenomen: 0,
  };

  // 1. per lead schoonmaken; dubbel domein: eerste wint
  const opDomein = new Map<string, ImportLead>();
  const zonderDomein: ImportLead[] = [];
  for (const n of ruw) {
    const domein = normaliseerDomein(n.url);
    if (domein && ADRESGIDSEN.has(domein)) {
      rapport.adresgids++;
      continue;
    }
    if (domein && opDomein.has(domein)) {
      rapport.dubbelDomein++;
      continue;
    }
    const telefoons = [
      ...(domein && opties.googleTelefoon?.get(domein) ? [opties.googleTelefoon.get(domein)!] : []),
      ...(n.telefoons ?? []),
    ]
      .map((t) => normaliseerTelefoon(t))
      .filter((t): t is string => t !== null)
      .filter((t, i, a) => a.indexOf(t) === i);
    const telefoon = telefoons[0] ?? null;
    if (!domein && !telefoon) {
      rapport.zonderSleutel++;
      continue;
    }
    const emails = (n.emails ?? []).map((e) => e.trim());
    const geldig = emails.filter((e) => isGeldigEmail(e)).filter((e, i, a) => a.indexOf(e) === i);
    rapport.emailsAfgekeurd += emails.length - geldig.length;
    const website = schoneWebsiteUrl(n.url);
    const lead: ImportLead = {
      domein,
      telefoon,
      bedrijfsnaam: n.bedrijfsnaam?.trim() || domein || 'Onbekend',
      website_url: website,
      niche: n.niche || null,
      plaats: n.plaats || null,
      provincie: n.provincie || null,
      telefoons_extra: telefoons.slice(1, 4),
      email: kiesEmail(geldig, domein),
      emails_gevonden: geldig,
      notitie: null,
      google_rating: n.google_score ?? null,
      google_reviews: n.google_reviews ?? null,
      heeft_chatbot: n.heeft_chatbot ?? null,
      chatbot_naam: n.chatbot_naam ?? null,
      platform: n.platform ?? null,
      woorden: n.woorden ?? null,
      score: n.score ?? null,
      score_max: n.max_score ?? null,
      score_redenen: n.redenen ?? [],
      score_voorlopig: true,
      labels: labelsVoor(n, n.url),
      status: n.heeft_chatbot ? 'heeft_chatbot' : 'open',
      status_reden: null,
      bron: 'import_niels',
      bron_data: { url: n.url, knockout: n.knockout ?? null },
    };
    if (domein) opDomein.set(domein, lead);
    else zonderDomein.push(lead);
  }

  // 2. zelfde telefoonnummer op meerdere domeinen → één lead (meeste reviews)
  const opTelefoon = new Map<string, ImportLead>();
  const resultaat: ImportLead[] = [];
  for (const lead of [...opDomein.values(), ...zonderDomein]) {
    if (!lead.telefoon) {
      resultaat.push(lead);
      continue;
    }
    const bestaand = opTelefoon.get(lead.telefoon);
    if (!bestaand) {
      opTelefoon.set(lead.telefoon, lead);
      continue;
    }
    rapport.samengevoegdTelefoon++;
    const [winnaar, verliezer] =
      (lead.google_reviews ?? 0) > (bestaand.google_reviews ?? 0) ? [lead, bestaand] : [bestaand, lead];
    winnaar.bron_data.andere_domeinen = [
      ...(winnaar.bron_data.andere_domeinen ?? []),
      ...(verliezer.domein ? [verliezer.domein] : []),
      ...(verliezer.bron_data.andere_domeinen ?? []),
    ];
    opTelefoon.set(lead.telefoon, winnaar);
  }
  resultaat.push(...opTelefoon.values());

  // 3. status.json
  const activiteiten = new Map<string, ImportActiviteit[]>();
  for (const lead of resultaat) {
    const s = lead.domein ? opties.status?.[lead.domein] : undefined;
    const m = mapStatus(s);
    if (m.status) {
      lead.status = m.status;
      rapport.statusOvergenomen++;
    }
    if (m.notitie) lead.notitie = m.notitie;
    if (m.activiteit && lead.domein) activiteiten.set(lead.domein, [m.activiteit]);
    if (lead.status === 'heeft_chatbot') rapport.metChatbot++;
    for (const l of lead.labels) rapport.labels[l] = (rapport.labels[l] ?? 0) + 1;
  }

  // stabiele volgorde: zoals in de bron
  const volgorde = new Map(ruw.map((n, i) => [normaliseerDomein(n.url) ?? `#${i}`, i]));
  resultaat.sort((a, b) => (volgorde.get(a.domein ?? '') ?? 0) - (volgorde.get(b.domein ?? '') ?? 0));
  rapport.leads = resultaat.length;
  return { leads: resultaat, activiteiten, rapport };
}

/** Kleine CSV-lezer (komma, aanhalingstekens, kopregel). Genoeg voor Niels' CSV's. */
export function leesCsv(tekst: string): Record<string, string>[] {
  const regels: string[][] = [];
  let veld = '';
  let regel: string[] = [];
  let quote = false;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (quote) {
      if (c === '"' && tekst[i + 1] === '"') {
        veld += '"';
        i++;
      } else if (c === '"') quote = false;
      else veld += c;
    } else if (c === '"') quote = true;
    else if (c === ',') {
      regel.push(veld);
      veld = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && tekst[i + 1] === '\n') i++;
      regel.push(veld);
      veld = '';
      if (regel.some((x) => x !== '')) regels.push(regel);
      regel = [];
    } else veld += c;
  }
  if (veld !== '' || regel.length) {
    regel.push(veld);
    if (regel.some((x) => x !== '')) regels.push(regel);
  }
  const [kop, ...rest] = regels;
  if (!kop) return [];
  return rest.map((r) => Object.fromEntries(kop.map((k, i) => [k.trim(), (r[i] ?? '').trim()])));
}
```

Let op de test "dubbel telefoonnummer": `a.nl` (3 reviews) en `b.nl` (30 reviews) delen `06 11111111` → `b.nl` wint, `a.nl` komt in `andere_domeinen`; `www.a.nl/contact` is een dubbel domein en telt als `dubbelDomein`.

- [ ] **Step 4: Run, verwacht PASS.** Faalt de volgorde-assert in "adresgidsen eruit…", controleer dan de sortering in stap 3 (volgorde = bronvolgorde).

- [ ] **Step 5: Commit** — `feat(leads): import-opschoning van Niels' data`

---

### Task 10: Data-laag (`lib/leads/server/db.ts`)

**Files:**
- Create: `lib/leads/server/db.ts`

Alle functies krijgen een `SupabaseClient` (service-role) mee en gaan ervan uit dat de aanroeper de admin-check al deed. Ze gooien `AppError` bij fouten (`lib/errors/app-error`). Lees `lib/errors/app-error.ts` voor de constructor (`new AppError(code, { message })`).

- [ ] **Step 1: Schrijf `lib/leads/server/db.ts`**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';
import type { Activiteit, Afzender, BewerkbaarVeld, Lead, LeadStatus, Stand, Uitkomst, ActiviteitSoort } from '../types';
import { pakStand } from '../types';
import { beginVanMorgen } from '../werkdagen';

export const PAGINA_GROOTTE = 50;
export const CLAIM_MINUTEN = 10;

export type Tab = 'vandaag' | 'terugbellen' | 'opvolgen' | 'kansen' | 'chatbot' | 'archief';
export const TABS: Tab[] = ['vandaag', 'terugbellen', 'opvolgen', 'kansen', 'chatbot', 'archief'];

export type LijstFilter = {
  tab: Tab;
  zoek?: string;
  niche?: string;
  plaats?: string;
  minScore?: number;
  reden?: string;
  sort?: 'bedrijfsnaam' | 'score' | 'volgende_actie_op' | 'laatste_poging_op' | 'plaats';
  richting?: 'asc' | 'desc';
  pagina?: number;
};

function fout(message: string, cause?: unknown): never {
  throw new AppError('INTERNAL', { message, cause });
}

// supabase-js query-builder; bewust losjes getypt zodat één helper alle tabs kan filteren.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function filterTab(q: any, tab: Tab, nu: Date) {
  const morgen = beginVanMorgen(nu).toISOString();
  switch (tab) {
    case 'vandaag':
      return q.in('status', ['open', 'terugbellen']).or(`volgende_actie_op.is.null,volgende_actie_op.lt.${morgen}`);
    case 'terugbellen':
      return q.eq('status', 'terugbellen').gte('volgende_actie_op', morgen);
    case 'opvolgen':
      return q.eq('status', 'opvolgen');
    case 'kansen':
      return q.in('status', ['kans', 'klant']);
    case 'chatbot':
      return q.eq('status', 'heeft_chatbot');
    case 'archief':
      return q.in('status', ['geen_interesse', 'niet_bellen', 'archief']);
  }
}

/** Zoekterm veilig voor een PostgREST or()-filter: geen komma's, haakjes of wildcards. */
export function veiligeZoekterm(q: string): string {
  return q.replace(/[,()%*\\]/g, ' ').trim().slice(0, 80);
}

export async function lijstLeads(db: SupabaseClient, f: LijstFilter, nu = new Date()) {
  const pagina = Math.max(1, f.pagina ?? 1);
  let q = db.from('leads').select('*', { count: 'exact' });
  q = filterTab(q, f.tab, nu);
  if (f.zoek) {
    const z = veiligeZoekterm(f.zoek);
    const cijfers = z.replace(/\D/g, '');
    const delen = [`bedrijfsnaam.ilike.%${z}%`, `domein.ilike.%${z}%`];
    if (cijfers.length >= 4) delen.push(`telefoon.ilike.%${cijfers.replace(/^0/, '')}%`);
    if (z) q = q.or(delen.join(','));
  }
  if (f.niche) q = q.eq('niche', f.niche);
  if (f.plaats) q = q.eq('plaats', f.plaats);
  if (f.minScore !== undefined) q = q.gte('score', f.minScore);
  if (f.reden) q = q.eq('status_reden', f.reden);
  const sort = f.sort ?? (f.tab === 'vandaag' ? 'score' : 'volgende_actie_op');
  const asc = (f.richting ?? (sort === 'score' ? 'desc' : 'asc')) === 'asc';
  q = q.order(sort, { ascending: asc, nullsFirst: false }).order('id');
  q = q.range((pagina - 1) * PAGINA_GROOTTE, pagina * PAGINA_GROOTTE - 1);
  const { data, count, error } = await q;
  if (error) fout(`leads ophalen faalde: ${error.message}`, error);
  return { leads: (data ?? []) as Lead[], totaal: count ?? 0, pagina };
}

export async function tellers(db: SupabaseClient, nu = new Date()): Promise<Record<Tab, number>> {
  const uit = await Promise.all(
    TABS.map(async (t) => {
      const { count, error } = await filterTab(db.from('leads').select('*', { count: 'exact', head: true }), t, nu);
      if (error) fout(`tellen faalde: ${error.message}`, error);
      return [t, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(uit) as Record<Tab, number>;
}

export async function filterOpties(db: SupabaseClient): Promise<{ niches: string[]; plaatsen: string[] }> {
  const { data, error } = await db.from('leads').select('niche, plaats').limit(10000);
  if (error) fout(`filters ophalen faalde: ${error.message}`, error);
  const niches = new Set<string>();
  const plaatsen = new Set<string>();
  for (const r of data ?? []) {
    if (r.niche) niches.add(r.niche);
    if (r.plaats) plaatsen.add(r.plaats);
  }
  return { niches: [...niches].sort(), plaatsen: [...plaatsen].sort() };
}

export async function haalLead(db: SupabaseClient, id: string): Promise<Lead> {
  const { data, error } = await db.from('leads').select('*').eq('id', id).maybeSingle();
  if (error) fout(`lead ophalen faalde: ${error.message}`, error);
  if (!data) throw new AppError('NOT_FOUND', { message: 'Deze lead bestaat niet (meer).' });
  return data as Lead;
}

export async function haalActiviteiten(db: SupabaseClient, leadId: string): Promise<(Activiteit & { door: string | null })[]> {
  const { data, error } = await db
    .from('lead_activiteiten')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) fout(`tijdlijn ophalen faalde: ${error.message}`, error);
  const rijen = (data ?? []) as Activiteit[];
  const ids = [...new Set(rijen.map((r) => r.user_id).filter((x): x is string => !!x))];
  const namen = await voornamen(db, ids);
  return rijen.map((r) => ({ ...r, door: r.user_id ? namen.get(r.user_id) ?? null : null }));
}

export async function voornamen(db: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const [{ data: afz }, { data: users }] = await Promise.all([
    db.from('lead_afzenders').select('user_id, voornaam').in('user_id', ids),
    db.from('users').select('id, email, full_name').in('id', ids),
  ]);
  const m = new Map<string, string>();
  for (const u of users ?? []) m.set(u.id, u.full_name || String(u.email).split('@')[0]);
  for (const a of afz ?? []) m.set(a.user_id, a.voornaam);
  return m;
}

// ── claim ────────────────────────────────────────────────────────────────

export async function claimVolgende(
  db: SupabaseClient,
  userId: string,
  focus: { niche?: string | null; plaats?: string | null },
): Promise<Lead | null> {
  const { data, error } = await db.rpc('leads_claim_volgende', {
    p_user: userId,
    p_niche: focus.niche || null,
    p_plaats: focus.plaats || null,
    p_minuten: CLAIM_MINUTEN,
  });
  if (error) fout(`volgende lead ophalen faalde: ${error.message}`, error);
  const rij = (data as Lead[] | null)?.[0];
  return rij ?? null;
}

/** Een specifieke lead claimen ("bel nu"). Null als een ander hem net heeft. */
export async function claimLead(db: SupabaseClient, userId: string, id: string, nu = new Date()): Promise<Lead | null> {
  const tot = new Date(nu.getTime() + CLAIM_MINUTEN * 60_000).toISOString();
  const { data, error } = await db
    .from('leads')
    .update({ geclaimd_door: userId, geclaimd_tot: tot })
    .eq('id', id)
    .or(`geclaimd_tot.is.null,geclaimd_tot.lt.${nu.toISOString()},geclaimd_door.eq.${userId}`)
    .select('*')
    .maybeSingle();
  if (error) fout(`lead claimen faalde: ${error.message}`, error);
  return (data as Lead | null) ?? null;
}

export async function verlengClaim(db: SupabaseClient, userId: string, id: string, nu = new Date()): Promise<boolean> {
  const tot = new Date(nu.getTime() + CLAIM_MINUTEN * 60_000).toISOString();
  const { data, error } = await db
    .from('leads')
    .update({ geclaimd_tot: tot })
    .eq('id', id)
    .eq('geclaimd_door', userId)
    .select('id');
  if (error) fout(`claim verlengen faalde: ${error.message}`, error);
  return (data ?? []).length > 0;
}

export async function geefVrij(db: SupabaseClient, userId: string, id: string): Promise<void> {
  const { error } = await db
    .from('leads')
    .update({ geclaimd_door: null, geclaimd_tot: null })
    .eq('id', id)
    .eq('geclaimd_door', userId);
  if (error) fout(`claim vrijgeven faalde: ${error.message}`, error);
}

// ── schrijven ────────────────────────────────────────────────────────────

/** Nieuwe stand toepassen + activiteit loggen. Geeft de activiteit-id terug (voor ongedaan maken). */
export async function pasStandToe(
  db: SupabaseClient,
  o: {
    lead: Lead;
    userId: string;
    nieuw: Stand;
    soort: ActiviteitSoort;
    uitkomst?: Uitkomst | null;
    details?: Record<string, unknown>;
    vrijgeven?: boolean;
    extraVelden?: Partial<Lead>;
  },
): Promise<string> {
  const patch: Record<string, unknown> = { ...o.nieuw, ...(o.extraVelden ?? {}) };
  if (o.vrijgeven) {
    patch.geclaimd_door = null;
    patch.geclaimd_tot = null;
  }
  const { error: upErr } = await db.from('leads').update(patch).eq('id', o.lead.id);
  if (upErr) fout(`lead bijwerken faalde: ${upErr.message}`, upErr);
  const { data, error } = await db
    .from('lead_activiteiten')
    .insert({
      lead_id: o.lead.id,
      user_id: o.userId,
      soort: o.soort,
      uitkomst: o.uitkomst ?? null,
      details: o.details ?? {},
      vorige_staat: pakStand(o.lead),
    })
    .select('id')
    .single();
  if (error) fout(`activiteit loggen faalde: ${error.message}`, error);
  return data.id as string;
}

export async function logActiviteit(
  db: SupabaseClient,
  o: { leadId: string; userId: string; soort: ActiviteitSoort; details?: Record<string, unknown> },
): Promise<void> {
  const { error } = await db
    .from('lead_activiteiten')
    .insert({ lead_id: o.leadId, user_id: o.userId, soort: o.soort, details: o.details ?? {} });
  if (error) fout(`activiteit loggen faalde: ${error.message}`, error);
}

export const ONGEDAAN_VENSTER_MS = 15 * 60_000;

/** Zet de lead terug naar `vorige_staat` van de LAATSTE niet-ongedane activiteit. */
export async function maakOngedaan(db: SupabaseClient, activiteitId: string, nu = new Date()): Promise<string> {
  const { data: act, error } = await db.from('lead_activiteiten').select('*').eq('id', activiteitId).maybeSingle();
  if (error) fout(`activiteit ophalen faalde: ${error.message}`, error);
  if (!act) throw new AppError('NOT_FOUND', { message: 'Deze actie bestaat niet.' });
  const a = act as Activiteit;
  if (a.ongedaan_op) throw new AppError('INPUT_INVALID', { message: 'Deze actie is al ongedaan gemaakt.' });
  if (!a.vorige_staat) throw new AppError('INPUT_INVALID', { message: 'Deze actie kan niet ongedaan worden gemaakt.' });
  if (nu.getTime() - new Date(a.created_at).getTime() > ONGEDAAN_VENSTER_MS)
    throw new AppError('INPUT_INVALID', { message: 'Te lang geleden om ongedaan te maken.' });
  const { data: later } = await db
    .from('lead_activiteiten')
    .select('id')
    .eq('lead_id', a.lead_id)
    .is('ongedaan_op', null)
    .gt('created_at', a.created_at)
    .limit(1);
  if ((later ?? []).length) throw new AppError('INPUT_INVALID', { message: 'Er is daarna al iets anders met deze lead gebeurd.' });
  const { error: e1 } = await db.from('leads').update(a.vorige_staat).eq('id', a.lead_id);
  if (e1) fout(`terugzetten faalde: ${e1.message}`, e1);
  const { error: e2 } = await db.from('lead_activiteiten').update({ ongedaan_op: nu.toISOString() }).eq('id', a.id);
  if (e2) fout(`markeren als ongedaan faalde: ${e2.message}`, e2);
  // Een kennismaking-activiteit die bij deze uitkomst hoorde (zelfde lead, binnen 5 s) ook ongedaan maken.
  await db
    .from('lead_activiteiten')
    .update({ ongedaan_op: nu.toISOString() })
    .eq('lead_id', a.lead_id)
    .eq('soort', 'kennismaking')
    .is('ongedaan_op', null)
    .gte('created_at', new Date(new Date(a.created_at).getTime() - 5000).toISOString());
  return a.lead_id;
}

export async function werkVeldenBij(db: SupabaseClient, id: string, patch: Partial<Pick<Lead, BewerkbaarVeld>>): Promise<Lead> {
  const { data, error } = await db.from('leads').update(patch).eq('id', id).select('*').single();
  if (error) {
    if (error.code === '23505') throw new AppError('INPUT_INVALID', { message: 'Er bestaat al een lead met dit domein of telefoonnummer.' });
    fout(`opslaan faalde: ${error.message}`, error);
  }
  return data as Lead;
}

export async function zoekDubbel(db: SupabaseClient, domein: string | null, telefoon: string | null): Promise<Lead | null> {
  const delen = [domein ? `domein.eq.${domein}` : null, telefoon ? `telefoon.eq.${telefoon}` : null].filter(Boolean);
  if (!delen.length) return null;
  const { data, error } = await db.from('leads').select('*').or(delen.join(',')).limit(1);
  if (error) fout(`dubbelcheck faalde: ${error.message}`, error);
  return ((data ?? [])[0] as Lead | undefined) ?? null;
}

export async function maakLead(
  db: SupabaseClient,
  userId: string,
  l: { bedrijfsnaam: string; domein: string | null; website_url: string | null; telefoon: string | null; niche: string | null; plaats: string | null },
): Promise<Lead> {
  const { data, error } = await db
    .from('leads')
    .insert({ ...l, bron: 'handmatig', aangemaakt_door: userId, score_voorlopig: false })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw new AppError('INPUT_INVALID', { message: 'Er bestaat al een lead met dit domein of telefoonnummer.' });
    fout(`lead aanmaken faalde: ${error.message}`, error);
  }
  return data as Lead;
}

export async function zetStatusVoorVeel(
  db: SupabaseClient,
  userId: string,
  ids: string[],
  naar: LeadStatus,
  reden: string | null,
): Promise<number> {
  const { data: leads, error } = await db.from('leads').select('*').in('id', ids);
  if (error) fout(`leads ophalen faalde: ${error.message}`, error);
  for (const l of (leads ?? []) as Lead[]) {
    await pasStandToe(db, {
      lead: l,
      userId,
      nieuw: { ...pakStand(l), status: naar, status_reden: reden, volgende_actie_op: null, volgende_actie_notitie: null },
      soort: 'status',
      details: { van: l.status, naar, reden, bulk: true },
      vrijgeven: true,
    });
  }
  return (leads ?? []).length;
}

// ── afzender ─────────────────────────────────────────────────────────────

export async function haalAfzender(db: SupabaseClient, userId: string): Promise<Afzender | null> {
  const { data, error } = await db.from('lead_afzenders').select('*').eq('user_id', userId).maybeSingle();
  if (error) fout(`afzender ophalen faalde: ${error.message}`, error);
  if (!data) return null;
  return {
    naam: data.naam,
    voornaam: data.voornaam,
    functie: data.functie,
    telefoon: data.telefoon,
    email: data.email,
    fotoUrl: data.foto_url,
  };
}

export async function bewaarAfzender(db: SupabaseClient, userId: string, a: Afzender): Promise<void> {
  const { error } = await db.from('lead_afzenders').upsert({
    user_id: userId,
    naam: a.naam,
    voornaam: a.voornaam,
    functie: a.functie,
    telefoon: a.telefoon,
    email: a.email,
    foto_url: a.fotoUrl,
  });
  if (error) fout(`afzender opslaan faalde: ${error.message}`, error);
}

// ── vandaag-teller voor de belmodus ──────────────────────────────────────

export async function tellerVandaag(db: SupabaseClient, userId: string, sinds: Date) {
  const { data, error } = await db
    .from('lead_activiteiten')
    .select('uitkomst')
    .eq('user_id', userId)
    .eq('soort', 'belpoging')
    .is('ongedaan_op', null)
    .gte('created_at', sinds.toISOString());
  if (error) fout(`teller ophalen faalde: ${error.message}`, error);
  const rijen = data ?? [];
  return {
    gebeld: rijen.length,
    opgenomen: rijen.filter((r) => r.uitkomst !== 'niet_opgenomen').length,
    interesse: rijen.filter((r) => r.uitkomst === 'interesse').length,
  };
}

// ── AVG-opschoning, hooguit 1x per dag per instance ──────────────────────

let laatsteOpschoning = 0;
export async function misschienOpschonen(db: SupabaseClient, nu = Date.now()): Promise<void> {
  if (nu - laatsteOpschoning < 24 * 3600_000) return;
  laatsteOpschoning = nu;
  const { error } = await db.rpc('leads_opschonen');
  if (error) console.error('[leads] opschonen faalde:', error.message);
}
```

- [ ] **Step 2: Controleer `AppError`-codes**

Run: `grep -n "export type AppErrorCode" -A 20 lib/errors/app-error.ts`
Expected: de codes `INTERNAL`, `NOT_FOUND`, `INPUT_INVALID` bestaan. Heet een code anders, gebruik dan de bestaande naam overal in dit bestand en in Task 11.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "lib/leads" ; echo klaar`
Expected: alleen `klaar`.

- [ ] **Step 4: Commit** — `feat(leads): data-laag`

---

### Task 11: Server actions

**Files:**
- Create: `app/v1/leads/actions.ts`

Elke action roept als eerste `requireJorionAdmin()` aan (geeft de `User` terug) en haalt dan `getV1ServiceRoleClient()`. Invoer van de client wordt gevalideerd tegen de vaste lijsten uit `lib/leads/types.ts`.

- [ ] **Step 1: Schrijf `app/v1/leads/actions.ts`**

```ts
'use server';

// Server actions van het leads-dashboard. Auth: requireJorionAdmin() per action
// (de layout beschermt geen actions). DB: service-role (admin-only tabellen,
// RLS aan zonder policies, migr 0032).

import { revalidatePath } from 'next/cache';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError, AppError } from '@/lib/errors/app-error';
import { actionTry, type ActionResult, type ActionFail } from '@/lib/errors/action';
import {
  BEWERKBARE_VELDEN,
  BEZWAREN,
  NIET_BELLEN_REDENEN,
  OPVOLG_SITUATIES,
  pakStand,
  type Afzender,
  type BewerkbaarVeld,
  type Lead,
  type OpvolgSituatie,
  type Activiteit,
} from '@/lib/leads/types';
import { volgendeStand, naMailVerstuurd, handmatigeStatus, type UitkomstOpties, type HandmatigeStatus } from '@/lib/leads/volgende-stand';
import { normaliseerDomein, normaliseerTelefoon, schoneWebsiteUrl, isGeldigEmail } from '@/lib/leads/normaliseren';
import { beginVanDag } from '@/lib/leads/werkdagen';
import * as dbl from '@/lib/leads/server/db';

type Ctx = { userId: string; db: ReturnType<typeof getV1ServiceRoleClient> };

async function ctx(): Promise<Ctx | ActionFail> {
  try {
    const user = await requireJorionAdmin();
    return { userId: user.id, db: getV1ServiceRoleClient() };
  } catch (e) {
    if (isAppError(e)) return { ok: false, error: e.message, code: e.code };
    throw e;
  }
}
const isFail = (x: Ctx | ActionFail): x is ActionFail => 'ok' in x;
const ongeldig = (m: string): never => {
  throw new AppError('INPUT_INVALID', { message: m });
};
const META = { surface: 'dashboard' as const, route: '/v1/leads' };

function revalidate(id?: string) {
  revalidatePath('/v1/leads', 'layout');
  if (id) revalidatePath(`/v1/leads/${id}`);
}

export type BelKaart = {
  lead: Lead;
  tijdlijn: (Activiteit & { door: string | null })[];
  teller: { gebeld: number; opgenomen: number; interesse: number };
};

async function kaart(c: Ctx, lead: Lead): Promise<BelKaart> {
  const [tijdlijn, teller] = await Promise.all([
    dbl.haalActiviteiten(c.db, lead.id),
    dbl.tellerVandaag(c.db, c.userId, beginVanDag(new Date())),
  ]);
  return { lead, tijdlijn, teller };
}

// ── belmodus ─────────────────────────────────────────────────────────────

export async function volgendeLeadAction(focus: { niche?: string | null; plaats?: string | null }): Promise<ActionResult<{ kaart: BelKaart | null }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const lead = await dbl.claimVolgende(c.db, c.userId, focus);
    return { kaart: lead ? await kaart(c, lead) : null };
  }, META);
}

export async function claimLeadAction(id: string): Promise<ActionResult<{ kaart: BelKaart | null }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    await dbl.haalLead(c.db, id); // bestaat?
    const lead = await dbl.claimLead(c.db, c.userId, id);
    return { kaart: lead ? await kaart(c, lead) : null };
  }, META);
}

export async function verlengClaimAction(id: string): Promise<ActionResult<{ nogVanMij: boolean }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => ({ nogVanMij: await dbl.verlengClaim(c.db, c.userId, id) }), META);
}

export async function geefVrijAction(id: string): Promise<ActionResult> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    await dbl.geefVrij(c.db, c.userId, id);
    return {};
  }, META);
}

function valideerOpties(o: UitkomstOpties): UitkomstOpties {
  switch (o.uitkomst) {
    case 'niet_opgenomen':
      if (o.naDerde && o.naDerde !== 'mail' && o.naDerde !== 'archief') ongeldig('Ongeldige keuze.');
      return { uitkomst: o.uitkomst, voicemail: Boolean(o.voicemail), naDerde: o.naDerde };
    case 'terugbellen':
      return { uitkomst: o.uitkomst, op: String(o.op), notitie: o.notitie ? String(o.notitie).slice(0, 500) : null };
    case 'wil_mail':
      return { uitkomst: o.uitkomst };
    case 'interesse':
      return { uitkomst: o.uitkomst, mail: Boolean(o.mail), kennismakingOp: o.kennismakingOp ? String(o.kennismakingOp) : null };
    case 'geen_interesse':
      if (o.bezwaar && !(BEZWAREN as readonly string[]).includes(o.bezwaar)) ongeldig('Ongeldig bezwaar.');
      return { uitkomst: o.uitkomst, bezwaar: o.bezwaar ?? null, opnieuwOver3Maanden: Boolean(o.opnieuwOver3Maanden) };
    case 'niet_bellen':
      if (!(NIET_BELLEN_REDENEN as readonly string[]).includes(o.reden)) ongeldig('Ongeldige reden.');
      return { uitkomst: o.uitkomst, reden: o.reden };
    default:
      return ongeldig('Onbekende uitkomst.');
  }
}

export async function uitkomstAction(
  id: string,
  opties: UitkomstOpties,
): Promise<ActionResult<{ activiteitId: string; opentMail: OpvolgSituatie | null; lead: Lead }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const o = valideerOpties(opties);
    const lead = await dbl.haalLead(c.db, id);
    if (lead.geclaimd_door && lead.geclaimd_door !== c.userId && lead.geclaimd_tot && new Date(lead.geclaimd_tot) > new Date())
      ongeldig('Een ander is deze lead nu aan het bellen.');
    const nu = new Date();
    const overgang = volgendeStand(pakStand(lead), o, nu);
    const activiteitId = await dbl.pasStandToe(c.db, {
      lead,
      userId: c.userId,
      nieuw: overgang.stand,
      soort: 'belpoging',
      uitkomst: o.uitkomst,
      details: overgang.details,
      // Opent er een mail, dan blijft de claim staan tot de pop-up dicht is.
      vrijgeven: overgang.opentMail === null,
    });
    if (overgang.kennismaking) {
      await dbl.logActiviteit(c.db, {
        leadId: id,
        userId: c.userId,
        soort: 'kennismaking',
        details: { op: overgang.stand.kennismaking_op },
      });
    }
    revalidate(id);
    return { activiteitId, opentMail: overgang.opentMail, lead: { ...lead, ...overgang.stand } };
  }, META);
}

export async function overslaanAction(id: string): Promise<ActionResult> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const over2uur = new Date(Date.now() + 2 * 3600_000).toISOString();
    const { error } = await c.db
      .from('leads')
      .update({ volgende_actie_op: over2uur, geclaimd_door: null, geclaimd_tot: null })
      .eq('id', id)
      .eq('geclaimd_door', c.userId);
    if (error) throw new AppError('INTERNAL', { message: `overslaan faalde: ${error.message}` });
    return {};
  }, META);
}

export async function ongedaanAction(activiteitId: string): Promise<ActionResult<{ kaart: BelKaart | null }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const leadId = await dbl.maakOngedaan(c.db, activiteitId);
    const lead = await dbl.claimLead(c.db, c.userId, leadId);
    revalidate(leadId);
    return { kaart: lead ? await kaart(c, lead) : null };
  }, META);
}

// ── velden, status, nieuw ────────────────────────────────────────────────

export async function werkVeldenBijAction(id: string, patch: Partial<Record<BewerkbaarVeld, string>>): Promise<ActionResult<{ lead: Lead }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const schoon: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!(BEWERKBARE_VELDEN as readonly string[]).includes(k)) ongeldig(`Veld ${k} mag niet.`);
      const w = typeof v === 'string' ? v.trim().slice(0, k === 'notitie' ? 4000 : 300) : '';
      if (k === 'aanspreekvorm') {
        if (w !== 'je' && w !== 'u') ongeldig('Kies je of u.');
        schoon[k] = w;
      } else if (k === 'telefoon') {
        const t = normaliseerTelefoon(w);
        if (w && !t) ongeldig('Dit telefoonnummer klopt niet.');
        schoon.telefoon = t;
      } else if (k === 'email') {
        if (w && !isGeldigEmail(w)) ongeldig('Dit e-mailadres klopt niet.');
        schoon.email = w || null;
      } else if (k === 'website_url') {
        schoon.website_url = schoneWebsiteUrl(w);
        schoon.domein = normaliseerDomein(w);
      } else if (k === 'bedrijfsnaam') {
        if (!w) ongeldig('Bedrijfsnaam mag niet leeg zijn.');
        schoon[k] = w;
      } else schoon[k] = w || null;
    }
    const lead = await dbl.haalLead(c.db, id);
    const nieuw = await dbl.werkVeldenBij(c.db, lead.id, schoon as Partial<Lead>);
    // Een gewijzigd e-mailadres komt ook in de lijst van gevonden adressen.
    if (typeof schoon.email === 'string' && !nieuw.emails_gevonden.includes(schoon.email)) {
      await c.db.from('leads').update({ emails_gevonden: [...nieuw.emails_gevonden, schoon.email] }).eq('id', id);
    }
    if ('notitie' in schoon && schoon.notitie && schoon.notitie !== lead.notitie) {
      await dbl.logActiviteit(c.db, { leadId: id, userId: c.userId, soort: 'notitie', details: { tekst: schoon.notitie } });
    }
    revalidate(id);
    return { lead: nieuw };
  }, META);
}

const HANDMATIG: HandmatigeStatus[] = ['open', 'archief', 'niet_bellen', 'klant', 'geen_interesse'];

export async function zetStatusAction(id: string, naar: HandmatigeStatus, reden: string | null = null): Promise<ActionResult<{ activiteitId: string }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    if (!HANDMATIG.includes(naar)) ongeldig('Ongeldige status.');
    const lead = await dbl.haalLead(c.db, id);
    const activiteitId = await dbl.pasStandToe(c.db, {
      lead,
      userId: c.userId,
      nieuw: handmatigeStatus(pakStand(lead), naar, reden ? String(reden).slice(0, 200) : null),
      soort: 'status',
      details: { van: lead.status, naar, reden },
      vrijgeven: true,
    });
    revalidate(id);
    return { activiteitId };
  }, META);
}

export async function bulkArchiveerAction(ids: string[]): Promise<ActionResult<{ aantal: number }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) ongeldig('Kies 1 tot 200 leads.');
    const aantal = await dbl.zetStatusVoorVeel(c.db, c.userId, ids.map(String), 'archief', 'bulk');
    revalidate();
    return { aantal };
  }, META);
}

export async function nieuweLeadAction(invoer: {
  bedrijfsnaam: string;
  website: string;
  telefoon: string;
  niche: string;
  plaats: string;
}): Promise<ActionResult<{ id: string; bestond: boolean }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const naam = String(invoer.bedrijfsnaam ?? '').trim().slice(0, 200);
    if (!naam) ongeldig('Vul een bedrijfsnaam in.');
    const domein = normaliseerDomein(invoer.website);
    const telefoon = normaliseerTelefoon(invoer.telefoon);
    if (invoer.website?.trim() && !domein) ongeldig('Deze website klopt niet.');
    if (invoer.telefoon?.trim() && !telefoon) ongeldig('Dit telefoonnummer klopt niet.');
    if (!domein && !telefoon) ongeldig('Vul een website of telefoonnummer in.');
    const dubbel = await dbl.zoekDubbel(c.db, domein, telefoon);
    if (dubbel) return { id: dubbel.id, bestond: true };
    const lead = await dbl.maakLead(c.db, c.userId, {
      bedrijfsnaam: naam,
      domein,
      website_url: schoneWebsiteUrl(invoer.website),
      telefoon,
      niche: String(invoer.niche ?? '').trim() || null,
      plaats: String(invoer.plaats ?? '').trim() || null,
    });
    revalidate();
    return { id: lead.id, bestond: false };
  }, META);
}

// ── mail ─────────────────────────────────────────────────────────────────

export async function mailVerstuurdAction(
  id: string,
  m: { situatie: OpvolgSituatie; onderwerp: string; aan: string },
): Promise<ActionResult<{ activiteitId: string }>> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    if (!(OPVOLG_SITUATIES as readonly string[]).includes(m.situatie)) ongeldig('Ongeldige situatie.');
    if (!isGeldigEmail(m.aan)) ongeldig('Dit e-mailadres klopt niet.');
    const lead = await dbl.haalLead(c.db, id);
    const aan = m.aan.trim();
    const activiteitId = await dbl.pasStandToe(c.db, {
      lead,
      userId: c.userId,
      nieuw: naMailVerstuurd(pakStand(lead), m.situatie, new Date()),
      soort: 'mail',
      details: { situatie: m.situatie, onderwerp: String(m.onderwerp).slice(0, 200), aan },
      vrijgeven: true,
      extraVelden: {
        email: aan,
        emails_gevonden: lead.emails_gevonden.includes(aan) ? lead.emails_gevonden : [...lead.emails_gevonden, aan],
      },
    });
    revalidate(id);
    return { activiteitId };
  }, META);
}

export async function bewaarAfzenderAction(a: Afzender): Promise<ActionResult> {
  const c = await ctx();
  if (isFail(c)) return c;
  return actionTry(async () => {
    const schoon: Afzender = {
      naam: String(a.naam ?? '').trim().slice(0, 100),
      voornaam: String(a.voornaam ?? '').trim().slice(0, 60),
      functie: String(a.functie ?? '').trim().slice(0, 60) || 'Oprichter',
      telefoon: String(a.telefoon ?? '').trim().slice(0, 30),
      email: String(a.email ?? '').trim().slice(0, 200),
      fotoUrl: a.fotoUrl ? String(a.fotoUrl).trim().slice(0, 300) : null,
    };
    if (!schoon.naam || !schoon.voornaam) ongeldig('Vul je naam en voornaam in.');
    if (!normaliseerTelefoon(schoon.telefoon)) ongeldig('Dit telefoonnummer klopt niet.');
    if (!isGeldigEmail(schoon.email)) ongeldig('Dit e-mailadres klopt niet.');
    if (schoon.fotoUrl && !/^https:\/\/\S+$/.test(schoon.fotoUrl)) ongeldig('De foto moet een https-link zijn.');
    await dbl.bewaarAfzender(c.db, c.userId, schoon);
    revalidate();
    return {};
  }, META);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "app/v1/leads|lib/leads" ; echo klaar`
Expected: alleen `klaar`. Klaagt TS over de `default`-tak in `valideerOpties` (type `never`), laat de `default` dan staan; die vangt onzin van de client.

- [ ] **Step 3: Commit** — `feat(leads): server actions`

---

### Task 12: Layout, kopbalk en CSS

**Files:**
- Create: `app/v1/leads/layout.tsx`
- Create: `app/v1/leads/_ui/leads.css`
- Create: `app/v1/leads/_ui/kopbalk.tsx`

- [ ] **Step 1: Schrijf `app/v1/leads/layout.tsx`**

```tsx
// Leads-dashboard: eigen, rustige schil (geen admin-zijbalk). Gate = admin.
// Layouts beschermen geen actions: die checken zelf (app/v1/leads/actions.ts).

import '../admin/_ui/admin.css';
import './_ui/leads.css';
import type { Metadata } from 'next';
import { requireJorionAdmin } from '@/lib/auth';
import { isAppError } from '@/lib/errors/app-error';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { ToastProvider } from '@/app/v1/_ui/toast';
import { Kopbalk } from './_ui/kopbalk';

export const metadata: Metadata = {
  title: 'ChatManta · Leads',
  description: 'Bellijst, opvolging en inzicht voor koude acquisitie.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function LeadsLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireJorionAdmin();
  } catch (e) {
    if (isAppError(e) && e.code === 'AUTH_FORBIDDEN') {
      return (
        <main className="v1-adm-denied">
          <PageHeader title="Geen toegang" description="Het leads-dashboard is alleen voor admins." />
        </main>
      );
    }
    throw e;
  }
  return (
    <ToastProvider>
      <div className="ld-schil">
        <Kopbalk />
        <main className="ld-main">{children}</main>
      </div>
    </ToastProvider>
  );
}
```

- [ ] **Step 2: Schrijf `app/v1/leads/_ui/kopbalk.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/app/v1/_ui/brand-mark';

const ITEMS = [
  { href: '/v1/leads', label: 'Lijst', exact: true },
  { href: '/v1/leads/bellen', label: 'Bellen' },
  { href: '/v1/leads/inzicht', label: 'Inzicht' },
  { href: '/v1/leads/instellingen', label: 'Instellingen' },
];

export function Kopbalk() {
  const pad = usePathname();
  return (
    <header className="ld-kop">
      <Link href="/v1/leads" className="ld-merk">
        <BrandMark />
        ChatManta <span className="ld-merk-tag">Leads</span>
      </Link>
      <nav className="ld-nav" aria-label="Leads">
        {ITEMS.map((i) => {
          const actief = i.exact ? pad === i.href : pad.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href} className="ld-nav-item" aria-current={actief ? 'page' : undefined}>
              {i.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
```

Controleer dat `BrandMark` geen verplichte props heeft: `grep -n "export function BrandMark" -A 3 app/v1/_ui/brand-mark.tsx`. Heeft hij die wel, geef dezelfde props mee als in `app/v1/admin/_shell/sidebar.tsx`.

- [ ] **Step 3: Schrijf `app/v1/leads/_ui/leads.css`**

```css
/* Leads-dashboard (/v1/leads). Prefix ld- : nooit bestaande v1-/v1-adm-klassen herdefiniëren. */

.ld-schil { min-height: 100dvh; background: var(--v1-bg); color: var(--v1-ink); font-family: var(--v1-font); }
.ld-kop {
  position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 24px;
  padding: 12px 24px; background: var(--v1-navy); color: var(--v1-on-navy);
}
.ld-merk { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: inherit; text-decoration: none; }
.ld-merk-tag { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 6px; background: rgba(45, 212, 191, 0.18); color: #5eead4; }
.ld-nav { display: flex; gap: 4px; overflow-x: auto; }
.ld-nav-item { padding: 7px 12px; border-radius: var(--v1-r-sm); color: var(--v1-on-navy-2); text-decoration: none; font-size: 14px; font-weight: 600; white-space: nowrap; }
.ld-nav-item:hover { color: var(--v1-on-navy); background: rgba(255, 255, 255, 0.06); }
.ld-nav-item[aria-current='page'] { color: var(--v1-on-navy); background: rgba(255, 255, 255, 0.12); }
.ld-main { max-width: 1280px; margin: 0 auto; padding: 24px; display: grid; gap: 20px; }
@media (max-width: 700px) {
  .ld-kop { padding: 10px 16px; gap: 12px; }
  .ld-main { padding: 16px; }
}

/* Filterbalk en lijst */
.ld-balk { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ld-balk .v1-input { width: auto; min-width: 140px; }
.ld-balk-zoek { flex: 1 1 240px; }
.ld-rij-link { color: var(--v1-ink); font-weight: 600; text-decoration: none; }
.ld-rij-link:hover { text-decoration: underline; }
.ld-sub { display: block; font-size: 12px; color: var(--v1-muted); font-weight: 400; }
.ld-label { display: inline-block; margin: 2px 4px 0 0; padding: 1px 6px; border-radius: 6px; font-size: 11px; font-weight: 600; background: var(--v1-surface-2); color: var(--v1-ink-2); }
.ld-label[data-tone='warn'] { background: var(--v1-warn-soft); color: var(--v1-warn); }
.ld-label[data-tone='ok'] { background: var(--v1-ok-soft); color: var(--v1-ok); }
.ld-bulk { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-radius: var(--v1-r-md); background: var(--v1-surface); box-shadow: var(--v1-shadow-1); }
.ld-paginering { display: flex; gap: 8px; align-items: center; justify-content: flex-end; font-size: 13px; color: var(--v1-muted); }

/* Belmodus */
.ld-bel { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.8fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 1000px) { .ld-bel { grid-template-columns: 1fr; } }
.ld-kaart { background: var(--v1-surface); border-radius: var(--v1-r-lg); box-shadow: var(--v1-shadow-1); padding: 20px; display: grid; gap: 12px; }
.ld-bedrijf { margin: 0; font-size: 24px; line-height: 1.2; }
.ld-nummer { font-size: 30px; font-weight: 800; letter-spacing: 0.02em; font-variant-numeric: tabular-nums; color: var(--v1-ink); text-decoration: none; }
.ld-qr { width: 200px; height: 200px; margin: 0 auto; background: #fff; border-radius: var(--v1-r-md); padding: 8px; }
.ld-qr svg { width: 100%; height: 100%; display: block; }
@media (pointer: coarse), (max-width: 700px) { .ld-qr { display: none; } }
.ld-qr-tip { margin: 0; text-align: center; font-size: 12px; color: var(--v1-muted); }
@media (pointer: coarse), (max-width: 700px) { .ld-qr-tip { display: none; } }
.ld-teller { display: flex; gap: 16px; font-size: 14px; color: var(--v1-ink-2); }
.ld-teller b { font-size: 18px; color: var(--v1-ink); }
.ld-knoppen { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 700px) { .ld-knoppen { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.ld-uitkomst { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 14px; min-height: 64px; border: 0; border-radius: var(--v1-r-md); background: var(--v1-surface-2); color: var(--v1-ink); font: inherit; font-weight: 700; text-align: left; cursor: pointer; }
.ld-uitkomst:hover { box-shadow: inset 0 0 0 2px var(--v1-line-strong); }
.ld-uitkomst:focus-visible { outline: none; box-shadow: var(--v1-focus); }
.ld-uitkomst kbd { font: 600 11px var(--v1-font); color: var(--v1-muted); }
.ld-uitkomst[data-tone='ok'] { background: var(--v1-ok-soft); }
.ld-uitkomst[data-tone='danger'] { background: var(--v1-danger-soft); }
.ld-tijdlijn { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; font-size: 13px; }
.ld-tijdlijn li { border-left: 2px solid var(--v1-line); padding-left: 10px; }
.ld-tijdlijn time { color: var(--v1-muted); }
.ld-tijdlijn [data-ongedaan] { opacity: 0.45; text-decoration: line-through; }
.ld-spiek summary { cursor: pointer; font-weight: 600; }
.ld-spiek ol { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 6px; font-size: 14px; }
.ld-leeg { text-align: center; padding: 48px 16px; color: var(--v1-muted); }
.ld-ongedaan { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 40; display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-radius: var(--v1-r-md); background: var(--v1-navy); color: var(--v1-on-navy); box-shadow: var(--v1-shadow-pop); }

/* Dialogen */
.ld-dialoog { border: 0; border-radius: var(--v1-r-lg); padding: 0; box-shadow: var(--v1-shadow-pop); width: min(520px, calc(100vw - 32px)); color: var(--v1-ink); }
.ld-dialoog::backdrop { background: rgba(12, 30, 46, 0.45); }
.ld-dialoog-inhoud { padding: 20px; display: grid; gap: 14px; }
.ld-dialoog h2 { margin: 0; font-size: 18px; }
.ld-dialoog-voet { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
.ld-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ld-chip { padding: 6px 10px; border-radius: 999px; border: 1px solid var(--v1-line-strong); background: var(--v1-surface); font: inherit; font-size: 13px; cursor: pointer; }
.ld-chip[aria-pressed='true'] { background: var(--v1-navy); border-color: var(--v1-navy); color: #fff; }

/* Mail-pop-up */
.ld-mail { position: fixed; inset: 0; z-index: 50; background: rgba(12, 30, 46, 0.45); display: grid; place-items: center; padding: 16px; }
.ld-mail-venster { width: min(1180px, 100%); max-height: calc(100dvh - 32px); overflow: auto; background: var(--v1-bg); border-radius: var(--v1-r-xl); box-shadow: var(--v1-shadow-pop); display: grid; grid-template-columns: 360px 1fr; gap: 20px; padding: 20px; }
@media (max-width: 900px) { .ld-mail-venster { grid-template-columns: 1fr; } }
.ld-mail-form { background: var(--v1-surface); border-radius: var(--v1-r-lg); padding: 16px; display: grid; gap: 12px; align-content: start; }
.ld-mail-rechts { display: grid; gap: 12px; align-content: start; }
.ld-mail-balk { background: var(--v1-surface); border-radius: var(--v1-r-lg); padding: 14px; display: grid; gap: 10px; }
.ld-mail-voorbeeld { background: #fff; border-radius: var(--v1-r-lg); padding: 28px 22px; display: flex; justify-content: center; }
.ld-mail-voorbeeld[data-smal] { background: #f6f8fb; }
.ld-mail-voorbeeld > div { width: 100%; max-width: 600px; outline: none; }
.ld-mail-voorbeeld[data-smal] > div { max-width: 360px; }
.ld-mist { box-shadow: inset 0 0 0 1px #f59e0b !important; background: #fffbeb !important; }
.ld-fout { box-shadow: inset 0 0 0 1px var(--v1-danger) !important; }
.ld-melding { margin: 0; padding: 10px 12px; border-radius: var(--v1-r-sm); background: var(--v1-warn-soft); font-size: 13px; display: flex; gap: 10px; align-items: center; justify-content: space-between; }

/* Inzicht */
.ld-raster { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 900px) { .ld-raster { grid-template-columns: 1fr; } }
.ld-trechter { display: grid; gap: 8px; }
.ld-trechter-rij { display: grid; grid-template-columns: 120px 1fr 90px; gap: 10px; align-items: center; font-size: 14px; }
.ld-trechter-balk { height: 26px; border-radius: 6px; background: var(--v1-accent); min-width: 2px; }
.ld-trechter-rij span:last-child { text-align: right; font-variant-numeric: tabular-nums; color: var(--v1-ink-2); }
.ld-staven { display: grid; gap: 6px; font-size: 13px; }
.ld-staaf { display: grid; grid-template-columns: 170px 1fr 40px; gap: 8px; align-items: center; }
.ld-staaf div { height: 14px; border-radius: 4px; background: var(--v1-navy-2); }
.ld-heat { display: grid; grid-template-columns: 40px repeat(10, minmax(0, 1fr)); gap: 3px; font-size: 11px; }
.ld-heat span { display: grid; place-items: center; height: 26px; border-radius: 4px; font-variant-numeric: tabular-nums; }
.ld-heat .ld-heat-kop { color: var(--v1-muted); }
.ld-periode { display: flex; flex-wrap: wrap; gap: 6px; }
```

- [ ] **Step 4: Typecheck** (zelfde commando als Task 11, plus `app/v1/leads`)

- [ ] **Step 5: Commit** — `feat(leads): eigen schil en stijl voor /v1/leads`

---

### Task 13: Gedeelde UI-bouwstenen (dialoog, QR, belscript, tijdlijn)

**Files:**
- Create: `app/v1/leads/_ui/dialoog.tsx`
- Create: `app/v1/leads/_ui/qr.tsx`
- Create: `app/v1/leads/_ui/belscript.tsx`
- Create: `app/v1/leads/_ui/tijdlijn.tsx`
- Create: `app/v1/leads/_ui/labels.tsx`

- [ ] **Step 1: `dialoog.tsx`** (native `<dialog>`: Escape en focus gratis)

```tsx
'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function Dialoog({
  open,
  titel,
  onSluit,
  children,
  voet,
}: {
  open: boolean;
  titel: string;
  onSluit: () => void;
  children: ReactNode;
  voet?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="ld-dialoog" onClose={onSluit} onCancel={onSluit}>
      {open ? (
        <div className="ld-dialoog-inhoud">
          <h2>{titel}</h2>
          {children}
          {voet ? <div className="ld-dialoog-voet">{voet}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function Chips<T extends string>({
  opties,
  waarde,
  onKies,
  label,
}: {
  opties: ReadonlyArray<{ id: T; label: string }>;
  waarde: T | null;
  onKies: (id: T | null) => void;
  label: string;
}) {
  return (
    <div className="ld-chips" role="group" aria-label={label}>
      {opties.map((o) => (
        <button
          key={o.id}
          type="button"
          className="ld-chip"
          aria-pressed={waarde === o.id}
          onClick={() => onKies(waarde === o.id ? null : o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: `qr.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** QR-code met een tel:-link: scan met je telefoon en hij belt. */
export function TelQr({ tel }: { tel: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let weg = false;
    QRCode.toString(tel, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(
      (s) => !weg && setSvg(s),
      () => !weg && setSvg(''),
    );
    return () => {
      weg = true;
    };
  }, [tel]);
  if (!svg) return null;
  // De SVG komt uit de qrcode-library op basis van ons eigen tel:-nummer (genormaliseerd +31…), niet uit gebruikersinvoer-HTML.
  return <div className="ld-qr" role="img" aria-label="QR-code om te bellen" dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

- [ ] **Step 3: `belscript.tsx`**

```tsx
export function Belscript() {
  return (
    <details className="ld-spiek">
      <summary>Belscript (5 stappen)</summary>
      <ol>
        <li>Begroeting met naam en een kort, oprecht compliment over hun site.</li>
        <li>In één zin wat ChatManta doet: een chatbot op je eigen site die klantvragen meteen beantwoordt, ook &apos;s avonds.</li>
        <li>Vraag: krijgen jullie veel klantvragen of aanvragen via telefoon en mail?</li>
        <li>Het voordeel voor juist dit bedrijf (minder telefoontjes, geen aanvraag missen).</li>
        <li>Afsluiten: korte kennismaking via Teams voorstellen en een demo per mail sturen.</li>
      </ol>
    </details>
  );
}
```

- [ ] **Step 4: `tijdlijn.tsx`**

```tsx
import type { Activiteit } from '@/lib/leads/types';
import { BEZWAAR_LABEL, NIET_BELLEN_LABEL, STATUS_LABEL, UITKOMST_LABEL, OPVOLG_SITUATIE_LABEL, type Bezwaar, type LeadStatus, type NietBellenReden, type OpvolgSituatie } from '@/lib/leads/types';
import { toonMoment } from '@/lib/leads/werkdagen';

function omschrijving(a: Activiteit): string {
  const d = a.details as Record<string, unknown>;
  switch (a.soort) {
    case 'belpoging': {
      let t = a.uitkomst ? UITKOMST_LABEL[a.uitkomst] : 'Gebeld';
      if (a.uitkomst === 'niet_opgenomen' && d.voicemail) t += ' (voicemail)';
      if (a.uitkomst === 'terugbellen' && d.op) t += ` → ${toonMoment(String(d.op))}`;
      if (a.uitkomst === 'geen_interesse' && d.bezwaar) t += `: ${BEZWAAR_LABEL[d.bezwaar as Bezwaar] ?? d.bezwaar}`;
      if (a.uitkomst === 'niet_bellen' && d.reden) t += `: ${NIET_BELLEN_LABEL[d.reden as NietBellenReden] ?? d.reden}`;
      if (typeof d.notitie === 'string' && d.notitie) t += ` · ${d.notitie}`;
      return t;
    }
    case 'mail':
      return `Opvolgmail gestuurd (${OPVOLG_SITUATIE_LABEL[d.situatie as OpvolgSituatie]?.titel ?? d.situatie}) aan ${d.aan}`;
    case 'kennismaking':
      return `Kennismaking gepland: ${toonMoment(String(d.op))}`;
    case 'status':
      return `Status: ${STATUS_LABEL[d.van as LeadStatus] ?? d.van} → ${STATUS_LABEL[d.naar as LeadStatus] ?? d.naar}${d.reden ? ` (${d.reden})` : ''}`;
    case 'notitie':
      return `Notitie: ${d.tekst}`;
    case 'import': {
      const delen = [];
      if (d.gebeld) delen.push(`gebeld op ${d.gebeld}`);
      if (d.mail_verstuurd) delen.push(`gemaild op ${d.mail_verstuurd}`);
      if (d.uitkomst) delen.push(`uitkomst: ${d.uitkomst}`);
      return `Uit Niels' tool: ${delen.join(', ') || 'geïmporteerd'}`;
    }
  }
}

export function Tijdlijn({ items }: { items: (Activiteit & { door: string | null })[] }) {
  if (!items.length) return <p className="v1-hint">Nog niets gebeurd met deze lead.</p>;
  return (
    <ul className="ld-tijdlijn">
      {items.map((a) => (
        <li key={a.id} data-ongedaan={a.ongedaan_op ? '' : undefined}>
          <time dateTime={a.created_at}>{toonMoment(a.created_at)}</time>
          {a.door ? ` · ${a.door}` : ''}
          <div>{omschrijving(a)}</div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: `labels.tsx`**

```tsx
import type { Lead } from '@/lib/leads/types';
import { LABEL_TEKST } from '@/lib/leads/types';

export function LeadLabels({ lead }: { lead: Pick<Lead, 'labels' | 'heeft_chatbot' | 'chatbot_naam' | 'score_voorlopig' | 'score'> }) {
  return (
    <>
      {lead.heeft_chatbot ? <span className="ld-label" data-tone="warn">Chatbot{lead.chatbot_naam ? `: ${lead.chatbot_naam}` : ''}</span> : null}
      {lead.labels.map((l) => (
        <span key={l} className="ld-label">
          {LABEL_TEKST[l] ?? l}
        </span>
      ))}
    </>
  );
}
```

- [ ] **Step 6: Typecheck en commit** — `feat(leads): gedeelde UI (dialoog, QR, belscript, tijdlijn)`

---

### Task 14: Mail-pop-up

**Files:**
- Create: `app/v1/leads/_ui/mail-popup.tsx`

Gedrag volgens spec §6 en de maker: formulier links, voorbeeld rechts (`contenteditable`), "Opnieuw opbouwen" na handmatig bewerken, computer/telefoon-weergave, kopiëren geblokkeerd bij ontbrekende velden, "Open Outlook" (`mailto:` met adres + onderwerp), daarna "Verstuurd?".

- [ ] **Step 1: Schrijf `app/v1/leads/_ui/mail-popup.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { bouwOpvolgmail, standaardInvoer, type OpvolgInvoer } from '@/lib/leads/opvolgmail';
import { dagdeelVoorMail, type Dagdeel } from '@/lib/leads/werkdagen';
import { isGeldigEmail } from '@/lib/leads/normaliseren';
import { OPVOLG_SITUATIES, OPVOLG_SITUATIE_LABEL, type Afzender, type Lead, type OpvolgSituatie } from '@/lib/leads/types';
import { mailVerstuurdAction } from '../actions';

const DAGDELEN: Dagdeel[] = ['vanochtend', 'vanmiddag', 'vandaag', 'gisteren'];

const TIP_STANDAARD = 'In Outlook: nieuwe mail, klik in het tekstvak, Ctrl+V. Staat je eigen Outlook-handtekening eronder, haal die dan weg: de handtekening zit al in de mail.';
const TIP_HERINNERING = 'Beantwoord je eerdere mail in Outlook en plak deze tekst erboven met Ctrl+V. Dan blijft het gesprek bij elkaar en staat het onderwerp al goed.';

async function kopieerRijk(html: string, tekst: string, el: HTMLElement | null): Promise<void> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tekst], { type: 'text/plain' }),
        }),
      ]);
      return;
    }
  } catch {
    // val terug op selectie + execCommand
  }
  if (!el) throw new Error('Kopiëren lukte niet.');
  const r = document.createRange();
  r.selectNode(el);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(r);
  const ok = document.execCommand('copy');
  sel?.removeAllRanges();
  if (!ok) throw new Error('Kopiëren lukte niet.');
}

export function MailPopup({
  lead,
  afzender,
  situatie: beginSituatie,
  onKlaar,
}: {
  lead: Lead;
  afzender: Afzender | null;
  situatie: OpvolgSituatie;
  /** verstuurd = true als "Verstuurd? → ja" is geklikt. */
  onKlaar: (verstuurd: boolean) => void;
}) {
  const toast = useToast();
  const [v, setV] = useState<OpvolgInvoer>(() => ({
    ...standaardInvoer(),
    situatie: beginSituatie,
    vorm: lead.aanspreekvorm,
    naam: lead.contactpersoon ?? '',
    bedrijf: lead.bedrijfsnaam,
    haakje: lead.haakje ?? '',
    dagdeel: dagdeelVoorMail(lead.laatste_poging_op ? new Date(lead.laatste_poging_op) : null, new Date()),
  }));
  const [aan, setAan] = useState(lead.email ?? '');
  const [bewerkt, setBewerkt] = useState(false);
  const [smal, setSmal] = useState(false);
  const [fase, setFase] = useState<'maken' | 'verstuurd?'>('maken');
  const [bezig, setBezig] = useState(false);
  const mailRef = useRef<HTMLDivElement>(null);

  const mail = useMemo(() => (afzender ? bouwOpvolgmail(v, afzender) : null), [v, afzender]);

  useEffect(() => {
    if (!bewerkt && mailRef.current && mail) mailRef.current.innerHTML = mail.html;
  }, [mail, bewerkt]);

  if (!afzender) {
    return (
      <div className="ld-mail" role="dialog" aria-modal="true" aria-label="Opvolgmail">
        <div className="ld-mail-venster" style={{ gridTemplateColumns: '1fr', maxWidth: 520 }}>
          <div className="ld-mail-form">
            <h2 style={{ margin: 0 }}>Eerst je afzender invullen</h2>
            <p>Je naam, functie, telefoon en foto komen in de handtekening. Vul ze één keer in bij Instellingen.</p>
            <div className="ld-dialoog-voet">
              <Button variant="secondary" onClick={() => onKlaar(false)}>Sluiten</Button>
              <Link className="v1-btn v1-btn--primary" href="/v1/leads/instellingen" target="_blank">Naar instellingen</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const zet = <K extends keyof OpvolgInvoer>(k: K, w: OpvolgInvoer[K]) => setV((x) => ({ ...x, [k]: w }));
  const mist = new Set(mail?.ontbreekt.map((m) => m.veld));
  const aanOk = isGeldigEmail(aan);
  const kanKopieren = mail !== null && mail.ontbreekt.length === 0;

  async function kopieer() {
    if (!mail || !mailRef.current) return;
    try {
      const html = mailRef.current.innerHTML;
      const tekst = mailRef.current.innerText;
      await kopieerRijk(html, tekst, mailRef.current.firstElementChild as HTMLElement | null);
      toast.success('Mail gekopieerd. Plak hem met Ctrl+V in Outlook.');
      setFase('verstuurd?');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kopiëren lukte niet.');
    }
  }

  function openOutlook() {
    if (!mail) return;
    const href = `mailto:${encodeURIComponent(aan.trim())}?subject=${encodeURIComponent(mail.onderwerp)}`;
    window.location.href = href;
  }

  async function bevestig() {
    if (!mail) return;
    if (!aanOk) {
      toast.error('Vul eerst een geldig e-mailadres in.');
      return;
    }
    setBezig(true);
    const r = await mailVerstuurdAction(lead.id, { situatie: v.situatie, onderwerp: mail.onderwerp, aan: aan.trim() });
    setBezig(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success('Vastgelegd: opvolgmail gestuurd.');
    onKlaar(true);
  }

  return (
    <div className="ld-mail" role="dialog" aria-modal="true" aria-label="Opvolgmail">
      <div className="ld-mail-venster">
        <form className="ld-mail-form" onSubmit={(e) => e.preventDefault()} autoComplete="off">
          <h2 style={{ margin: 0, fontSize: 18 }}>Opvolgmail · {lead.bedrijfsnaam}</h2>
          <div className="v1-field">
            <span className="v1-label">Welke mail?</span>
            <div className="ld-chips" role="radiogroup" aria-label="Situatie">
              {OPVOLG_SITUATIES.map((s) => (
                <button key={s} type="button" className="ld-chip" aria-pressed={v.situatie === s} onClick={() => zet('situatie', s)} title={OPVOLG_SITUATIE_LABEL[s].uitleg}>
                  {OPVOLG_SITUATIE_LABEL[s].titel}
                </button>
              ))}
            </div>
          </div>
          <div className="v1-field">
            <span className="v1-label">Aanspreken met</span>
            <div className="ld-chips">
              {(['je', 'u'] as const).map((f) => (
                <button key={f} type="button" className="ld-chip" aria-pressed={v.vorm === f} onClick={() => zet('vorm', f)}>{f}</button>
              ))}
            </div>
          </div>
          <label className="v1-field">
            <span className="v1-label">Naam</span>
            <input className={`v1-input ${mist.has('naam') ? 'ld-mist' : ''}`} value={v.naam} onChange={(e) => zet('naam', e.target.value)} placeholder="Jan (bij u: meneer Jansen)" />
          </label>
          <label className="v1-field">
            <span className="v1-label">Gesproken</span>
            <select className="v1-input" value={v.dagdeel} onChange={(e) => zet('dagdeel', e.target.value as Dagdeel)}>
              {DAGDELEN.map((d) => <option key={d}>{d}</option>)}
            </select>
          </label>
          <label className="v1-field">
            <span className="v1-label">Bedrijfsnaam</span>
            <input className={`v1-input ${mist.has('bedrijf') ? 'ld-mist' : ''}`} value={v.bedrijf} onChange={(e) => zet('bedrijf', e.target.value)} />
          </label>
          {v.situatie !== 'herinnering' ? (
            <label className="v1-field">
              <span className="v1-label">Waar krijgen ze veel vragen over?</span>
              <input className="v1-input" value={v.haakje} onChange={(e) => zet('haakje', e.target.value)} placeholder="planning en beschikbaarheid" />
              <span className="v1-hint">In hun woorden, uit het gesprek. Leeg laten mag.</span>
            </label>
          ) : null}
          {v.situatie === 'test' ? (
            <label className="v1-field">
              <span className="v1-label">Wanneer staat de testversie klaar?</span>
              <input className="v1-input" value={v.termijn} onChange={(e) => zet('termijn', e.target.value)} />
            </label>
          ) : null}
          {v.situatie === 'klaar' ? (
            <label className="v1-field">
              <span className="v1-label">Link naar hun testversie</span>
              <input className={`v1-input ${mist.has('link') ? 'ld-mist' : ''}`} value={v.link} onChange={(e) => zet('link', e.target.value)} placeholder="https://…" />
            </label>
          ) : null}
          <label className="v1-field">
            <span className="v1-label">Eigen zin (optioneel)</span>
            <input className="v1-input" value={v.eigen} onChange={(e) => zet('eigen', e.target.value)} placeholder="Succes met de verbouwing van de showroom." />
          </label>
          <label className="v1-field">
            <span className="v1-label">P.S. (optioneel)</span>
            <input className="v1-input" value={v.ps} onChange={(e) => zet('ps', e.target.value)} placeholder="Mooie projectfoto's op jullie site trouwens." />
          </label>
          <label className="v1-field">
            <span className="v1-label">E-mailadres ontvanger</span>
            <input className={`v1-input ${aan && !aanOk ? 'ld-fout' : ''}`} list={`mails-${lead.id}`} value={aan} onChange={(e) => setAan(e.target.value)} placeholder="jan@bedrijf.nl" />
            <datalist id={`mails-${lead.id}`}>
              {lead.emails_gevonden.map((m) => <option key={m} value={m} />)}
            </datalist>
            {aan && !aanOk ? <span className="v1-hint" style={{ color: 'var(--v1-danger)' }}>Dit adres klopt niet.</span> : null}
          </label>
        </form>

        <div className="ld-mail-rechts">
          <div className="ld-mail-balk">
            <div><span className="v1-hint">Onderwerp</span><div><b>{mail?.onderwerp}</b></div></div>
            {bewerkt ? (
              <p className="ld-melding">
                <span>Je hebt de mail zelf aangepast. Velden links worden niet meer verwerkt.</span>
                <Button size="sm" variant="secondary" onClick={() => setBewerkt(false)}>Opnieuw opbouwen</Button>
              </p>
            ) : null}
            {fase === 'maken' ? (
              <>
                <Button block disabled={!kanKopieren} onClick={kopieer}>
                  {kanKopieren ? 'Kopieer mail' : `Vul eerst in: ${mail?.ontbreekt.map((m) => m.label).join(', ')}`}
                </Button>
                <p className="v1-hint">{v.situatie === 'herinnering' ? TIP_HERINNERING : TIP_STANDAARD}</p>
              </>
            ) : (
              <>
                <Button block variant="secondary" disabled={!aanOk} onClick={openOutlook}>Open Outlook ({aan || 'geen adres'})</Button>
                <p className="v1-hint">Plak in Outlook met Ctrl+V en verstuur. Daarna:</p>
                <div className="ld-dialoog-voet" style={{ justifyContent: 'flex-start' }}>
                  <Button loading={bezig} onClick={bevestig}>Verstuurd</Button>
                  <Button variant="secondary" onClick={() => setFase('maken')}>Nog niet, terug</Button>
                </div>
              </>
            )}
            <div className="ld-chips">
              <button type="button" className="ld-chip" aria-pressed={!smal} onClick={() => setSmal(false)}>Computer</button>
              <button type="button" className="ld-chip" aria-pressed={smal} onClick={() => setSmal(true)}>Telefoon</button>
              <Button size="sm" variant="ghost" onClick={() => onKlaar(false)} style={{ marginLeft: 'auto' }}>Sluiten zonder mail</Button>
            </div>
          </div>
          <div className="ld-mail-voorbeeld" data-smal={smal ? '' : undefined}>
            <div ref={mailRef} contentEditable suppressContentEditableWarning spellCheck onInput={() => setBewerkt(true)} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

Opmerking: de HTML in het voorbeeld komt uit `bouwOpvolgmail()`, die alle vrije tekst escapet (Task 5). Daarom mag `innerHTML` hier.

- [ ] **Step 2: Typecheck en commit** — `feat(leads): mail-pop-up (ingebouwde opvolgmail-maker)`

---

### Task 15: Belmodus

**Files:**
- Create: `app/v1/leads/bellen/page.tsx`
- Create: `app/v1/leads/_ui/belmodus.tsx`
- Create: `app/v1/leads/_ui/uitkomst-dialogen.tsx`
- Create: `app/v1/leads/_ui/lead-velden.tsx`

- [ ] **Step 1: `lead-velden.tsx`** (bewerkbare velden; opslaan bij verlaten van het veld; gebruikt in belmodus én detail)

```tsx
'use client';

import { useState } from 'react';
import { useToast } from '@/app/v1/_ui/toast';
import type { BewerkbaarVeld, Lead } from '@/lib/leads/types';
import { werkVeldenBijAction } from '../actions';

type VeldDef = { veld: BewerkbaarVeld; label: string; meerregelig?: boolean; placeholder?: string };

export const BEL_VELDEN: VeldDef[] = [
  { veld: 'contactpersoon', label: 'Contactpersoon', placeholder: 'Naam eigenaar' },
  { veld: 'haakje', label: 'Haakje / compliment', placeholder: 'Waar ze veel vragen over krijgen, iets moois op hun site' },
  { veld: 'notitie', label: 'Notitie', meerregelig: true },
];

export const ALLE_VELDEN: VeldDef[] = [
  { veld: 'bedrijfsnaam', label: 'Bedrijfsnaam' },
  { veld: 'website_url', label: 'Website' },
  { veld: 'telefoon', label: 'Telefoon' },
  { veld: 'email', label: 'E-mail' },
  { veld: 'niche', label: 'Branche' },
  { veld: 'plaats', label: 'Plaats' },
  ...BEL_VELDEN,
];

export function LeadVelden({ lead, velden, onOpgeslagen }: { lead: Lead; velden: VeldDef[]; onOpgeslagen?: (l: Lead) => void }) {
  const toast = useToast();
  const [waarden, setWaarden] = useState<Record<string, string>>(() =>
    Object.fromEntries(velden.map((v) => [v.veld, String(lead[v.veld] ?? '')])),
  );
  const [vorm, setVorm] = useState(lead.aanspreekvorm);

  async function bewaar(veld: BewerkbaarVeld, waarde: string) {
    if (waarde === String(lead[veld] ?? '')) return;
    const r = await werkVeldenBijAction(lead.id, { [veld]: waarde });
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    onOpgeslagen?.(r.lead);
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {velden.map((v) => (
        <label key={v.veld} className="v1-field">
          <span className="v1-label">{v.label}</span>
          {v.meerregelig ? (
            <textarea
              className="v1-input"
              rows={3}
              value={waarden[v.veld]}
              placeholder={v.placeholder}
              onChange={(e) => setWaarden((w) => ({ ...w, [v.veld]: e.target.value }))}
              onBlur={(e) => bewaar(v.veld, e.target.value)}
            />
          ) : (
            <input
              className="v1-input"
              value={waarden[v.veld]}
              placeholder={v.placeholder}
              onChange={(e) => setWaarden((w) => ({ ...w, [v.veld]: e.target.value }))}
              onBlur={(e) => bewaar(v.veld, e.target.value)}
            />
          )}
        </label>
      ))}
      <div className="v1-field">
        <span className="v1-label">Aanspreken met</span>
        <div className="ld-chips">
          {(['je', 'u'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className="ld-chip"
              aria-pressed={vorm === f}
              onClick={() => {
                setVorm(f);
                bewaar('aanspreekvorm', f);
              }}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `uitkomst-dialogen.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/app/v1/_ui/button';
import { Chips, Dialoog } from './dialoog';
import { BEZWAREN, BEZWAAR_LABEL, NIET_BELLEN_REDENEN, NIET_BELLEN_LABEL, type Bezwaar, type NietBellenReden } from '@/lib/leads/types';
import type { UitkomstOpties } from '@/lib/leads/volgende-stand';
import { amsDelen, amsTijdstip, plusMaandenOm, plusWerkdagenOm } from '@/lib/leads/werkdagen';
import { maakIcs } from '@/lib/leads/ics';

export type DialoogSoort = 'niet_opgenomen_laatste' | 'terugbellen' | 'interesse' | 'geen_interesse' | 'niet_bellen' | null;

/** "2026-10-19T14:00" (datetime-local, Amsterdam) ↔ ISO */
function naarLokaal(d: Date): string {
  const p = amsDelen(d);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.jaar}-${z(p.maand)}-${z(p.dag)}T${z(p.uur)}:${z(p.minuut)}`;
}
function vanLokaal(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return amsTijdstip(+m[1], +m[2], +m[3], +m[4], +m[5]).toISOString();
}

export function UitkomstDialogen({
  soort,
  bedrijfsnaam,
  telefoonTekst,
  notitie,
  leadId,
  onSluit,
  onKies,
}: {
  soort: DialoogSoort;
  bedrijfsnaam: string;
  telefoonTekst: string;
  notitie: string | null;
  leadId: string;
  onSluit: () => void;
  onKies: (o: UitkomstOpties) => void;
}) {
  const nu = new Date();
  const [moment, setMoment] = useState(naarLokaal(plusWerkdagenOm(nu, 1, 10)));
  const [terugNotitie, setTerugNotitie] = useState('');
  const [mail, setMail] = useState(true);
  const [km, setKm] = useState(false);
  const [kmMoment, setKmMoment] = useState(naarLokaal(plusWerkdagenOm(nu, 2, 10)));
  const [bezwaar, setBezwaar] = useState<Bezwaar | null>(null);
  const [reden, setReden] = useState<NietBellenReden | null>(null);

  const snel: { label: string; op: Date }[] = [
    { label: 'Over 2 uur', op: new Date(nu.getTime() + 2 * 3600_000) },
    { label: 'Morgen', op: plusWerkdagenOm(nu, 1, 10) },
    { label: 'Volgende week', op: plusWerkdagenOm(nu, 5, 10) },
    { label: 'Over 3 maanden', op: plusMaandenOm(nu, 3, 10) },
  ];

  function downloadIcs() {
    const op = vanLokaal(kmMoment);
    if (!op) return;
    const ics = maakIcs({
      uid: `${leadId}-${op}`,
      start: new Date(op),
      duurMinuten: 30,
      titel: `Kennismaking ${bedrijfsnaam}`,
      beschrijving: `Tel: ${telefoonTekst}${notitie ? `\nNotitie: ${notitie}` : ''}`,
    });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kennismaking-${bedrijfsnaam.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Dialoog
        open={soort === 'niet_opgenomen_laatste'}
        titel="Derde keer niet opgenomen"
        onSluit={onSluit}
        voet={
          <>
            <Button variant="secondary" onClick={() => onKies({ uitkomst: 'niet_opgenomen', naDerde: 'archief' })}>Archiveren</Button>
            <Button onClick={() => onKies({ uitkomst: 'niet_opgenomen', naDerde: 'mail' })}>Mail sturen</Button>
          </>
        }
      >
        <p>Drie keer geprobeerd. Een mail sturen of deze lead archiveren?</p>
      </Dialoog>

      <Dialoog
        open={soort === 'terugbellen'}
        titel="Terugbellen"
        onSluit={onSluit}
        voet={
          <Button
            onClick={() => {
              const op = vanLokaal(moment);
              if (op) onKies({ uitkomst: 'terugbellen', op, notitie: terugNotitie });
            }}
          >
            Opslaan
          </Button>
        }
      >
        <div className="ld-chips">
          {snel.map((s) => (
            <button key={s.label} type="button" className="ld-chip" aria-pressed={moment === naarLokaal(s.op)} onClick={() => setMoment(naarLokaal(s.op))}>
              {s.label}
            </button>
          ))}
        </div>
        <label className="v1-field">
          <span className="v1-label">Moment</span>
          <input className="v1-input" type="datetime-local" value={moment} onChange={(e) => setMoment(e.target.value)} />
        </label>
        <label className="v1-field">
          <span className="v1-label">Notitie</span>
          <input className="v1-input" value={terugNotitie} onChange={(e) => setTerugNotitie(e.target.value)} placeholder="Vraag naar Jan, na 14:00" />
        </label>
      </Dialoog>

      <Dialoog
        open={soort === 'interesse'}
        titel="Interesse"
        onSluit={onSluit}
        voet={
          <Button
            disabled={!mail && !km}
            onClick={() => onKies({ uitkomst: 'interesse', mail, kennismakingOp: km ? vanLokaal(kmMoment) : null })}
          >
            Opslaan
          </Button>
        }
      >
        <label className="v1-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={mail} onChange={(e) => setMail(e.target.checked)} /> Mail sturen
        </label>
        <label className="v1-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={km} onChange={(e) => setKm(e.target.checked)} /> Kennismaking gepland
        </label>
        {km ? (
          <>
            <label className="v1-field">
              <span className="v1-label">Wanneer</span>
              <input className="v1-input" type="datetime-local" value={kmMoment} onChange={(e) => setKmMoment(e.target.value)} />
            </label>
            <Button variant="secondary" size="sm" onClick={downloadIcs}>Zet in agenda (.ics)</Button>
          </>
        ) : null}
      </Dialoog>

      <Dialoog
        open={soort === 'geen_interesse'}
        titel="Geen interesse"
        onSluit={onSluit}
        voet={
          <>
            <Button variant="secondary" onClick={() => onKies({ uitkomst: 'geen_interesse', bezwaar, opnieuwOver3Maanden: true })}>Over 3 maanden opnieuw</Button>
            <Button onClick={() => onKies({ uitkomst: 'geen_interesse', bezwaar, opnieuwOver3Maanden: false })}>Weg</Button>
          </>
        }
      >
        <p className="v1-hint">Waarom? (optioneel)</p>
        <Chips label="Bezwaar" opties={BEZWAREN.map((b) => ({ id: b, label: BEZWAAR_LABEL[b] }))} waarde={bezwaar} onKies={setBezwaar} />
      </Dialoog>

      <Dialoog
        open={soort === 'niet_bellen'}
        titel="Niet bellen"
        onSluit={onSluit}
        voet={<Button disabled={!reden} onClick={() => reden && onKies({ uitkomst: 'niet_bellen', reden })}>Opslaan</Button>}
      >
        <Chips label="Reden" opties={NIET_BELLEN_REDENEN.map((r) => ({ id: r, label: NIET_BELLEN_LABEL[r] }))} waarde={reden} onKies={setReden} />
      </Dialoog>
    </>
  );
}
```

- [ ] **Step 3: `belmodus.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import type { Afzender, Lead, OpvolgSituatie } from '@/lib/leads/types';
import { isLaatstePoging, type UitkomstOpties } from '@/lib/leads/volgende-stand';
import { telLink, toonTelefoon } from '@/lib/leads/normaliseren';
import {
  claimLeadAction,
  geefVrijAction,
  ongedaanAction,
  overslaanAction,
  uitkomstAction,
  verlengClaimAction,
  volgendeLeadAction,
  type BelKaart,
} from '../actions';
import { TelQr } from './qr';
import { Belscript } from './belscript';
import { Tijdlijn } from './tijdlijn';
import { LeadLabels } from './labels';
import { LeadVelden, BEL_VELDEN } from './lead-velden';
import { UitkomstDialogen, type DialoogSoort } from './uitkomst-dialogen';
import { MailPopup } from './mail-popup';

type Focus = { niche: string | null; plaats: string | null };

export function Belmodus({
  afzender,
  niches,
  plaatsen,
  beginFocus,
  beginLeadId,
}: {
  afzender: Afzender | null;
  niches: string[];
  plaatsen: string[];
  beginFocus: Focus;
  beginLeadId: string | null;
}) {
  const toast = useToast();
  const [focus, setFocus] = useState<Focus>(beginFocus);
  const [kaart, setKaart] = useState<BelKaart | null>(null);
  const [leeg, setLeeg] = useState(false);
  const [laden, setLaden] = useState(true);
  const [dialoog, setDialoog] = useState<DialoogSoort>(null);
  const [mail, setMail] = useState<{ lead: Lead; situatie: OpvolgSituatie } | null>(null);
  const [ongedaan, setOngedaan] = useState<{ id: string; tekst: string } | null>(null);
  const ongedaanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voicemail, setVoicemail] = useState(false);

  const laadVolgende = useCallback(
    async (f: Focus) => {
      setLaden(true);
      const r = await volgendeLeadAction(f);
      setLaden(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setKaart(r.kaart);
      setLeeg(r.kaart === null);
      setVoicemail(false);
    },
    [toast],
  );

  // start: een specifieke lead (?lead=…) of de volgende uit de wachtrij
  useEffect(() => {
    (async () => {
      if (beginLeadId) {
        const r = await claimLeadAction(beginLeadId);
        if (r.ok && r.kaart) {
          setKaart(r.kaart);
          setLaden(false);
          return;
        }
        toast.error(r.ok ? 'Een ander is deze lead nu aan het bellen.' : r.error);
      }
      await laadVolgende(beginFocus);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // claim verlengen zolang de pagina zichtbaar is
  const leadId = kaart?.lead.id;
  useEffect(() => {
    if (!leadId) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void verlengClaimAction(leadId);
    }, 120_000);
    const weg = () => void geefVrijAction(leadId);
    window.addEventListener('pagehide', weg);
    return () => {
      clearInterval(t);
      window.removeEventListener('pagehide', weg);
    };
  }, [leadId]);

  function toonOngedaan(id: string, tekst: string) {
    if (ongedaanTimer.current) clearTimeout(ongedaanTimer.current);
    setOngedaan({ id, tekst });
    ongedaanTimer.current = setTimeout(() => setOngedaan(null), 10_000);
  }

  async function kies(o: UitkomstOpties) {
    if (!kaart) return;
    setDialoog(null);
    const opties = o.uitkomst === 'niet_opgenomen' ? { ...o, voicemail } : o;
    const r = await uitkomstAction(kaart.lead.id, opties);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toonOngedaan(r.activiteitId, `${kaart.lead.bedrijfsnaam}: opgeslagen`);
    if (r.opentMail) {
      setMail({ lead: r.lead, situatie: r.opentMail });
      return;
    }
    await laadVolgende(focus);
  }

  function knop(u: 'niet_opgenomen' | 'terugbellen' | 'wil_mail' | 'interesse' | 'geen_interesse' | 'niet_bellen') {
    if (!kaart || mail) return;
    if (u === 'niet_opgenomen') {
      if (isLaatstePoging(kaart.lead)) setDialoog('niet_opgenomen_laatste');
      else void kies({ uitkomst: 'niet_opgenomen' });
    } else if (u === 'wil_mail') void kies({ uitkomst: 'wil_mail' });
    else setDialoog(u);
  }

  async function overslaan() {
    if (!kaart) return;
    const r = await overslaanAction(kaart.lead.id);
    if (!r.ok) toast.error(r.error);
    await laadVolgende(focus);
  }

  async function maakOngedaan() {
    if (!ongedaan) return;
    const id = ongedaan.id;
    setOngedaan(null);
    setMail(null);
    if (kaart) await geefVrijAction(kaart.lead.id);
    const r = await ongedaanAction(id);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success('Ongedaan gemaakt.');
    setKaart(r.kaart);
    setLeeg(r.kaart === null);
  }

  // toetsen 1-6, S, Ctrl+Z
  useEffect(() => {
    function toets(e: KeyboardEvent) {
      const doel = e.target as HTMLElement;
      if (doel.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (ongedaan) {
          e.preventDefault();
          void maakOngedaan();
        }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const map: Record<string, Parameters<typeof knop>[0]> = {
        '1': 'niet_opgenomen',
        '2': 'terugbellen',
        '3': 'wil_mail',
        '4': 'interesse',
        '5': 'geen_interesse',
        '6': 'niet_bellen',
      };
      if (map[e.key]) {
        e.preventDefault();
        knop(map[e.key]);
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        void overslaan();
      }
    }
    window.addEventListener('keydown', toets);
    return () => window.removeEventListener('keydown', toets);
  });

  const focusKiezer = (
    <div className="ld-balk">
      <select className="v1-input" value={focus.niche ?? ''} onChange={(e) => setFocus((f) => ({ ...f, niche: e.target.value || null }))} aria-label="Branche">
        <option value="">Alle branches</option>
        {niches.map((n) => <option key={n}>{n}</option>)}
      </select>
      <select className="v1-input" value={focus.plaats ?? ''} onChange={(e) => setFocus((f) => ({ ...f, plaats: e.target.value || null }))} aria-label="Plaats">
        <option value="">Alle plaatsen</option>
        {plaatsen.map((p) => <option key={p}>{p}</option>)}
      </select>
      <Button variant="secondary" size="sm" onClick={async () => { if (kaart) await geefVrijAction(kaart.lead.id); await laadVolgende(focus); }}>
        Focus toepassen
      </Button>
      {kaart ? (
        <span className="ld-teller" style={{ marginLeft: 'auto' }}>
          <span>Vandaag <b>{kaart.teller.gebeld}</b> gebeld</span>
          <span><b>{kaart.teller.opgenomen}</b> opgenomen</span>
          <span><b>{kaart.teller.interesse}</b> interesse</span>
        </span>
      ) : null}
    </div>
  );

  if (laden && !kaart) return <>{focusKiezer}<p className="ld-leeg">Volgende lead ophalen…</p></>;
  if (leeg || !kaart) {
    return (
      <>
        {focusKiezer}
        <div className="ld-kaart ld-leeg">
          <h2>Niets meer te bellen voor deze focus</h2>
          <p>Kijk bij <Link href="/v1/leads?tab=terugbellen">Terugbellen</Link> of <Link href="/v1/leads?tab=opvolgen">Opvolgen</Link>, of kies een andere focus.</p>
        </div>
      </>
    );
  }

  const l = kaart.lead;
  return (
    <>
      {focusKiezer}
      <div className="ld-bel">
        <section className="ld-kaart" aria-label="Bedrijf">
          <div>
            <h1 className="ld-bedrijf">{l.bedrijfsnaam}</h1>
            <span className="ld-sub">{[l.niche, l.plaats].filter(Boolean).join(' · ')}</span>
            <div><LeadLabels lead={l} /></div>
          </div>
          {l.website_url ? (
            <a className="v1-btn v1-btn--secondary v1-btn--sm" href={l.website_url} target="_blank" rel="noopener noreferrer">Website openen ↗</a>
          ) : null}
          <LeadVelden key={l.id} lead={l} velden={BEL_VELDEN} onOpgeslagen={(nieuw) => setKaart((k) => (k ? { ...k, lead: nieuw } : k))} />
          <Belscript />
        </section>

        <section className="ld-kaart" aria-label="Bellen" style={{ textAlign: 'center' }}>
          {l.telefoon ? (
            <>
              <a className="ld-nummer" href={telLink(l.telefoon)}>{toonTelefoon(l.telefoon)}</a>
              <TelQr tel={telLink(l.telefoon)} />
              <p className="ld-qr-tip">Scan met je telefoon om te bellen</p>
            </>
          ) : (
            <p>Geen telefoonnummer. Vul het in op de detailpagina.</p>
          )}
          {l.telefoons_extra.length ? (
            <div className="ld-sub">Ook: {l.telefoons_extra.map((t) => <a key={t} href={telLink(t)} style={{ marginRight: 8 }}>{toonTelefoon(t)}</a>)}</div>
          ) : null}
          {l.email ? <div className="ld-sub">{l.email}</div> : null}
          <div className="ld-sub">Poging {l.pogingen_niet_opgenomen + 1} van 3{l.volgende_actie_notitie ? ` · ${l.volgende_actie_notitie}` : ''}</div>
          <label className="ld-sub" style={{ display: 'inline-flex', gap: 6, justifyContent: 'center' }}>
            <input type="checkbox" checked={voicemail} onChange={(e) => setVoicemail(e.target.checked)} /> Voicemail ingesproken
          </label>
          <div className="ld-knoppen">
            <button type="button" className="ld-uitkomst" onClick={() => knop('niet_opgenomen')}><kbd>1</kbd>Niet opgenomen</button>
            <button type="button" className="ld-uitkomst" onClick={() => knop('terugbellen')}><kbd>2</kbd>Terugbellen</button>
            <button type="button" className="ld-uitkomst" onClick={() => knop('wil_mail')}><kbd>3</kbd>Wil een mail</button>
            <button type="button" className="ld-uitkomst" data-tone="ok" onClick={() => knop('interesse')}><kbd>4</kbd>Interesse</button>
            <button type="button" className="ld-uitkomst" onClick={() => knop('geen_interesse')}><kbd>5</kbd>Geen interesse</button>
            <button type="button" className="ld-uitkomst" data-tone="danger" onClick={() => knop('niet_bellen')}><kbd>6</kbd>Niet bellen</button>
          </div>
          <Button variant="ghost" size="sm" onClick={overslaan}>Overslaan (S)</Button>
        </section>

        <section className="ld-kaart" aria-label="Geschiedenis">
          <h2 style={{ margin: 0, fontSize: 16 }}>Geschiedenis</h2>
          <Tijdlijn items={kaart.tijdlijn} />
          <div>
            <h3 style={{ margin: '8px 0 4px', fontSize: 14 }}>
              Score {l.score ?? '–'}{l.score_max ? `/${l.score_max}` : ''} {l.score_voorlopig ? <span className="ld-label">voorlopig</span> : null}
            </h3>
            <ul className="v1-hint" style={{ margin: 0, paddingLeft: 16 }}>
              {l.score_redenen.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
          <Link href={`/v1/leads/${l.id}`} target="_blank">Alle details ↗</Link>
        </section>
      </div>

      <UitkomstDialogen
        key={l.id}
        soort={dialoog}
        bedrijfsnaam={l.bedrijfsnaam}
        telefoonTekst={toonTelefoon(l.telefoon)}
        notitie={l.notitie}
        leadId={l.id}
        onSluit={() => setDialoog(null)}
        onKies={kies}
      />

      {mail ? (
        <MailPopup
          lead={mail.lead}
          afzender={afzender}
          situatie={mail.situatie}
          onKlaar={async () => {
            const id = mail.lead.id;
            setMail(null);
            await geefVrijAction(id);
            await laadVolgende(focus);
          }}
        />
      ) : null}

      {ongedaan ? (
        <div className="ld-ongedaan" role="status">
          <span>{ongedaan.tekst}</span>
          <Button size="sm" variant="secondary" onClick={maakOngedaan}>Ongedaan maken (Ctrl+Z)</Button>
        </div>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: `bellen/page.tsx`**

```tsx
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { filterOpties, haalAfzender } from '@/lib/leads/server/db';
import { Belmodus } from '../_ui/belmodus';

export default async function BellenPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireJorionAdmin();
  const db = getV1ServiceRoleClient();
  const sp = await searchParams;
  const [{ niches, plaatsen }, afzender] = await Promise.all([filterOpties(db), haalAfzender(db, user.id)]);
  return (
    <Belmodus
      afzender={afzender}
      niches={niches}
      plaatsen={plaatsen}
      beginFocus={{ niche: sp.niche ?? null, plaats: sp.plaats ?? null }}
      beginLeadId={sp.lead ?? null}
    />
  );
}
```

Controleer in `node_modules/next/dist/docs/` dat `searchParams` in Next 16 een Promise is (zo gebruikt in de bestaande V1-pagina's: `grep -rn "searchParams: Promise" app/v1 | head -3`).

- [ ] **Step 5: Typecheck en commit** — `feat(leads): belmodus`

---

### Task 16: Overzicht, detail en instellingen

**Files:**
- Create: `app/v1/leads/page.tsx`
- Create: `app/v1/leads/_ui/lead-tabel.tsx`
- Create: `app/v1/leads/_ui/nieuwe-lead.tsx`
- Create: `app/v1/leads/_ui/status-knoppen.tsx`
- Create: `app/v1/leads/[id]/page.tsx`
- Create: `app/v1/leads/_ui/detail-mail.tsx`
- Create: `app/v1/leads/instellingen/page.tsx`
- Create: `app/v1/leads/_ui/afzender-form.tsx`

- [ ] **Step 1: `page.tsx` (overzicht)**

```tsx
import Link from 'next/link';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { LinkTabs } from '@/app/v1/_ui/tabs';
import { buttonClass } from '@/app/v1/_ui/button';
import { filterOpties, lijstLeads, misschienOpschonen, tellers, TABS, PAGINA_GROOTTE, type Tab, type LijstFilter } from '@/lib/leads/server/db';
import { LeadTabel } from './_ui/lead-tabel';
import { NieuweLead } from './_ui/nieuwe-lead';

const TAB_LABEL: Record<Tab, string> = {
  vandaag: 'Vandaag bellen',
  terugbellen: 'Terugbellen',
  opvolgen: 'Opvolgen',
  kansen: 'Kansen',
  chatbot: 'Heeft chatbot',
  archief: 'Archief',
};

const SORTS = ['bedrijfsnaam', 'score', 'volgende_actie_op', 'laatste_poging_op', 'plaats'] as const;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireJorionAdmin();
  const db = getV1ServiceRoleClient();
  const sp = await searchParams;
  const tab = (TABS as string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'vandaag';
  const filter: LijstFilter = {
    tab,
    zoek: sp.q || undefined,
    niche: sp.niche || undefined,
    plaats: sp.plaats || undefined,
    minScore: sp.min ? Number(sp.min) : undefined,
    reden: sp.reden || undefined,
    sort: (SORTS as readonly string[]).includes(sp.sort ?? '') ? (sp.sort as LijstFilter['sort']) : undefined,
    richting: sp.dir === 'asc' || sp.dir === 'desc' ? sp.dir : undefined,
    pagina: sp.p ? Number(sp.p) : 1,
  };
  await misschienOpschonen(db);
  const [lijst, aantallen, opties] = await Promise.all([lijstLeads(db, filter), tellers(db), filterOpties(db)]);
  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) u.set(k, v);
    return `/v1/leads?${u.toString()}`;
  };
  const paginas = Math.max(1, Math.ceil(lijst.totaal / PAGINA_GROOTTE));

  return (
    <>
      <PageHeader
        title="Leads"
        description="Wie bel je vandaag, wie moet je terugbellen en wie wacht op een mail."
        actions={
          <>
            <NieuweLead />
            <Link className={buttonClass()} href={`/v1/leads/bellen${sp.niche || sp.plaats ? `?${new URLSearchParams({ ...(sp.niche ? { niche: sp.niche } : {}), ...(sp.plaats ? { plaats: sp.plaats } : {}) })}` : ''}`}>
              Start bellen
            </Link>
          </>
        }
      />
      <LinkTabs
        label="Lijsten"
        active={tab}
        items={[
          ...TABS.map((t) => ({ id: t, label: TAB_LABEL[t], count: aantallen[t], href: qs({ tab: t, p: undefined, reden: undefined }) })),
          { id: 'inzicht', label: 'Inzicht', href: '/v1/leads/inzicht' },
        ]}
      />
      <form className="ld-balk" action="/v1/leads">
        <input type="hidden" name="tab" value={tab} />
        <input className="v1-input ld-balk-zoek" name="q" defaultValue={sp.q ?? ''} placeholder="Zoek op naam, website of telefoon" />
        <select className="v1-input" name="niche" defaultValue={sp.niche ?? ''} aria-label="Branche">
          <option value="">Alle branches</option>
          {opties.niches.map((n) => <option key={n}>{n}</option>)}
        </select>
        <select className="v1-input" name="plaats" defaultValue={sp.plaats ?? ''} aria-label="Plaats">
          <option value="">Alle plaatsen</option>
          {opties.plaatsen.map((p) => <option key={p}>{p}</option>)}
        </select>
        <input className="v1-input" name="min" type="number" min={0} max={20} defaultValue={sp.min ?? ''} placeholder="Min. score" style={{ width: 110 }} />
        {tab === 'archief' ? (
          <input className="v1-input" name="reden" defaultValue={sp.reden ?? ''} placeholder="Reden" />
        ) : null}
        <button className={buttonClass({ variant: 'secondary', size: 'sm' })} type="submit">Filter</button>
        <Link className={buttonClass({ variant: 'ghost', size: 'sm' })} href={`/v1/leads?tab=${tab}`}>Wissen</Link>
      </form>
      <LeadTabel leads={lijst.leads} tab={tab} sortHref={(s) => qs({ sort: s, dir: filter.sort === s && filter.richting !== 'desc' ? 'desc' : 'asc', p: undefined })} />
      <div className="ld-paginering">
        <span>{lijst.totaal} leads · pagina {lijst.pagina} van {paginas}</span>
        {lijst.pagina > 1 ? <Link href={qs({ p: String(lijst.pagina - 1) })}>Vorige</Link> : null}
        {lijst.pagina < paginas ? <Link href={qs({ p: String(lijst.pagina + 1) })}>Volgende</Link> : null}
      </div>
    </>
  );
}
```

- [ ] **Step 2: `lead-tabel.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable, NumCell } from '@/app/v1/admin/_ui/data-table';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { STATUS_LABEL, type Lead } from '@/lib/leads/types';
import { toonTelefoon, telLink } from '@/lib/leads/normaliseren';
import { toonMoment } from '@/lib/leads/werkdagen';
import type { Tab } from '@/lib/leads/server/db';
import { bulkArchiveerAction } from '../actions';
import { LeadLabels } from './labels';
import { StatusKnoppen } from './status-knoppen';

function volgendeActie(l: Lead): string {
  if (l.status === 'terugbellen' && l.volgende_actie_op) return `${toonMoment(l.volgende_actie_op)} terugbellen`;
  if (l.status === 'opvolgen') return l.opvolgmail_gestuurd_op ? `nabellen ${toonMoment(l.volgende_actie_op)}` : 'mail nog sturen';
  if (l.status === 'kans' && l.kennismaking_op) return `kennismaking ${toonMoment(l.kennismaking_op)}`;
  if (l.volgende_actie_op) return toonMoment(l.volgende_actie_op);
  return STATUS_LABEL[l.status];
}

export function LeadTabel({ leads, tab, sortHref }: { leads: Lead[]; tab: Tab; sortHref: (s: string) => string }) {
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [bezig, setBezig] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const wissel = (id: string) => setGekozen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function archiveer() {
    setBezig(true);
    const r = await bulkArchiveerAction([...gekozen]);
    setBezig(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(`${r.aantal} leads gearchiveerd.`);
    setGekozen(new Set());
    router.refresh();
  }

  if (!leads.length) return <div className="ld-kaart ld-leeg">Niets in deze lijst.</div>;

  const S = ({ s, children }: { s: string; children: React.ReactNode }) => <Link href={sortHref(s)}>{children}</Link>;

  return (
    <>
      {gekozen.size ? (
        <div className="ld-bulk">
          <span>{gekozen.size} gekozen</span>
          <Button size="sm" loading={bezig} onClick={archiveer}>Archiveren</Button>
          <Button size="sm" variant="ghost" onClick={() => setGekozen(new Set())}>Selectie wissen</Button>
        </div>
      ) : null}
      <DataTable
        label="Leads"
        columns={[
          { label: <input type="checkbox" aria-label="Alles kiezen" checked={gekozen.size === leads.length} onChange={(e) => setGekozen(e.target.checked ? new Set(leads.map((l) => l.id)) : new Set())} />, width: '1%' },
          { label: <S s="bedrijfsnaam">Bedrijf</S> },
          { label: 'Branche' },
          { label: 'Telefoon' },
          { label: <S s="score">Score</S>, num: true },
          { label: <S s="volgende_actie_op">Volgende actie</S> },
          { label: <S s="laatste_poging_op">Laatste</S> },
          { label: 'Pogingen', num: true },
          { label: '', width: '1%' },
        ]}
      >
        {leads.map((l) => (
          <tr key={l.id}>
            <td><input type="checkbox" aria-label={`Kies ${l.bedrijfsnaam}`} checked={gekozen.has(l.id)} onChange={() => wissel(l.id)} /></td>
            <td>
              <Link className="ld-rij-link" href={`/v1/leads/${l.id}`}>{l.bedrijfsnaam}</Link>
              <span className="ld-sub">{l.plaats ?? ''}{l.domein ? ` · ${l.domein}` : ''}</span>
              <LeadLabels lead={l} />
            </td>
            <td>{l.niche ?? ''}</td>
            <td>{l.telefoon ? <a href={telLink(l.telefoon)}>{toonTelefoon(l.telefoon)}</a> : ''}</td>
            <NumCell>{l.score ?? '–'}</NumCell>
            <td>{volgendeActie(l)}{l.volgende_actie_notitie ? <span className="ld-sub">{l.volgende_actie_notitie}</span> : null}</td>
            <td>{l.laatste_poging_op ? toonMoment(l.laatste_poging_op) : ''}{tab === 'archief' && l.status_reden ? <span className="ld-sub">{l.status_reden}</span> : null}</td>
            <NumCell>{l.pogingen_niet_opgenomen}</NumCell>
            <td><StatusKnoppen lead={l} compact /></td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
```

- [ ] **Step 3: `status-knoppen.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import type { Lead } from '@/lib/leads/types';
import type { HandmatigeStatus } from '@/lib/leads/volgende-stand';
import { zetStatusAction } from '../actions';

export function StatusKnoppen({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();

  async function zet(naar: HandmatigeStatus, reden: string | null = null) {
    setBezig(naar);
    const r = await zetStatusAction(lead.id, naar, reden);
    setBezig(null);
    if (!r.ok) return toast.error(r.error);
    toast.success('Opgeslagen.');
    router.refresh();
  }

  const s = lead.status;
  const knoppen: { naar: HandmatigeStatus; label: string; reden?: string }[] = [];
  if (s === 'kans') knoppen.push({ naar: 'klant', label: 'Klant geworden' }, { naar: 'geen_interesse', label: 'Afgehaakt', reden: 'afgehaakt' });
  if (s === 'geen_interesse' || s === 'niet_bellen' || s === 'archief' || s === 'heeft_chatbot') knoppen.push({ naar: 'open', label: 'Terug naar open' });
  else knoppen.push({ naar: 'archief', label: 'Archiveren' });
  if (s !== 'niet_bellen') knoppen.push({ naar: 'niet_bellen', label: 'Niet bellen', reden: 'handmatig' });

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: compact ? 'nowrap' : 'wrap' }}>
      {s === 'open' || s === 'terugbellen' || s === 'opvolgen' ? (
        <Link className="v1-btn v1-btn--secondary v1-btn--sm" href={`/v1/leads/bellen?lead=${lead.id}`}>Bel nu</Link>
      ) : null}
      {knoppen.map((k) => (
        <Button key={k.naar} size="sm" variant="ghost" loading={bezig === k.naar} onClick={() => zet(k.naar, k.reden ?? null)}>
          {k.label}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: `nieuwe-lead.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import { Dialoog } from './dialoog';
import { nieuweLeadAction } from '../actions';

export function NieuweLead() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ bedrijfsnaam: '', website: '', telefoon: '', niche: '', plaats: '' });
  const [bezig, setBezig] = useState(false);
  const toast = useToast();
  const router = useRouter();

  async function opslaan() {
    setBezig(true);
    const r = await nieuweLeadAction(v);
    setBezig(false);
    if (!r.ok) return toast.error(r.error);
    setOpen(false);
    if (r.bestond) toast.error('Deze lead bestond al. Je ziet nu de bestaande.');
    else toast.success('Lead toegevoegd.');
    router.push(`/v1/leads/${r.id}`);
  }

  const veld = (k: keyof typeof v, label: string, placeholder = '') => (
    <label className="v1-field">
      <span className="v1-label">{label}</span>
      <input className="v1-input" value={v[k]} placeholder={placeholder} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
    </label>
  );

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>+ Lead</Button>
      <Dialoog open={open} titel="Lead toevoegen" onSluit={() => setOpen(false)} voet={<Button loading={bezig} onClick={opslaan}>Toevoegen</Button>}>
        {veld('bedrijfsnaam', 'Bedrijfsnaam')}
        {veld('website', 'Website', 'jansen-bouw.nl')}
        {veld('telefoon', 'Telefoon', '06 12345678')}
        {veld('niche', 'Branche', 'installateur')}
        {veld('plaats', 'Plaats', 'Ede')}
      </Dialoog>
    </>
  );
}
```

- [ ] **Step 5: `detail-mail.tsx`** (knop "Mail" op de detailpagina, opent de pop-up)

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/v1/_ui/button';
import type { Afzender, Lead, OpvolgSituatie } from '@/lib/leads/types';
import { MailPopup } from './mail-popup';

export function DetailMail({ lead, afzender }: { lead: Lead; afzender: Afzender | null }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const situatie: OpvolgSituatie = lead.opvolgmail_gestuurd_op ? 'herinnering' : lead.status === 'kans' && lead.kennismaking_op ? 'kennis' : 'info';
  return (
    <>
      <Button onClick={() => setOpen(true)}>Mail</Button>
      {open ? (
        <MailPopup
          lead={lead}
          afzender={afzender}
          situatie={situatie}
          onKlaar={(verstuurd) => {
            setOpen(false);
            if (verstuurd) router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
```

- [ ] **Step 6: `[id]/page.tsx`**

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { isAppError } from '@/lib/errors/app-error';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Panel } from '@/app/v1/_ui/panel';
import { haalActiviteiten, haalAfzender, haalLead } from '@/lib/leads/server/db';
import { STATUS_LABEL } from '@/lib/leads/types';
import { toonMoment } from '@/lib/leads/werkdagen';
import { LeadVelden, ALLE_VELDEN } from '../_ui/lead-velden';
import { Tijdlijn } from '../_ui/tijdlijn';
import { LeadLabels } from '../_ui/labels';
import { StatusKnoppen } from '../_ui/status-knoppen';
import { DetailMail } from '../_ui/detail-mail';

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireJorionAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = getV1ServiceRoleClient();
  let lead;
  try {
    lead = await haalLead(db, id);
  } catch (e) {
    if (isAppError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const [tijdlijn, afzender] = await Promise.all([haalActiviteiten(db, id), haalAfzender(db, user.id)]);

  return (
    <>
      <PageHeader
        title={lead.bedrijfsnaam}
        description={
          <>
            {STATUS_LABEL[lead.status]}
            {lead.volgende_actie_op ? ` · volgende actie ${toonMoment(lead.volgende_actie_op)}` : ''}
            {lead.kennismaking_op ? ` · kennismaking ${toonMoment(lead.kennismaking_op)}` : ''} <LeadLabels lead={lead} />
          </>
        }
        actions={
          <>
            <DetailMail lead={lead} afzender={afzender} />
            <StatusKnoppen lead={lead} />
          </>
        }
      />
      <div className="ld-raster">
        <Panel title="Gegevens" meta={lead.website_url ? <a href={lead.website_url} target="_blank" rel="noopener noreferrer">Website ↗</a> : null}>
          <div style={{ padding: 16 }}>
            <LeadVelden lead={lead} velden={ALLE_VELDEN} />
          </div>
        </Panel>
        <Panel title="Geschiedenis">
          <div style={{ padding: 16, display: 'grid', gap: 16 }}>
            <Tijdlijn items={tijdlijn} />
            <div className="v1-hint">
              Score {lead.score ?? '–'}{lead.score_max ? `/${lead.score_max}` : ''}{lead.score_voorlopig ? ' (voorlopig)' : ''} · Google {lead.google_rating ?? '–'} ({lead.google_reviews ?? 0} reviews) · {lead.platform ?? 'platform onbekend'} · {lead.woorden ?? '–'} woorden
              <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                {lead.score_redenen.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
            <Link href="/v1/leads">← Terug naar de lijst</Link>
          </div>
        </Panel>
      </div>
    </>
  );
}
```

Controleer of `Panel`-kinderen zelf padding hebben (`grep -n "v1-panel " app/v1/_ui/ui.css`); zo ja, haal de `padding: 16`-wrappers weg.

- [ ] **Step 7: `afzender-form.tsx` en `instellingen/page.tsx`**

```tsx
// app/v1/leads/_ui/afzender-form.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/app/v1/_ui/button';
import { useToast } from '@/app/v1/_ui/toast';
import type { Afzender } from '@/lib/leads/types';
import { bewaarAfzenderAction } from '../actions';

export function AfzenderForm({ begin }: { begin: Afzender }) {
  const [a, setA] = useState(begin);
  const [bezig, setBezig] = useState(false);
  const toast = useToast();
  const veld = (k: keyof Afzender, label: string, hint?: string) => (
    <label className="v1-field">
      <span className="v1-label">{label}</span>
      <input className="v1-input" value={a[k] ?? ''} onChange={(e) => setA((x) => ({ ...x, [k]: e.target.value || (k === 'fotoUrl' ? null : '') }))} />
      {hint ? <span className="v1-hint">{hint}</span> : null}
    </label>
  );
  return (
    <form
      className="ld-kaart"
      style={{ maxWidth: 560 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBezig(true);
        const r = await bewaarAfzenderAction(a);
        setBezig(false);
        if (r.ok) toast.success('Opgeslagen.');
        else toast.error(r.error);
      }}
    >
      {veld('naam', 'Volledige naam', 'Zo staat hij in de handtekening.')}
      {veld('voornaam', 'Voornaam', 'Onder "Groet,".')}
      {veld('functie', 'Functie')}
      {veld('telefoon', 'Telefoon')}
      {veld('email', 'E-mail')}
      {veld('fotoUrl', 'Foto (https-link, optioneel)', 'Bijvoorbeeld https://www.chatmanta.nl/mail/foto.png. Leeg = handtekening zonder foto.')}
      <div><Button type="submit" loading={bezig}>Opslaan</Button></div>
    </form>
  );
}
```

```tsx
// app/v1/leads/instellingen/page.tsx
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { haalAfzender } from '@/lib/leads/server/db';
import { AfzenderForm } from '../_ui/afzender-form';

export default async function InstellingenPage() {
  const user = await requireJorionAdmin();
  const db = getV1ServiceRoleClient();
  const afz = await haalAfzender(db, user.id);
  return (
    <>
      <PageHeader title="Instellingen" description="Je afzendergegevens voor de handtekening van de opvolgmail. Alleen jij gebruikt ze." />
      <AfzenderForm begin={afz ?? { naam: '', voornaam: '', functie: 'Oprichter', telefoon: '', email: user.email ?? '', fotoUrl: null }} />
    </>
  );
}
```

- [ ] **Step 8: Typecheck en commit** — `feat(leads): overzicht, detail en instellingen`

---

### Task 17: Inzicht (migratie 0033 + pagina)

**Files:**
- Create: `supabase/migrations-v1/0033_v1_leads_inzicht.sql`
- Create: `lib/leads/server/inzicht.ts`
- Create: `app/v1/leads/inzicht/page.tsx`

- [ ] **Step 1: Schrijf de migratie**

```sql
-- =============================================================================
-- Migration 0033 (V1) — leads_inzicht(): alle cijfers van /v1/leads/inzicht in
-- één ronde. Telt alleen activiteiten zonder ongedaan_op. Import-activiteiten
-- (soort 'import') tellen bewust niet mee: uitkomst onbekend, zou ratio's
-- vertekenen. Service-role only.
-- =============================================================================

create or replace function public.leads_inzicht(
  p_van  timestamptz,
  p_tot  timestamptz,
  p_user uuid default null
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with a as (
    select x.*
    from public.lead_activiteiten x
    where x.ongedaan_op is null
      and x.created_at >= p_van and x.created_at < p_tot
      and (p_user is null or x.user_id = p_user)
  ),
  b as (
    select a.*, l.niche, l.plaats,
           extract(isodow from a.created_at at time zone 'Europe/Amsterdam')::int as dow,
           extract(hour from a.created_at at time zone 'Europe/Amsterdam')::int as uur
    from a join public.leads l on l.id = a.lead_id
    where a.soort = 'belpoging'
  ),
  mails as (
    select a.lead_id, a.created_at from a where a.soort = 'mail'
  )
  select jsonb_build_object(
    'belpogingen',    (select count(*) from b),
    'bedrijven',      (select count(distinct lead_id) from b),
    'opgenomen',      (select count(*) from b where uitkomst <> 'niet_opgenomen'),
    'interesse',      (select count(*) from b where uitkomst = 'interesse'),
    'kennismakingen', (select count(*) from a where soort = 'kennismaking'),
    'klanten',        (select count(*) from a where soort = 'status' and details->>'naar' = 'klant'),
    'mails',          (select count(*) from mails),
    'mail_naar_kans', (
      select count(distinct m.lead_id) from mails m
      where exists (
        select 1 from public.lead_activiteiten k
        where k.lead_id = m.lead_id and k.ongedaan_op is null
          and k.created_at > m.created_at and k.created_at <= m.created_at + interval '7 days'
          and (k.soort = 'kennismaking' or (k.soort = 'belpoging' and k.uitkomst = 'interesse'))
      )
    ),
    'per_dag', coalesce((
      select jsonb_agg(jsonb_build_object('dag', dag, 'belletjes', n, 'opgenomen', o, 'interesse', i) order by dag)
      from (
        select (created_at at time zone 'Europe/Amsterdam')::date as dag,
               count(*) n,
               count(*) filter (where uitkomst <> 'niet_opgenomen') o,
               count(*) filter (where uitkomst = 'interesse') i
        from b group by 1
      ) d
    ), '[]'::jsonb),
    'heatmap', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'uur', uur, 'n', n, 'opgenomen', o))
      from (
        select dow, uur, count(*) n, count(*) filter (where uitkomst <> 'niet_opgenomen') o
        from b group by 1, 2
      ) h
    ), '[]'::jsonb),
    'per_niche', coalesce((
      select jsonb_agg(jsonb_build_object('naam', naam, 'belletjes', n, 'opgenomen', o, 'interesse', i, 'voorraad', v) order by n desc)
      from (
        select coalesce(bb.niche, 'onbekend') naam, count(*) n,
               count(*) filter (where uitkomst <> 'niet_opgenomen') o,
               count(*) filter (where uitkomst = 'interesse') i,
               (select count(*) from public.leads l2 where coalesce(l2.niche, 'onbekend') = coalesce(bb.niche, 'onbekend') and l2.status in ('open','terugbellen')) v
        from b bb group by 1
      ) x
    ), '[]'::jsonb),
    'per_plaats', coalesce((
      select jsonb_agg(jsonb_build_object('naam', naam, 'belletjes', n, 'opgenomen', o, 'interesse', i, 'voorraad', v) order by n desc)
      from (
        select coalesce(bb.plaats, 'onbekend') naam, count(*) n,
               count(*) filter (where uitkomst <> 'niet_opgenomen') o,
               count(*) filter (where uitkomst = 'interesse') i,
               (select count(*) from public.leads l2 where coalesce(l2.plaats, 'onbekend') = coalesce(bb.plaats, 'onbekend') and l2.status in ('open','terugbellen')) v
        from b bb group by 1
      ) x
    ), '[]'::jsonb),
    'bezwaren', coalesce((
      select jsonb_agg(jsonb_build_object('bezwaar', bezwaar, 'n', n) order by n desc)
      from (
        select details->>'bezwaar' bezwaar, count(*) n
        from b where uitkomst = 'geen_interesse' and details->>'bezwaar' is not null
        group by 1
      ) z
    ), '[]'::jsonb),
    'per_beller', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', user_id, 'belletjes', n, 'opgenomen', o, 'interesse', i, 'kennismakingen', k) order by n desc)
      from (
        select bb.user_id, count(*) n,
               count(*) filter (where uitkomst <> 'niet_opgenomen') o,
               count(*) filter (where uitkomst = 'interesse') i,
               (select count(*) from a a2 where a2.user_id = bb.user_id and a2.soort = 'kennismaking') k
        from b bb group by 1
      ) y
    ), '[]'::jsonb),
    'pijplijn', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) n from public.leads group by 1) p
    )
  );
$$;

revoke execute on function public.leads_inzicht(timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.leads_inzicht(timestamptz, timestamptz, uuid) to service_role;
```

- [ ] **Step 2: Akkoord vragen en draaien**

Bericht: "Migratie 0033 (alleen een leesfunctie voor het inzichtdashboard) staat klaar. Mag ik `npm run migrate:v1` draaien?" Na ja: `npm run migrate:v1`. Daarna `npm run leads:test-rls` uitbreiden is niet nodig; controleer wel met de SQL-check:

Run (via `npm run migrate:v1:status`): `0033_v1_leads_inzicht.sql` staat als toegepast.

- [ ] **Step 3: `lib/leads/server/inzicht.ts`**

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '@/lib/errors/app-error';
import { beginVanDag, beginVanMaand, beginVanMorgen, beginVanWeek } from '../werkdagen';
import { voornamen } from './db';

export type Periode = 'vandaag' | 'week' | 'maand' | 'alles';
export const PERIODES: { id: Periode; label: string }[] = [
  { id: 'vandaag', label: 'Vandaag' },
  { id: 'week', label: 'Deze week' },
  { id: 'maand', label: 'Deze maand' },
  { id: 'alles', label: 'Alles' },
];

type Rij = { naam: string; belletjes: number; opgenomen: number; interesse: number; voorraad: number };

export type Inzicht = {
  belpogingen: number;
  bedrijven: number;
  opgenomen: number;
  interesse: number;
  kennismakingen: number;
  klanten: number;
  mails: number;
  mail_naar_kans: number;
  per_dag: { dag: string; belletjes: number; opgenomen: number; interesse: number }[];
  heatmap: { dow: number; uur: number; n: number; opgenomen: number }[];
  per_niche: Rij[];
  per_plaats: Rij[];
  bezwaren: { bezwaar: string; n: number }[];
  per_beller: { user_id: string; naam?: string; belletjes: number; opgenomen: number; interesse: number; kennismakingen: number }[];
  pijplijn: Record<string, number>;
};

export function periodeGrenzen(p: Periode, nu = new Date()): { van: Date; tot: Date; vorigeVan: Date | null } {
  const tot = beginVanMorgen(nu);
  if (p === 'alles') return { van: new Date('2026-01-01T00:00:00Z'), tot, vorigeVan: null };
  const van = p === 'vandaag' ? beginVanDag(nu) : p === 'week' ? beginVanWeek(nu) : beginVanMaand(nu);
  const lengte = p === 'vandaag' ? 24 * 3600_000 : p === 'week' ? 7 * 24 * 3600_000 : null;
  const vorigeVan = lengte
    ? new Date(van.getTime() - lengte)
    : beginVanMaand(new Date(van.getTime() - 24 * 3600_000));
  return { van, tot, vorigeVan };
}

async function haal(db: SupabaseClient, van: Date, tot: Date, userId: string | null): Promise<Inzicht> {
  const { data, error } = await db.rpc('leads_inzicht', { p_van: van.toISOString(), p_tot: tot.toISOString(), p_user: userId });
  if (error) throw new AppError('INTERNAL', { message: `inzicht ophalen faalde: ${error.message}` });
  return data as Inzicht;
}

export async function haalInzicht(db: SupabaseClient, p: Periode, userId: string | null) {
  const g = periodeGrenzen(p);
  const [nu, vorige] = await Promise.all([
    haal(db, g.van, g.tot, userId),
    g.vorigeVan ? haal(db, g.vorigeVan, g.van, userId) : Promise.resolve(null),
  ]);
  const namen = await voornamen(db, nu.per_beller.map((b) => b.user_id));
  nu.per_beller = nu.per_beller.map((b) => ({ ...b, naam: namen.get(b.user_id) ?? 'onbekend' }));
  return { nu, vorige };
}

export async function bellers(db: SupabaseClient): Promise<{ id: string; naam: string }[]> {
  const { data } = await db.from('users').select('id, email, full_name').eq('is_jorion_admin', true);
  const ids = (data ?? []).map((u) => u.id as string);
  const namen = await voornamen(db, ids);
  return ids.map((id) => ({ id, naam: namen.get(id) ?? id }));
}

/** Percentage alleen bij genoeg data (spec: minimaal 10 belpogingen). */
export function pct(teller: number, noemer: number, minimum = 10): string {
  if (noemer < minimum) return '–';
  return `${Math.round((teller / noemer) * 100)}%`;
}
```

- [ ] **Step 4: `app/v1/leads/inzicht/page.tsx`**

Laad eerst de `dataviz`-skill (kleuren, licht/donker). Hergebruik `Metric`/`MetricGrid`, `LineChart` en `DataTable`; trechter, heatmap en staven zijn eenvoudige CSS (klassen uit Task 12).

```tsx
import { Fragment } from 'react';
import Link from 'next/link';
import { requireJorionAdmin } from '@/lib/auth';
import { getV1ServiceRoleClient } from '@/lib/supabase/v1/service-role';
import { PageHeader } from '@/app/v1/_ui/page-header';
import { Panel } from '@/app/v1/_ui/panel';
import { MetricGrid, Metric } from '@/app/v1/admin/_ui/metric';
import { LineChart } from '@/app/v1/admin/_ui/line-chart';
import { DataTable, NumCell } from '@/app/v1/admin/_ui/data-table';
import { haalInzicht, bellers, pct, PERIODES, type Periode, type Inzicht } from '@/lib/leads/server/inzicht';
import { BEZWAAR_LABEL, STATUS_LABEL, type Bezwaar, type LeadStatus } from '@/lib/leads/types';

function verschil(nu: number, vorige: number | undefined): string | undefined {
  if (vorige === undefined) return undefined;
  const d = nu - vorige;
  return d === 0 ? 'gelijk aan vorige periode' : `${d > 0 ? '+' : ''}${d} t.o.v. vorige periode`;
}

const DAGEN = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
const UREN = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

function Heatmap({ data }: { data: Inzicht['heatmap'] }) {
  const cel = (dow: number, uur: number) => data.find((h) => h.dow === dow && h.uur === uur);
  return (
    <div className="ld-heat" role="table" aria-label="Opneemratio per dag en uur">
      <span className="ld-heat-kop" />
      {UREN.map((u) => <span key={u} className="ld-heat-kop">{u}u</span>)}
      {[1, 2, 3, 4, 5].map((d) => (
        <Fragment key={d}>
          <span className="ld-heat-kop">{DAGEN[d]}</span>
          {UREN.map((u) => {
            const c = cel(d, u);
            const ratio = c && c.n >= 3 ? c.opgenomen / c.n : null;
            return (
              <span
                key={`${d}-${u}`}
                title={c ? `${c.opgenomen} van ${c.n} opgenomen` : 'geen belletjes'}
                style={{ background: ratio === null ? 'var(--v1-surface-2)' : `color-mix(in srgb, var(--v1-accent) ${Math.round(15 + ratio * 85)}%, white)` }}
              >
                {ratio === null ? '' : `${Math.round(ratio * 100)}`}
              </span>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function Uitsplitsing({ rijen, titel }: { rijen: Inzicht['per_niche']; titel: string }) {
  if (!rijen.length) return <p className="v1-hint">Nog te weinig gegevens.</p>;
  return (
    <DataTable label={titel} columns={[{ label: titel }, { label: 'Belletjes', num: true }, { label: 'Opneemratio', num: true }, { label: 'Interesse', num: true }, { label: 'Nog op de lijst', num: true }]}>
      {rijen.map((r) => (
        <tr key={r.naam}>
          <td>{r.naam}</td>
          <NumCell>{r.belletjes}</NumCell>
          <NumCell>{pct(r.opgenomen, r.belletjes)}</NumCell>
          <NumCell>{pct(r.interesse, r.opgenomen)}</NumCell>
          <NumCell>{r.voorraad}</NumCell>
        </tr>
      ))}
    </DataTable>
  );
}

export default async function InzichtPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireJorionAdmin();
  const db = getV1ServiceRoleClient();
  const sp = await searchParams;
  const periode = (PERIODES.map((p) => p.id) as string[]).includes(sp.periode ?? '') ? (sp.periode as Periode) : 'week';
  const lijst = await bellers(db);
  const beller = lijst.some((b) => b.id === sp.beller) ? sp.beller! : null;
  const { nu: d, vorige: v } = await haalInzicht(db, periode, beller);
  const href = (x: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const m = { periode, beller, ...x };
    for (const [k, w] of Object.entries(m)) if (w) u.set(k, w);
    return `/v1/leads/inzicht?${u}`;
  };
  const trechter = [
    { label: 'Gebeld', n: d.belpogingen },
    { label: 'Opgenomen', n: d.opgenomen },
    { label: 'Interesse', n: d.interesse },
    { label: 'Kennismaking', n: d.kennismakingen },
    { label: 'Klant', n: d.klanten },
  ];
  const max = Math.max(1, d.belpogingen);
  const maxBezwaar = Math.max(1, ...d.bezwaren.map((b) => b.n));

  return (
    <>
      <PageHeader title="Inzicht" description="Hoeveel je belt, hoeveel er opneemt en waar de interesse zit." />
      <div className="ld-balk">
        <div className="ld-periode">
          {PERIODES.map((p) => <Link key={p.id} className="ld-chip" aria-pressed={p.id === periode} href={href({ periode: p.id })}>{p.label}</Link>)}
        </div>
        <div className="ld-periode" style={{ marginLeft: 'auto' }}>
          <Link className="ld-chip" aria-pressed={!beller} href={href({ beller: null })}>Iedereen</Link>
          {lijst.map((b) => <Link key={b.id} className="ld-chip" aria-pressed={beller === b.id} href={href({ beller: b.id })}>{b.naam}</Link>)}
        </div>
      </div>

      <MetricGrid>
        <Metric label="Cold calls" value={d.belpogingen} sub={verschil(d.belpogingen, v?.belpogingen)} />
        <Metric label="Bedrijven gebeld" value={d.bedrijven} sub={verschil(d.bedrijven, v?.bedrijven)} />
        <Metric label="Opneemratio" value={pct(d.opgenomen, d.belpogingen)} sub={`${d.opgenomen} opgenomen`} />
        <Metric label="Interesse" value={pct(d.interesse, d.opgenomen)} sub={`${d.interesse} van de opgenomen gesprekken`} tone="ok" />
        <Metric label="Kennismakingen" value={d.kennismakingen} sub={verschil(d.kennismakingen, v?.kennismakingen)} tone="accent" />
        <Metric label="Klanten" value={d.klanten} sub={verschil(d.klanten, v?.klanten)} tone="ok" />
        <Metric label="Opvolgmails" value={d.mails} sub={`${d.mail_naar_kans} binnen 7 dagen tot kans`} />
      </MetricGrid>

      <div className="ld-raster">
        <Panel title="Trechter">
          <div className="ld-trechter" style={{ padding: 16 }}>
            {trechter.map((t, i) => (
              <div key={t.label} className="ld-trechter-rij">
                <span>{t.label}</span>
                <div className="ld-trechter-balk" style={{ width: `${(t.n / max) * 100}%` }} />
                <span>{t.n}{i > 0 ? ` · ${pct(t.n, trechter[i - 1].n, 5)}` : ''}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Belletjes per dag">
          <div style={{ padding: 16 }}>
            <LineChart
              title="Belletjes per dag"
              points={d.per_dag.map((p) => ({ date: p.dag, label: p.dag.slice(8), value: p.belletjes }))}
              formatValue={(n: number) => `${n}`}
              emptyText="Nog geen belletjes in deze periode."
            />
            <p className="v1-hint">Opgenomen: {d.per_dag.reduce((s, p) => s + p.opgenomen, 0)} · Interesse: {d.per_dag.reduce((s, p) => s + p.interesse, 0)}</p>
          </div>
        </Panel>
        <Panel title="Beste beltijd (opneemratio in %)">
          <div style={{ padding: 16 }}>
            {d.belpogingen < 10 ? <p className="v1-hint">Nog te weinig gegevens.</p> : <Heatmap data={d.heatmap} />}
          </div>
        </Panel>
        <Panel title="Bezwaren">
          <div className="ld-staven" style={{ padding: 16 }}>
            {d.bezwaren.length ? d.bezwaren.map((b) => (
              <div key={b.bezwaar} className="ld-staaf">
                <span>{BEZWAAR_LABEL[b.bezwaar as Bezwaar] ?? b.bezwaar}</span>
                <div style={{ width: `${(b.n / maxBezwaar) * 100}%` }} />
                <span>{b.n}</span>
              </div>
            )) : <p className="v1-hint">Nog geen bezwaren vastgelegd.</p>}
          </div>
        </Panel>
      </div>

      <Panel title="Per branche"><div style={{ padding: 16 }}><Uitsplitsing rijen={d.per_niche} titel="Branche" /></div></Panel>
      <Panel title="Per plaats"><div style={{ padding: 16 }}><Uitsplitsing rijen={d.per_plaats} titel="Plaats" /></div></Panel>
      <div className="ld-raster">
        <Panel title="Per beller">
          <div style={{ padding: 16 }}>
            <DataTable label="Per beller" columns={[{ label: 'Beller' }, { label: 'Belletjes', num: true }, { label: 'Opneemratio', num: true }, { label: 'Interesse', num: true }, { label: 'Kennismakingen', num: true }]}>
              {d.per_beller.map((b) => (
                <tr key={b.user_id}>
                  <td>{b.naam}</td>
                  <NumCell>{b.belletjes}</NumCell>
                  <NumCell>{pct(b.opgenomen, b.belletjes)}</NumCell>
                  <NumCell>{pct(b.interesse, b.opgenomen)}</NumCell>
                  <NumCell>{b.kennismakingen}</NumCell>
                </tr>
              ))}
            </DataTable>
          </div>
        </Panel>
        <Panel title="Pijplijn nu">
          <div style={{ padding: 16 }}>
            <MetricGrid>
              {(['open', 'terugbellen', 'opvolgen', 'kans', 'klant'] as LeadStatus[]).map((s) => (
                <Metric key={s} label={STATUS_LABEL[s]} value={d.pijplijn[s] ?? 0} />
              ))}
            </MetricGrid>
          </div>
        </Panel>
      </div>
    </>
  );
}
```

Controleer de props van `LineChart` (`sed -n 26,60p app/v1/admin/_ui/line-chart.tsx`): als `formatValue` of `title` anders heten, pas de aanroep aan.

- [ ] **Step 5: Typecheck en commit** — `feat(leads): inzichtdashboard`

---

### Task 18: Knop in de admin-zijbalk

**Files:**
- Modify: `app/v1/admin/_shell/sidebar.tsx` (blok `v1-sidebar-foot`, rond regel 79-86)

- [ ] **Step 1: Voeg de link toe** boven "Naar klantendashboard":

```tsx
        <a href="/v1/leads" target="_blank" rel="noopener" className="v1-nav-item v1-nav-item--quiet">
          <PhoneCall size={16} strokeWidth={1.8} aria-hidden="true" />
          Leads ↗
        </a>
```

en voeg `PhoneCall` toe aan de bestaande `lucide-react`-import bovenin het bestand.

- [ ] **Step 2: Typecheck en commit** — `feat(leads): knop naar het leads-dashboard in de admin-zijbalk`

---

### Task 19: Import-script

**Files:**
- Create: `scripts/leads-import.ts`
- Modify: `package.json` (script `leads:import`)

- [ ] **Step 1: Schrijf `scripts/leads-import.ts`**

```ts
// Import van Niels' ChatbotScanner-data naar V1 (tabel leads).
//   npm run leads:import -- <leads.json> [--status <status.json>] [--csv-map <map met gevonden_*.csv>] [--toepassen]
// Standaard een PROEFRUN (schrijft niets). Bestanden staan buiten de repo.
// Idempotent: upsert op domein; status- en belvelden van bestaande leads worden nooit overschreven.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { verwerkImport, leesCsv, type NielsLead, type NielsStatus, type ImportLead } from '../lib/leads/import-opschonen';
import { normaliseerDomein } from '../lib/leads/normaliseren';

function arg(naam: string): string | undefined {
  const i = process.argv.indexOf(naam);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const leadsPad = process.argv[2];
  if (!leadsPad || leadsPad.startsWith('--')) {
    console.error('Gebruik: npm run leads:import -- <leads.json> [--status <status.json>] [--csv-map <map>] [--toepassen]');
    process.exit(1);
  }
  const toepassen = process.argv.includes('--toepassen');
  const ruw = JSON.parse(readFileSync(leadsPad, 'utf8')) as NielsLead[];
  const statusPad = arg('--status');
  const status = statusPad ? (JSON.parse(readFileSync(statusPad, 'utf8')) as Record<string, NielsStatus>) : undefined;
  const csvMap = arg('--csv-map');
  const googleTelefoon = new Map<string, string>();
  if (csvMap) {
    for (const f of readdirSync(csvMap).filter((x) => /^gevonden_.*\.csv$/.test(x))) {
      for (const r of leesCsv(readFileSync(join(csvMap, f), 'utf8'))) {
        const d = normaliseerDomein(r.url);
        if (d && r.telefoon && !googleTelefoon.has(d)) googleTelefoon.set(d, r.telefoon);
      }
    }
  }

  const { leads, activiteiten, rapport } = verwerkImport(ruw, { googleTelefoon, status });
  console.log('Rapport:', JSON.stringify(rapport, null, 2));
  console.log(`Google-nummers uit CSV: ${googleTelefoon.size}`);
  const perStatus = leads.reduce<Record<string, number>>((m, l) => ((m[l.status] = (m[l.status] ?? 0) + 1), m), {});
  console.log('Per status:', perStatus);

  if (!toepassen) {
    console.log('\nPROEFRUN: niets geschreven. Voeg --toepassen toe om te schrijven (pas na akkoord).');
    return;
  }

  const db = createClient(process.env.NEXT_PUBLIC_V1_SUPABASE_URL!, process.env.V1_SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Bestaande leads: alleen scan/bronvelden bijwerken, nooit status/belvelden.
  const { data: bestaand, error: be } = await db.from('leads').select('id, domein, telefoon').limit(20000);
  if (be) throw be;
  const opDomein = new Map((bestaand ?? []).filter((b) => b.domein).map((b) => [b.domein as string, b.id as string]));
  const opTelefoon = new Map((bestaand ?? []).filter((b) => b.telefoon).map((b) => [b.telefoon as string, b.id as string]));

  let nieuw = 0;
  let bijgewerkt = 0;
  const SCAN_VELDEN: (keyof ImportLead)[] = ['google_rating', 'google_reviews', 'heeft_chatbot', 'chatbot_naam', 'platform', 'woorden', 'score', 'score_max', 'score_redenen', 'labels', 'bron_data'];

  for (const l of leads) {
    const id = (l.domein && opDomein.get(l.domein)) || (l.telefoon && opTelefoon.get(l.telefoon)) || null;
    if (id) {
      const patch = Object.fromEntries(SCAN_VELDEN.map((k) => [k, l[k]]));
      const { error } = await db.from('leads').update(patch).eq('id', id);
      if (error) throw error;
      bijgewerkt++;
      continue;
    }
    const { data, error } = await db.from('leads').insert(l).select('id').single();
    if (error) {
      console.error(`Overgeslagen (${l.domein ?? l.telefoon}): ${error.message}`);
      continue;
    }
    nieuw++;
    const acts = l.domein ? activiteiten.get(l.domein) : undefined;
    if (acts?.length) {
      const { error: ae } = await db.from('lead_activiteiten').insert(acts.map((a) => ({ lead_id: data.id, soort: a.soort, details: a.details })));
      if (ae) throw ae;
    }
  }
  console.log(`\nKlaar: ${nieuw} nieuw, ${bijgewerkt} bijgewerkt.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Voeg toe in `package.json`:

```json
"leads:import": "node --env-file=.env.local --import tsx scripts/leads-import.ts",
```

- [ ] **Step 2: Proefrun op de echte data**

Run:
```bash
S=/c/Users/solys/AppData/Local/Temp/claude/C--Users-solys-Documents-Code-chatmanta/27e95114-fd3a-44b2-a1fc-7257b8958d6d/scratchpad/leadschatmanta
npm run leads:import -- "$S/leads.json" --csv-map "$S"
```
(Ontbreekt die map: `git clone https://github.com/niels1611/Leadschatmanta.git <map>` naar een kladmap buiten de repo.)
Expected: een rapport met `gelezen: 1404`, en de regel `PROEFRUN: niets geschreven.` Noteer de getallen voor Sebastiaan. Kijk in het rapport of er domeinen zijn die op adresgidsen lijken (veel leads met hetzelfde domein-patroon); vul `ADRESGIDSEN` in Task 9 aan als dat zo is (met test) en draai de proefrun opnieuw.

- [ ] **Step 3: Commit** — `feat(leads): import-script voor Niels' data`

(Het echte schrijven met `--toepassen` gebeurt in Task 21, na akkoord.)

---

### Task 20: Playwright e2e

**Files:**
- Create: `tests/v1/leads.spec.ts`

Draait onder het bestaande `v1`-project (zie `playwright.config.ts`). Gebruikt `member@example.com` (seed-admin op V1-prod) en `outsider@example.com` (geen admin). Maakt testleads met `bron = 'test'` via de service-role en ruimt ze na afloop op.

- [ ] **Step 1: Schrijf de test**

```ts
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_V1_SUPABASE_URL!, process.env.V1_SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const NICHE = 'e2e-test-niche';

async function login(page: Page, email: string, pw: string) {
  await page.goto('/v1/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/v1\/(app|admin)/);
}

test.describe.serial('leads-dashboard', () => {
  test.beforeAll(async () => {
    await db.from('leads').delete().eq('bron', 'test');
    const { error } = await db.from('leads').insert([
      { bedrijfsnaam: 'E2E Bouw Alfa', domein: 'e2e-alfa.invalid', telefoon: '+31600000001', niche: NICHE, plaats: 'Teststad', score: 12, bron: 'test', contactpersoon: 'Jan', email: 'jan@e2e-alfa.invalid' },
      { bedrijfsnaam: 'E2E Bouw Beta', domein: 'e2e-beta.invalid', telefoon: '+31600000002', niche: NICHE, plaats: 'Teststad', score: 8, bron: 'test' },
    ]);
    if (error) throw error;
  });

  test.afterAll(async () => {
    await db.from('leads').delete().eq('bron', 'test');
  });

  test('niet-admin krijgt geen toegang', async ({ page }) => {
    await login(page, 'outsider@example.com', process.env.V1_SEED_OUTSIDER_PW!);
    await page.goto('/v1/leads');
    await expect(page.getByText('Geen toegang')).toBeVisible();
  });

  test('belmodus: hoogste score eerst, niet opgenomen, ongedaan maken', async ({ page }) => {
    await login(page, 'member@example.com', process.env.V1_SEED_MEMBER_PW!);
    await page.goto(`/v1/leads/bellen?niche=${NICHE}`);
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.getByRole('heading', { name: 'E2E Bouw Beta' })).toBeVisible();
    await page.getByRole('button', { name: /Ongedaan maken/ }).click();
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    const { data } = await db.from('leads').select('pogingen_niet_opgenomen').eq('domein', 'e2e-alfa.invalid').single();
    expect(data!.pogingen_niet_opgenomen).toBe(0);
  });

  test('interesse met mail opent de mail-pop-up en legt de mail vast', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await login(page, 'member@example.com', process.env.V1_SEED_MEMBER_PW!);
    // afzenderprofiel voor de seed-admin
    const { data: u } = await db.from('users').select('id').eq('email', 'member@example.com').single();
    await db.from('lead_afzenders').upsert({ user_id: u!.id, naam: 'Test Admin', voornaam: 'Test', functie: 'Tester', telefoon: '0600000000', email: 'member@example.com' });
    await page.goto(`/v1/leads/bellen?niche=${NICHE}`);
    await expect(page.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    await page.keyboard.press('4');
    await page.getByRole('button', { name: 'Opslaan' }).click();
    await expect(page.getByRole('dialog', { name: 'Opvolgmail' })).toBeVisible();
    await page.getByRole('button', { name: 'Kopieer mail' }).click();
    await page.getByRole('button', { name: 'Verstuurd' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Bouw Beta' })).toBeVisible();
    const { data } = await db.from('leads').select('status, opvolgmail_situatie').eq('domein', 'e2e-alfa.invalid').single();
    expect(data).toEqual({ status: 'kans', opvolgmail_situatie: 'info' });
  });

  test('overzicht: lead staat onder Kansen; inzicht laadt', async ({ page }) => {
    await login(page, 'member@example.com', process.env.V1_SEED_MEMBER_PW!);
    await page.goto(`/v1/leads?tab=kansen&niche=${NICHE}`);
    await expect(page.getByRole('link', { name: 'E2E Bouw Alfa' })).toBeVisible();
    await page.goto('/v1/leads/inzicht?periode=vandaag');
    await expect(page.getByText('Cold calls')).toBeVisible();
  });

  test('twee bellers krijgen niet dezelfde lead', async ({ browser }) => {
    await db.from('leads').update({ status: 'open', geclaimd_door: null, geclaimd_tot: null, volgende_actie_op: null }).eq('bron', 'test');
    const a = await browser.newPage();
    await login(a, 'member@example.com', process.env.V1_SEED_MEMBER_PW!);
    await a.goto(`/v1/leads/bellen?niche=${NICHE}`);
    await expect(a.getByRole('heading', { name: 'E2E Bouw Alfa' })).toBeVisible();
    // Tweede beller: een ander bestaand account (FK geclaimd_door → users). De wachtrij
    // moet Alfa overslaan omdat member hem geclaimd heeft.
    const { data: ander } = await db.from('users').select('id').eq('email', 'outsider@example.com').single();
    const { data: claim, error } = await db.rpc('leads_claim_volgende', { p_user: ander!.id, p_niche: NICHE });
    expect(error).toBeNull();
    expect((claim as { bedrijfsnaam: string }[])[0]?.bedrijfsnaam).toBe('E2E Bouw Beta');
    await a.close();
  });
});
```

- [ ] **Step 2: Draai de tests**

Run (dev-server op een vrije poort in de worktree, bv. 3101):
```bash
rm -rf .next && PORT=3101 npm run dev &   # in een aparte terminal / achtergrond
PLAYWRIGHT_PORT=3101 npx playwright test tests/v1/leads.spec.ts --project=v1
```
Expected: alle tests PASS. Faalt het kopiëren in headless Chromium, controleer dan dat `grantPermissions` werkt; de terugval via `execCommand` zou anders moeten slagen.

- [ ] **Step 3: Commit** — `test(leads): e2e voor belmodus, mail-pop-up en toegang`

---

### Task 21: Afronden (verify, build, import, PR)

- [ ] **Step 1: Volledige check**

Run: `npm run verify`
Expected: typecheck groen, alle unit-tests PASS (ook de nieuwe in `lib/leads/__tests__`).

- [ ] **Step 2: Build**

Run: `rm -rf .next && npm run build`
Expected: build slaagt; `/v1/leads`, `/v1/leads/bellen`, `/v1/leads/[id]`, `/v1/leads/inzicht`, `/v1/leads/instellingen` staan in de route-lijst als dynamisch.

- [ ] **Step 3: Handmatig in de browser** (dev-server)

Loop na als Sebastiaan (eigen admin-account): knop "Leads ↗" in `/v1/admin` opent een nieuw tabblad; belmodus met QR-code op de laptop; op telefoonbreedte (DevTools) is het nummer een tikbare link en zijn de knoppen groot; mail-pop-up plakt goed in Outlook (web); inzicht toont blokken met "Nog te weinig gegevens".

- [ ] **Step 4: Import met akkoord**

Laat Sebastiaan het rapport van de proefrun zien (Task 19, stap 2) en vraag: "Mag ik de import met `--toepassen` op productie draaien?" Is Niels' `status.json` er inmiddels, neem hem mee met `--status`. Na ja:
```bash
npm run leads:import -- "$S/leads.json" --csv-map "$S" [--status <pad>] --toepassen
```
Expected: `Klaar: N nieuw, 0 bijgewerkt.` met N gelijk aan `rapport.leads`. Controleer daarna in `/v1/leads` de tellers per tabblad.

- [ ] **Step 5: PR**

Push de branch en maak de PR met `.github/pull_request_template.md` volledig ingevuld (geschreven voor iemand die niet bij het gesprek was): wat het dashboard doet, de uitzondering op hard rule 2 (admin-only tabellen zonder `organization_id`, akkoord 2026-10-16), de nieuwe library `qrcode`, migraties 0032/0033 (al op prod), de import (al gedraaid of nog niet), en hoe te testen. Geen echte bedrijfsgegevens in de PR-tekst. Eindig met `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

```bash
git push -u origin feat/seb/leads-dashboard
gh pr create --title "feat(leads): leads-dashboard deel A (bellijst, opvolgmail, inzicht)" --body-file /tmp/pr.md
```

- [ ] **Step 6: Second Brain**

Werk `projecten/chatmanta-features-overzicht.md` en `chatmanta-tijdlijn.md` bij (leads-dashboard deel A, PR-nummer), plus een regel in `LOGBOEK.md`.
