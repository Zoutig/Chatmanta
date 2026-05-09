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
  /** Aantal zoekvragen om te genereren via LLM (1 = geen multi-query). */
  multiQueryCount: number;
  /** LLM-rerank-stap na retrieve — verbetert precision tegen extra LLM-call. */
  rerank: 'none' | 'llm';
  /** HyDE: genereer een hypothetisch antwoord, embed dat ipv (alleen) de vraag. */
  useHyDE: boolean;
  /** Query decomposition: split samengestelde vragen in sub-queries. */
  queryDecomposition: boolean;
  /** Combineer vector-search met keyword-search (Postgres FTS) via RRF. */
  hybridSearch: boolean;
  /** Antwoord-stijl voor bron-verwijzingen. */
  citationStyle: 'none' | 'inline';
  /** Chain-of-thought: model denkt eerst stap-voor-stap (interne redenering). */
  chainOfThought: boolean;
  /** Self-reflect: extra LLM-call valideert antwoord tegen context. */
  selfReflect: boolean;
  /** Genereer 2-3 vervolgvragen na het antwoord. */
  generateFollowUps: boolean;
  /** Bij low-confidence: regenerate met sterker model. */
  cascadeOnLowConfidence: boolean;
  /** Sterker model voor cascade-fallback (alleen relevant als cascadeOnLowConfidence). */
  cascadeModel: string;
  /** Cache identieke/zeer-vergelijkbare vragen via vector-similarity lookup. */
  cacheEnabled: boolean;
  /**
   * Parent-document retrieval: match op kleine chunks (precision), maar stuur
   * de bijbehorende parent-chunk content naar de LLM (recall in completion).
   * Vereist dat documents zijn ingest met v0:reingest-parents — anders fallt
   * elke chunk terug op zijn eigen content (oude gedrag, parent_chunk_id NULL).
   */
  parentDocumentRetrieval: boolean;
  /**
   * Selective HyDE: alleen HyDE genereren als de top-1 cosine similarity in de
   * eerste retrieve onder de trigger-threshold valt. Bespaart een LLM-call
   * (~$0.0001) op queries waar vector-search al een goede match vindt.
   */
  selectiveHyDE: boolean;
  /**
   * Top-1 sim drempel waaronder selectiveHyDE getriggerd wordt. Default 0.5
   * — bij OpenAI text-embedding-3-small + NL liggen "goede" matches typisch
   * ≥ 0.55. Onder 0.5 betekent dat retrieval waarschijnlijk niet sterk is.
   */
  selectiveHyDETrigger: number;
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
  multiQueryCount: 1,
  rerank: 'none',
  useHyDE: false,
  queryDecomposition: false,
  hybridSearch: false,
  citationStyle: 'none',
  chainOfThought: false,
  selfReflect: false,
  generateFollowUps: false,
  cascadeOnLowConfidence: false,
  cascadeModel: 'gpt-4o',
  cacheEnabled: false,
  parentDocumentRetrieval: false,
  selectiveHyDE: false,
  selectiveHyDETrigger: 0.5,
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
// v0.2 — multi-query + LLM rerank (zelfde persona/prompts als v0.1)
// ---------------------------------------------------------------------------
const V0_2: BotConfig = {
  ...V0_1,
  version: 'v0.2',
  label: 'v0.2 — multi-query + rerank',
  description:
    'Zelfde persona als v0.1, maar genereert 3 zoekvragen-varianten en herrangschikt de chunks met een extra LLM-pass. Hogere kosten, betere recall en precision op vage vragen.',
  multiQueryCount: 3,
  rerank: 'llm',
};

