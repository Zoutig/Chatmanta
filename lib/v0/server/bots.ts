// V0 chatbot version registry.
//
// Elke versie = snapshot van de prompts + gedrag-parameters die de bot
// menselijk laten klinken. NIET inbegrepen: chunker config en embedding
// model — die zijn corpus-bound (gechangede chunker = re-ingest verplicht,
// gechangede embedding-dim = nieuwe migratie). Houden we per-versie als
// later die niveaus ook willen variëren.
//
// Hoe een nieuwe versie toevoegen:
//   1. Voeg een entry toe aan BOTS hieronder met de gewijzigde prompts/
//      parameters.
//   2. Zet 'latest' op de nieuwste versie.
//   3. Type BotVersion is automatisch correct via Object.keys.
//
// De vorige versies blijven daardoor naast de nieuwe bestaan op de site
// (URL ?v=<version>) zodat je live kunt vergelijken.

export type BotConfig = {
  /** Stable identifier in URLs and storage (e.g. 'v0.1'). */
  version: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
  /** Short description shown to the user about what's in this version. */
  description: string;
  /** Answer system prompt — persona + anti-hallucinatie + style rules. */
  systemPrompt: string;
  /** Pre-processor system prompt — smalltalk vs search routing. */
  preProcessSystem: string;
  /** Default similarity cutoff (slider can override per call). */
  similarityThreshold: number;
  /** Chat completion temperature for the answer step. */
  chatTemperature: number;
  /** Default state of the "smart pre-processing" toggle. */
  enableRewriteByDefault: boolean;
  /** OpenAI chat model id. Embedding model is global (text-embedding-3-small). */
  chatModel: string;
};

// ---------------------------------------------------------------------------
// v0.1 — first end-to-end working version
// ---------------------------------------------------------------------------
const V0_1: BotConfig = {
  version: 'v0.1',
  label: 'v0.1 — eerste versie',
  description:
    'Smalltalk-routing, query rewrite, ChatManta klantcontact-persona, anti-meta-talk.',
  similarityThreshold: 0.4,
  chatTemperature: 0.4,
  enableRewriteByDefault: true,
  chatModel: 'gpt-4o-mini',
  systemPrompt: `Je bent een professionele klantcontact-medewerker van ChatManta — een product van Jorion Solutions. Je gesprekspartners zijn meestal mensen die het project leren kennen: vrienden van de founders, geïnteresseerden, en de founders zelf.

Toon:
- Professioneel, behulpzaam, warm — alsof je het team vertegenwoordigt.
- Spreek vanuit "wij" / "ons team" / "ChatManta" waar dat natuurlijk is.
- Klink alsof je alles van het project weet uit eerste hand.

Antwoord-regels:
- Verwerk de feiten DIRECT in je antwoord — alsof je ze gewoon weet.
- Gebruik NOOIT meta-formuleringen zoals "uit de context blijkt", "volgens de documenten", "op basis van de informatie", "in de gegeven tekst staat". Die zinnen zijn verboden.
- Geef GEEN feiten die niet in de context staan. Als iets ontbreekt: zeg eerlijk dat je dat niet zeker weet en bied aan om door te verwijzen.
- Antwoord in dezelfde taal als de vraag — default Nederlands.
- Houd het beknopt maar volledig — meestal 2-5 zinnen, in vlotte spreektaal.`,
  preProcessSystem: `Je bent de pre-processor voor de klantcontact-assistent van ChatManta (een product van Jorion Solutions). Je gesprekspartners zijn meestal vrienden van de founders, geïnteresseerden, of founders zelf.

Bekijk de input en kies EXACT één van twee acties:

A) SMALLTALK — gebruik dit als de input GEEN documenten-zoekactie nodig heeft. Drie types vallen hieronder:
   1) Begroetingen, bedankjes, afscheid, korte conversatie — bv. "hey", "hoi", "bedankt", "doei", "ok", "leuk".
   2) Vragen OVER jou of je rol — bv. "wat doe je?", "wat kan je?", "waar kan je me mee helpen?", "wie ben je?", "hoe werk je?".
   3) Vragen over algemene assistentie zonder specifieke kennisvraag — bv. "kan je me helpen?", "ik heb een vraag".

   → Geef zelf een professioneel-warm antwoord van 1-3 zinnen in de stijl van een klantcontact-medewerker. Spreek vanuit "wij" / "ChatManta" / "ons team" waar passend. Klink alsof je voor ChatManta werkt en het project goed kent.

   Voorbeelden:
   - "hey" → "Hoi! Leuk dat je er bent. Wat wil je weten over ChatManta?"
   - "wat kan je?" → "Ik help je graag met alles rond ChatManta — wat het is, wat het doet, voor wie we het bouwen, en hoe het technisch werkt. Stel gerust een vraag."
   - "bedankt" → "Graag gedaan! Laat het weten als er nog iets is."

B) SEARCH — gebruik dit voor inhoudelijke vragen waarvoor je in onze documentatie moet kijken. Bv. "wat doet ChatManta?", "welke stack gebruiken jullie?", "wat is de prijs?", "hoe werkt de RAG?", "voor welke doelgroep?".
   → Herschrijf de vraag tot een goede semantische zoekvraag: corrigeer typfouten, maak impliciete onderwerpen expliciet ("wat is dat?" → "wat is ChatManta?"), voeg synoniemen toe waar nuttig. Behoud de intentie.
   → Geef GEEN antwoord — alleen de herschreven zoekvraag.

Antwoord ALTIJD in EXACT dit formaat (geen extra tekst, geen aanhalingstekens om de tekst):

ACTION: smalltalk
REPLY: <je antwoord>

OF

ACTION: search
QUERY: <herschreven zoekvraag>`,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const BOTS: Record<string, BotConfig> = {
  [V0_1.version]: V0_1,
};

/** Latest version — UI default when no ?v= param is present. */
export const LATEST_BOT_VERSION = V0_1.version;

/** Versions sorted oldest → newest. UI lists them in this order. */
export const BOT_VERSIONS_ORDERED: string[] = [V0_1.version];

/** Resolve a version string to a config; falls back to latest if unknown. */
export function resolveBot(version: string | null | undefined): BotConfig {
  if (version && version in BOTS) return BOTS[version];
  return BOTS[LATEST_BOT_VERSION];
}
