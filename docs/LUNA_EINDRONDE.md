# Luna-eindronde vóór de launch (okt 2026)

Datum start: 2026-10-11 · branch `feat/seb/luna-eindronde` · basis: v0.14d2 (LATEST, live in V0 en V1)

**Vraag (Seb):** één laatste, overzichtelijke ronde om tot de beste botversie te komen vóór de
launch (week van 12 okt). Vooral kijken naar de instructies/prompt, en naar varianten met en zonder
voorbewerking, inclusief "alles in één prompt". Budget: $10 OpenAI voor evals.

**Beslisregel (Seb, 2026-10-11): kwaliteit eerst.** Een kandidaat wint alleen als de kwaliteit
minstens gelijk is aan de referentie én de hard-eval (prod-gate) JA geeft. Snelheid, kosten en
eenvoud beslissen alleen bij een gelijkspel.

## Opzet

Alle kandidaten draaien **zonder hybrid search** (= V1-gedrag; V1 is wat er gelauncht wordt).
Rondes na elkaar, niet alles door elkaar: elke ronde beantwoordt één vraag.

| ronde | vraag | kandidaten | testset | beoordeling |
|---|---|---|---|---|
| 1 | Welke opzet van de voorbewerking? | v0.15r (referentie = V1 live), v0.15f (lui), v0.15g (f + berichtsoort in de antwoordprompt), v0.15h (alles in één prompt) | dev-set (40) + routing-set r15 (28) × 2 runs, interleaved, latency gemeten | Claude-jury (geblindeerd, gewogen foutscore, $0) |
| 2 | Welke instructies? | winnaar ronde 1 met: huidige prompt, opgeschoonde prompt, minimale prompt, huidige prompt zonder denkstap | stress-sets x6+x7 (65) + dev-set (40) × 2 runs | Claude-jury |
| 3 | Gerichte reparaties | alleen als ronde 2 een duidelijk faalpatroon laat zien: losse instructie-blokjes bovenop de winnaar | gerichte subset | Claude-jury |
| 4 | Eindtoets | finalist vs referentie | holdout2 (120) + r15 × 2 runs, hard-eval, V1-eval | Claude-jury + hard-eval-gate |

Waarom de instructie-blokjes uit de brainstorm (deels antwoorden, rekenen in stappen, voorbeelden
weg) niet als vaste ronde: ze zitten al in de huidige prompt of worden al meegenomen door de
opgeschoonde/minimale variant. Een blokje testen we alleen nog als de data er een reden voor geeft.

## Kandidaten ronde 1

- **v0.15r** — v0.14d2 zonder hybrid: voorbewerking loopt parallel met zoeken; bij nul treffers
  opnieuw zoeken met de herschreven vraag.
- **v0.15f** — geen voorbewerking vooraf; begroetingen/bedankjes deterministisch; voorbewerking
  alleen lui bij nul treffers of bij een vervolgvraag met een verwijswoord.
- **v0.15g** — f + blok BERICHTSOORT in Luna's antwoordprompt (begroeting/vraag over de assistent →
  kort groeten + waarmee je helpt; off-topic → kort weigeren).
- **v0.15h** — alles in één prompt: nooit een LLM-voorbewerking. Vervolgvragen zoeken ook op
  "vorige vraag + huidige vraag" (deterministisch); nul treffers → vaste fallback (`noLlmPreprocess`).

## Resultaten

_(volgt per ronde)_
