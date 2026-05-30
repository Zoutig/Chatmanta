# Spec — Echte, betrouwbare bron-links in bot-antwoorden

_Datum: 2026-05-29 · Branch: `feat/seb/bronlinks` · Migratie: 0042_

## Aanleiding

Een bezoeker vroeg "Vertel me meer over het bedrijf" op de De Gouden Lepel
demo-site. De bot antwoordde met drie "links" in rauwe markdown-syntax
(`[Diensten](https://…/diensten/corporate)`). Diagnose:

1. **De bot verzint URLs.** De chunks die de answer-LLM krijgt (`[chunk N,
   similarity=…]\n{content}`) bevatten **geen** bron-URL. Elke URL die het model
   noemt is dus een gok. Test: van de 3 gegenereerde links was
   `/diensten/corporate` een **404**, de andere twee toevallig 200. Dit schendt
   de hard rule _"anti-hallucinatie boven volledigheid"_.
2. **Geen renderer maakt links klikbaar.** Zowel het dashboard (`RichText` in
   `app/components/messages.tsx`) als de widget (`renderMarkdownLite` in
   `lib/widget/render-markdown-lite.tsx`) doen wél `**bold**` maar géén
   `[tekst](url)` → de markdown lekt als rauwe tekst.

Gekozen richting (door Sebastiaan): **echte links** — geef het model de echte
bron-URLs en render ze veilig klikbaar.

## What

De bot mag in zijn antwoord klikbare links naar bronpagina's opnemen — maar
**alleen** naar de echte URLs van de gecrawlde pagina's waaruit hij put. Hij
verzint nooit een URL. Klikbare links worden in zowel het dashboard als de
embed-widget als veilige `<a>` getoond; een verzonnen of niet-aangeleverde URL
wordt nooit een klikbare link.

## Acceptatiecriteria

- [ ] De answer-LLM krijgt per website-bron de echte `website_pages.url` (en
      titel) mee in het bronnenblok.
- [ ] De system-prompt instrueert expliciet: gebruik uitsluitend de
      aangeleverde bron-URLs; verzin nooit een URL of pad. Geen bron-URL
      beschikbaar → verwijs in woorden, zonder link.
- [ ] Een output-sanitizer strijkt elke markdown-link waarvan de URL **niet** in
      de aangeleverde set zit terug naar platte tekst (label blijft, URL weg).
      Dit is de mechanische anti-hallucinatie-garantie.
- [ ] Het dashboard (`RichText`) rendert `[tekst](url)` als veilige `<a>`:
      alleen `http(s)`, `target="_blank"`, `rel="noopener noreferrer"`.
- [ ] De widget (`renderMarkdownLite`) rendert dezelfde links identiek veilig.
- [ ] Bestaande opmaak blijft werken: `**bold**`, `` `code` ``, bullets, en de
      numerieke `[n]`-citaties botsen niet met de link-parsing.
- [ ] Streaming blijft vloeiend: een half-binnengekomen `[tekst](ur` flikkert
      niet als kapotte link tijdens het typen.
- [ ] Migratie 0042 breidt `match_chunks_with_parents` én `match_chunks_hybrid`
      uit met `source_url` + `source_title`; bestaande kolommen/gedrag
      ongewijzigd; RLS/isolatie ongemoeid.

## Out of scope (bewust NIET)

- **Geen links voor geüploade documenten** — die hebben geen web-URL
  (`document_id`-chunks). Alleen `website_page_id`-chunks krijgen een URL.
- **Geen re-crawl / backfill** — de URLs staan al in `website_pages.url`.
- **Geen wijziging aan retrieval-ranking, thresholds of chunking.**
- **Geen volledige markdown-parser** — alleen links toevoegen aan de bestaande
  lichte renderers (bold/code/bullets/citaties blijven zoals ze zijn).
- **Geen "Bronnen"-lijst-UI in de widget** — buiten scope; alleen inline links
  in de antwoordtekst.
- **Het "geen specifieke informatie over het bedrijf"-hedge** is een los
  retrieval-onderwerp; deze PR raakt het niet behalve dat links nu kloppen.

## Edge cases

- **Geen website-chunks** (alleen docs, of lege org): geen URLs aangeleverd →
  bot linkt niets; sanitizer strijkt eventuele verzinsels weg.
- **Niet-http scheme** (`javascript:`, `data:`, `mailto:`…): nooit als anchor
  gerenderd (XSS-veiligheid) — blijft tekst.
- **URL aangeleverd maar net iets anders door het model getypt** (trailing slash,
  fragment): sanitizer matcht op genormaliseerde URL; mismatch → tekst, geen
  kapotte link.
- **Dezelfde URL in meerdere chunks**: gededupliceerd in de aangeleverde set.
- **Heel lange URL**: rendert, breekt netjes af via bestaande bubble-CSS (geen
  layout-overflow).
- **Link-tekst met `**bold**` erin**: link wint; binnenin geen geneste opmaak
  nodig (keep simple).
- **`[n]`-citatie vlak naast een link**: citatie-parser (`[\d+]`) en
  link-parser (`[tekst](url)`) mogen elkaar niet opeten — link vereist `](`,
  citatie is puur numeriek tussen blokhaken.

## Verificatie

- Unit: sanitizer (allowlist drop), link-parser in beide renderers
  (http/https ja, andere schemes nee, bold/code/citatie-coëxistentie).
- Build: schone `next build`.
- Browser (gate 5c): dashboard test-chat + embed-widget, licht/donker + mobiel —
  link klikbaar, opent nieuw tabblad, verzonnen pad komt niet door.
- Eval (gate 5d): `lib/v0/` wijzigt → cheap hard-eval (of `eval:run-all`) om te
  bevestigen dat de prompt-uitbreiding geen regressie geeft.
