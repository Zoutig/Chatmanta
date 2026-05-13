# Sandbox-orgs fixture content

Deze map bevat realistische "scraped-website"-content voor de drie V0 sandbox-orgs. Het seed-script (`scripts/v0-seed-orgs.ts`) leest de `.md` files uit elke org-folder in en ingest ze als documents in de Supabase database, met two-layer chunking (parent + child) en embeddings via OpenAI `text-embedding-3-small`.

## De drie orgs

| Slug | Naam (in `KNOWN_ORGS`) | Branche | ~Aantal docs |
|---|---|---|---|
| `acme-corp` | Dakwerken De Boer | Dakdekkersbedrijf, Amersfoort | 32 |
| `globex-inc` | FysioPlus Utrecht | Fysiotherapie-praktijk, Utrecht | 32 |
| `initech` | Bakker & Vermeer Accountants | Accountantskantoor, Eindhoven / 's-Hertogenbosch | 33 |

De slugs en UUIDs zijn vastgelegd in `lib/v0/server/active-org.ts` en mogen niet zomaar wijzigen — daar hangen DB-rows en bestaande threads aan.

## Hoe de loader werkt

`scripts/v0-seed-orgs.ts` doet per org:

1. **Leest alle `*.md` files** in `scripts/fixtures/sandbox-orgs/<slug>/` (sorteert alfabetisch op filename — daarom de nummer-prefixes `01-`, `02-`, ...).
2. **Files met `_` prefix worden overgeslagen** (bedoeld voor index/notitie-files die niet ingest moeten worden).
3. **Per file**: extraheert de title uit de eerste `# `-regel (anders filename als fallback) en gebruikt de volledige body als doc-tekst.
4. **Two-layer chunking**: 3200 chars parent (overlap 400), 800 chars child (overlap 100).
5. **Embedding** van alle children in één batch via OpenAI.
6. **Soft-delete** van docs die in de DB staan maar niet (meer) in de fixture-folder — voorkomt lekkage van oude embeddings in eval-resultaten wanneer een file hernoemd of verwijderd wordt.

## Hoe re-seeden

```bash
npm run v0:seed-orgs
```

Dit is **idempotent**: bestaande docs worden ge-update (parents + children gedropt en opnieuw ge-insert), niet gedupliceerd. Vergeten files krijgen `deleted_at` gezet.

> **⚠️ Destructive op deze drie orgs.** Re-seed dropt ALLE parent + child chunks van bestaande docs in de fixture-folder. Dev-org wordt niet aangeraakt — die heeft een eigen workflow via `v0:ingest`.

Verwacht (geschatte) ingest-kost voor de volledige seed: < $0,10 USD aan `text-embedding-3-small` calls (~100k tokens × 2× voor parents+children).

## Nieuwe doc toevoegen

1. Maak een nieuwe `NN-mijn-doc.md` aan in de juiste org-folder. Gebruik een nummer dat past in de bestaande sort-volgorde.
2. Begin de file met een H1: `# Titel van de pagina`.
3. Run `npm run v0:seed-orgs`.

Geen frontmatter, geen JSON-wrappers — gewoon platte markdown.

## Doc hernoemen of verwijderen

- **Hernoemen**: rename de file. Re-seed soft-deleted de oude filename in de DB en creëert een nieuw doc onder de nieuwe filename.
- **Verwijderen**: delete de file lokaal. Re-seed soft-deleted het doc in de DB.

Voor harde delete (chunks ook wegharken): handmatig via SQL of via een `v0:reset`-variant — niet in deze loader.

## Content-richtlijnen

Bij toevoegen of bewerken:

- **Realistische lengte-variatie**: korte FAQ-items 200–400 woorden, kernpagina's 600–900, longreads 1200–1800. Niet alles op één lengte — dat ziet RAG-retrieval in zijn signaal-distributie.
- **Doc-types mixen**: marketing-pagina, feitelijke pagina (tarieven, openingstijden), Q&A, narratief (cases, blogs), juridisch (voorwaarden, privacy). Geeft eval-vragen breder grounding-oppervlak.
- **Fictieve PII duidelijk fictief**: verzonnen straten ("Industrieweg 42, Amersfoort"), nepnamen, telefoonnummers in herkenbaar fake-format, e-mails op `@example.com` of `@example.nl`. Géén echte personen of bedrijven (anders kunnen we niet veilig delen in een PR).
- **Disjuncte content tussen orgs**: vermijd boilerplate die overal exact hetzelfde luidt ("wij zijn klantgericht"). Dat verzwakt het isolation-signaal in `scripts/v0-test-org-isolation.ts` — drie verschillende branches met eigen vakjargon moet voldoende zijn om dat scherp te houden.
- **Markdown-structuur**: één H1 als titel, daarna H2/H3 secties, tabellen voor tarieven/openingstijden, lijsten voor opsommingen. Markdown helpt chunking om logische grenzen te vinden.

## Geen `_INDEX.md` (yet)

De loader negeert `_*.md` files — als je een per-org index of een notitiebestand wilt toevoegen voor menselijke leesbaarheid, prefix met `_`. Op het moment van schrijven heeft geen van de orgs zo'n file; voel je vrij er een toe te voegen als het helpt bij navigatie.