// ---------------------------------------------------------------------------
// v0.3 — kitchen-sink experimentele versie
//
// Alle 10 RAG-verbeteringen tegelijk aan: HyDE + query decomposition +
// hybrid search (vector + keyword) + inline citations + chain-of-thought +
// self-reflect + suggested follow-ups + model-cascading + answer-cache.
// Verwacht ~6 LLM-calls per vraag, ~3-4× cost van v0.2 (nog steeds <$0.005).
// ---------------------------------------------------------------------------
const V0_3: BotConfig = {
  ...V0_2,
  version: 'v0.3',
  label: 'v0.3 — alle features',
  description:
    'HyDE + query decomposition + hybrid (vector+keyword) + inline citations + chain-of-thought + self-reflect + follow-ups + cascading + cache. Hogere cost en latency, maar duidelijk meer "doordacht".',
  // Multi-query is hier vervangen door query decomposition + HyDE.
  multiQueryCount: 1,
  rerank: 'llm',
  useHyDE: true,
  queryDecomposition: true,
  hybridSearch: true,
  citationStyle: 'inline',
  chainOfThought: true,
  selfReflect: true,
  generateFollowUps: true,
  cascadeOnLowConfidence: true,
  cascadeModel: 'gpt-4o',
  cacheEnabled: true,
  // V0.3 antwoord-prompt: vraagt structured output met citations + confidence.
  systemPrompt: `Je bent een professionele klantcontact-medewerker van ChatManta — een product van Jorion Solutions. Je gesprekspartners zijn meestal mensen die het project leren kennen: vrienden van de founders, geïnteresseerden, en de founders zelf.

Toon:
- Professioneel, behulpzaam, warm — alsof je het team vertegenwoordigt.
- Spreek vanuit "wij" / "ons team" / "ChatManta" waar dat natuurlijk is.
- Klink alsof je alles van het project weet uit eerste hand.

Antwoord-regels:
- Verwerk de feiten DIRECT in je antwoord — alsof je ze gewoon weet.
- Gebruik NOOIT meta-formuleringen zoals "uit de context blijkt", "volgens de documenten", "op basis van de informatie", "in de gegeven tekst staat". Die zinnen zijn verboden.
- Geef GEEN feiten die niet in de context staan. Als iets ontbreekt: zeg eerlijk dat je dat niet zeker weet en bied aan om door te verwijzen.

REDENERING (chain-of-thought):
Begin je antwoord met een korte interne redenering tussen <thinking>...</thinking> tags waarin je stap-voor-stap doordenkt welke chunks relevant zijn voor welk deel van de vraag. Houd dat beknopt — de gebruiker ziet dit niet, maar het helpt jou tot een beter antwoord komen.

CITATIES (inline):
Plaats na elk feit dat je gebruikt een verwijzing naar de chunk-nummers tussen vierkante haken, bv. "ChatManta gebruikt pgvector voor semantische zoek [1]" of "We bouwen voor MKB-bedrijven [2][3]". Gebruik de chunk-nummers exact zoals ze in de CONTEXT verschijnen.

OUTPUT-FORMAAT:
Geef je output in dit exacte formaat:

<thinking>
[je interne redenering]
</thinking>
<answer>
[je daadwerkelijke antwoord met inline citations]
</answer>
<confidence>0.0-1.0</confidence>

Confidence-richtlijnen:
- 0.9-1.0: meerdere chunks bevestigen het antwoord direct
- 0.6-0.9: een of twee chunks ondersteunen het, maar niet alle aspecten
- 0.3-0.6: gedeeltelijk antwoord mogelijk, sommige aannames nodig
- 0.0-0.3: weinig of geen ondersteuning in de chunks — overweeg eerlijk te zeggen "weet ik niet"

Antwoord in dezelfde taal als de vraag — default Nederlands. Houd het beknopt maar volledig — meestal 2-5 zinnen, vriendelijk van toon.`,
};

// ---------------------------------------------------------------------------
// v0.4 — retrieval upgrade: parent-document retrieval + selective HyDE
//
// Bouwt voort op v0.3 (alle features daar aan), maar:
//   * HyDE alleen als top-1 sim onder de selectiveHyDETrigger valt — bespaart
//     een LLM-call op queries waar vector-search al goed scoort.
//   * Parent-document retrieval: match op kleine ~800-char chunks (precision),
//     stuur de bijbehorende ~3200-char parent naar de LLM (recall in
//     completion). Vereist dat documenten zijn herIngest met
//     `npm run v0:reingest-parents` — anders fall-back naar small-chunk
//     content (oud gedrag).
//
// Uitgebreide evaluatie via `npm run eval:run -- --versions=v0.3,v0.4` zodra
// de re-ingest gedaan is.
// ---------------------------------------------------------------------------
const V0_4: BotConfig = {
  ...V0_3,
  version: 'v0.4',
  label: 'v0.4 — parent-doc + selective HyDE',
  description:
    'v0.3 met twee retrieval-verbeteringen: parent-document retrieval (match klein, antwoord groot) en selective HyDE (alleen wanneer retrieval zwak presteert). Cost-neutraal of lager dan v0.3 omdat HyDE niet altijd draait.',
  parentDocumentRetrieval: true,
  selectiveHyDE: true,
  selectiveHyDETrigger: 0.5,
  // useHyDE blijft true: het BETEKENT nu "HyDE is beschikbaar"; selectiveHyDE
  // bepaalt of die beschikbaarheid daadwerkelijk getriggerd wordt per query.
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
export const BOTS: Record<string, BotConfig> = {
  [V0_1.version]: V0_1,
  [V0_2.version]: V0_2,
  [V0_3.version]: V0_3,
  [V0_4.version]: V0_4,
};

/** Latest version — UI default when no ?v= param is present. */
export const LATEST_BOT_VERSION = V0_4.version;

/** Versions sorted oldest → newest. UI lists them in this order. */
export const BOT_VERSIONS_ORDERED: string[] = [V0_1.version, V0_2.version, V0_3.version, V0_4.version];

/** Resolve a version string to a config; falls back to latest if unknown. */
export function resolveBot(version: string | null | undefined): BotConfig {
  if (version && version in BOTS) return BOTS[version];
  return BOTS[LATEST_BOT_VERSION];
}
