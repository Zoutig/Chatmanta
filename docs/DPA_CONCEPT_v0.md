# Verwerkersovereenkomst (DPA) — CONCEPT voor juridische toetsing

> ⚠️ **DIT IS EEN CONCEPT, GEEN RECHTSGELDIG DOCUMENT.** Opgesteld als startpunt voor
> ChatManta v0.10 launch (2026-06-03). Laat dit toetsen + afronden door een jurist vóór
> ondertekening. Het beschrijft de feitelijke gegevensstromen zoals ze in de code zitten —
> de juridische formuleringen, aansprakelijkheidsgrenzen en boetebepalingen zijn placeholder.

## Partijen

- **Verwerker:** Jorion Solutions (handelsnaam ChatManta), gevestigd te [adres], hierna "ChatManta".
- **Verwerkingsverantwoordelijke:** [Klantnaam], gevestigd te [adres], hierna "Klant".

ChatManta levert een website-chatbot (RAG over de website-content + documenten van de Klant).
ChatManta verwerkt persoonsgegevens **uitsluitend in opdracht van en ten behoeve van** de Klant
(art. 28 AVG).

## 1. Onderwerp en duur

- **Onderwerp:** het leveren van de ChatManta-chatbotdienst, inclusief het verwerken van
  bezoekersvragen en het genereren van antwoorden op basis van de kennisbank van de Klant.
- **Duur:** gelijk aan de looptijd van de onderliggende dienstverleningsovereenkomst. Eindigt
  die, dan treedt art. 9 (teruggave/verwijdering) in werking.

## 2. Aard en doel van de verwerking

| Doel | Verwerking |
|------|------------|
| Beantwoorden van bezoekersvragen | Bezoeker typt een vraag → ChatManta zoekt relevante kennisbank-fragmenten → een LLM genereert een antwoord. |
| Misbruik-/kostenbeperking | Per-IP rate-limiting + per-org dagbudget. |
| Kwaliteit & support | Gesprekken worden gelogd voor de operator-/admindashboards (geredacteerd, zie §5). |
| Operator-notificaties | E-mailmeldingen naar de Klant/operator bij feedback of issues. |

## 3. Categorieën betrokkenen en persoonsgegevens

- **Betrokkenen:** bezoekers van de website van de Klant.
- **Persoonsgegevens:**
  - Vrije-tekst chatberichten (kunnen door de bezoeker ingevoerde PII bevatten — naam, e-mail,
    telefoonnummer e.d.).
  - Technisch: IP-adres (rate-limiting), een pseudonieme bezoekers-id (localStorage), tijdstempels.
  - Géén bijzondere categorieën persoonsgegevens worden bewust verwerkt; de Klant zorgt ervoor
    dat de chatbot niet wordt ingezet om gevoelige gegevens uit te vragen.

## 4. Sub-verwerkers

ChatManta schakelt de volgende sub-verwerkers in. De Klant verleent hiervoor algemene toestemming;
ChatManta informeert de Klant bij wijziging en biedt een bezwaarmogelijkheid.

| Sub-verwerker | Rol | Datalocatie | Verwerkt |
|---------------|-----|-------------|----------|
| **Supabase** | Database, opslag, vectoren | West-Europa (EU) | Kennisbank, gesprekslogs, embeddings |
| **Vercel** | Hosting + cron | EU-region (config) | Applicatieverkeer, function-logs |
| **OpenAI** | LLM + embeddings | VS (zie DPA OpenAI) | Chatberichten + context naar het model |
| **Firecrawl** | Website-crawler | zie Firecrawl-DPA | Publieke website-content van de Klant |
| **Upstash** | Rate-limit store (Redis) | EU (Frankfurt) | IP-gebaseerde tellers |
| **Resend** | Transactionele e-mail | zie Resend-DPA | Operator-/notificatie-e-mailadressen |

> ⚠️ **OpenAI verwerkt buiten de EER.** Borg dit met de OpenAI-DPA + standaardcontractbepalingen
> (SCC's). Vermeld in de privacyverklaring van de Klant dat chatinhoud naar OpenAI gaat.

## 5. Technische en organisatorische maatregelen (art. 32 AVG)

Reeds in de v0.10-codebase aanwezig:

- **PII-redactie in logs** — e-mail/telefoon/IBAN/BSN worden gemaskeerd vóór opslag in de
  observability-/issue-logs (`redactPii`).
- **Fail-closed embed-beveiliging** — kortlevend HMAC embed-token gebonden aan de site-URL +
  origin-lock; zonder geldig token weigert de widget (401).
- **Rate-limiting** — per-IP + per-org, tegen misbruik en kosten-explosie.
- **Bewaartermijn-automatisering** — dagelijkse retentie-cron verwijdert gesprekken ouder dan de
  ingestelde termijn.
- **Recht op verwijdering per bezoeker** — een bezoeker kan zijn eigen gesprekken laten wissen
  (`delete-conversations`).
- **Toegangsscheiding** — service-role-toegang alleen via gecontroleerde wrappers; (vanaf V1)
  Row-Level-Security + per-gebruiker membership-checks.
- **Versleuteling** — in-transit (TLS) en at-rest via de sub-verwerkers.

> Noot voor de jurist: tot V1 (Supabase Auth) kent het V0-platform geen per-gebruiker-identiteit.
> Dit document hoort bij de productie-widget-laag; de interne demo-sandbox bevat uitsluitend fake
> data en nooit echte klant-/bezoekersgegevens.

## 6. Bewaartermijnen

- Gesprekslogs: [in te vullen, bv. 90 dagen] — afgedwongen door de retentie-cron.
- IP-tellers (Upstash): kortlevend (TTL van de rate-limit-window).
- Kennisbank/embeddings: zolang de overeenkomst loopt; verwijderd bij beëindiging (§9).

## 7. Rechten van betrokkenen

ChatManta ondersteunt de Klant bij verzoeken tot inzage, correctie, verwijdering en bezwaar,
binnen de technische mogelijkheden (o.a. de per-bezoeker-verwijderfunctie en handmatige
export/verwijdering door de operator).

## 8. Datalekken

ChatManta meldt een (vermoedelijk) datalek **zonder onredelijke vertraging en uiterlijk binnen
[24/48] uur** na ontdekking aan de Klant, met de bij art. 33 AVG vereiste informatie.

## 9. Teruggave en verwijdering

Bij beëindiging verwijdert ChatManta, naar keuze van de Klant, alle persoonsgegevens of geeft ze
terug, en verwijdert bestaande kopieën — tenzij wettelijke bewaarplicht anders vereist.

## 10. Audit

ChatManta stelt de Klant in staat de naleving te controleren via [rapportage / op verzoek een
audit, maximaal [1×] per jaar, kosten voor [partij]].

## 11. Aansprakelijkheid en toepasselijk recht

[Placeholder — door jurist in te vullen, aansluitend op de hoofdovereenkomst. Nederlands recht.]

---

**Open invulpunten vóór ondertekening:** adressen partijen · exacte bewaartermijn · datalek-termijn ·
audit-modaliteiten · aansprakelijkheidsbegrenzing · verwijzing naar de hoofdovereenkomst · actuele
sub-verwerker-DPA's (OpenAI/Vercel/Supabase/Firecrawl/Upstash/Resend) als bijlage.
