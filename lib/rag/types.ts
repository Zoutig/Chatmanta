// Neutral RAG type home — version-agnostic, V0/V1-agnostic.
//
// RagConfig is the canonical config shape for the RAG engine (lib/rag/).
// It is the single source of truth for all engine-knob types.
// V0 keeps a back-compat alias: `BotConfig = RagConfig` in lib/v0/server/bots.ts.
//
// RagPersona is the canonical persona shape for org-level prompt-token injection.
// V0 keeps a back-compat alias: `OrgPersona = RagPersona` in lib/v0/server/persona.ts.

export type RagConfig = {
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
  /**
   * Retrieval-gate: cascade vuurt alleen wanneer de top-1 chunk-similarity
   * ≥ deze drempel ligt. Doel: voorkomen dat een sterker model wordt ingezet
   * op zwakke retrieval (geen grond → hallucinatie-risico). 0 = geen gate
   * (oud gedrag). Op v0.5 ingesteld op 0.50 als hotfix voor de "korte/abstracte
   * query → zwakke chunk → cascade hallucineert"-failure (zie spec
   * 2026-05-13-v0.5-cascade-hotfix-design.md).
   */
  cascadeMinTopSim: number;
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
  /**
   * v0.4 claim verification: na het antwoord splitten we de tekst in claims,
   * embedden elke claim, vergelijken met de chunks die de LLM zag. Per claim
   * een verified-flag + best matching chunk. Telemetrie alleen — wijzigt het
   * antwoord niet.
   */
  claimVerification: boolean;
  /**
   * Min cosine sim om een claim als 'verified' te markeren. Default 0.7 — in
   * lijn met de blueprint similarity threshold. Validatie via eval-corpus.
   */
  claimVerificationThreshold: number;
  /**
   * v0.5: bij retrieval zero-hits (allSources < threshold), draait een
   * tweede-stage re-classifier (lib/v0/server/reclassify.ts). Bij category
   * 'general' beantwoorden we met een aparte general-knowledge prompt + een
   * verplichte disclaimer; bij 'off_topic' geven we een vaste polite refusal
   * zonder LLM-call. Default false — alleen v0.5 zet dit aan.
   */
  generalKnowledgeEnabled: boolean;
  /**
   * Off-topic-detectie in de pre-processor (v0.10+). Bij true mag de
   * pre-processor een derde uitkomst 'off_topic' geven voor vragen die
   * overduidelijk buiten het vakgebied vallen; de orchestrator onderdrukt dan
   * HyDE en geeft bij lege retrieval de off-topic-fallback (corpus-veto: een
   * vraag mét treffers wordt alsnog beantwoord). Default false. Vereist ook een
   * preProcessSystem die de off_topic-actie beschrijft. Zie spec 2026-06-13.
   */
  preProcessOffTopicDetection: boolean;
  /**
   * v0.5: bij claim-verification met verifiedRatio < claimRegenerateThreshold
   * draaien we één extra answer-LLM-call met een striktere system-prompt
   * (alleen feiten uit chunks). Het resultaat wordt via een SSE 'replacement'
   * event naar de UI gestuurd. Max één retry per query. Default false.
   */
  claimRegenerateEnabled: boolean;
  /**
   * v0.5: drempel waaronder claimRegenerate triggert. 0.5 = "meer dan helft
   * van de claims niet vector-similar aan enige chunk". Lager = strenger,
   * meer retries. Negeerd als claimRegenerateEnabled=false.
   */
  claimRegenerateThreshold: number;
  /**
   * v0.5: actieve latency-budgeting in de streaming-pipeline. Bij true wordt
   * de cumulative elapsed time per fase gecheckt; optionele dure stappen
   * (rerank, claim-verify, claim-regenerate, followups, query expansion,
   * decompose, HyDE) worden overgeslagen wanneer elapsed >= latencyBudgetMs.
   * Bij false: gedrag identiek aan v0.4 (geen skip). Default false.
   */
  latencyBudgetEnabled: boolean;
  /**
   * v0.5: target-budget in ms voor de full pipeline. Overschrijding triggert
   * skip van optionele fases (zie latencyBudgetEnabled). 8000 = 8s, conform
   * de spec p95 SLA. Geen effect als latencyBudgetEnabled=false.
   */
  latencyBudgetMs: number;
  /**
   * v0.5: harde cap waarna we — als nog niet in een streaming-fase — direct
   * terugvallen op een latency-fallback response (kind='fallback', reason
   * 'latency hard cap'). Geen partial answer. 12000 = 12s = 1.5x het soft
   * budget. Geen effect als latencyBudgetEnabled=false.
   */
  latencyHardCapMs: number;
  /**
   * v0.5: optionele addon-prompt die ALLEEN voor de preProcessSystem-call
   * wordt geprepend wanneer chat-history bestaat (history.length > 0). Bevat
   * de multi-turn context-resolutie instructie. Bij empty history wordt deze
   * NIET aan het prompt toegevoegd — voorkomt prompt-overload op
   * single-turn queries (zoals eval-runs, eerste user-turn op de site).
   * Lege string = geen multi-turn-handling. v0.1-v0.4 hebben dit op '' .
   */
  preProcessMultiTurnAddon: string;
  /**
   * v0.6.1: format chunks in answer-context als plain-text
   * `MATCHED_SPAN:\n<small-chunk>\n\nSURROUNDING_CONTEXT:\n<parent-content>`
   * i.p.v. één enkele parent-blob. Geeft de LLM een precision-anker (de small
   * chunk die feitelijk matchte) plus context voor nuance. Backwards-compat:
   * undefined of false → huidige v0.5 gedrag (parent_content ?? content blob).
   * Vereist bot.parentDocumentRetrieval ook aan voor effect (anders is er
   * geen parent_content om als surrounding context te tonen).
   */
  matchedSpanContext?: boolean;
  /**
   * v0.6.1: post-hoc verificatie of harde feiten in het antwoord (geld,
   * percentages, datums, aantallen, e-mail/URL, telefoon) 1-op-1 of
   * genormaliseerd in de aangeleverde chunks staan. Aanvulling op de
   * bestaande embedding-similarity claim-check (die vector-shape matcht
   * maar verkeerde getallen niet onderscheidt). Bij missing facts:
   * trigger de bestaande claim-regenerate flow met stricter prompt.
   * Vereist bot.claimVerification om effect te hebben (zelfde stage).
   */
  adaptiveHardFactVerification?: boolean;
  /**
   * v0.6.2: master-switch voor de adaptive decision layer (rag-decision.ts).
   * Bij true wordt `decideRagStrategy()` aangeroepen na threshold-filter en
   * gateet de bestaande pipeline-stages (HyDE, rerank, cascade, claim-verify,
   * followups). Bij false/undefined → identieke gedrag aan v0.6.1 (alle
   * bestaande condities blijven werken). Vereist geen andere v0.6.2-flags
   * om te functioneren, maar werkt het best mét adaptiveStrongTopSim/etc.
   */
  adaptiveRag?: boolean;
  /**
   * v0.6.2: drempel waaronder een query als "weak retrieval" geldt — top-1
   * sim < adaptiveWeakTopSim. Default 0.45 (uit eval-corpus distributie,
   * empirisch verifieerbaar via top1Sim-histogram). Beneden deze drempel:
   * decision.path = 'careful', alle kwaliteitslagen aan.
   */
  adaptiveWeakTopSim?: number;
  /**
   * v0.6.2: drempel waarboven retrieval "strong" is — top-1 sim ≥
   * adaptiveStrongTopSim. Default 0.62. Boven deze drempel én bij voldoende
   * top1-top2 gap → decision.path = 'fast' (skip rerank/verify/cascade/
   * followups). Tussen weak en strong: 'standard' (v0.6.1-pad behouden).
   */
  adaptiveStrongTopSim?: number;
  /**
   * v0.6.2: minimale top1-top2 sim-gap om rerank/cascade te SKIPPEN.
   * Default 0.08. Bij gap < margin = retrieval is ambigu → rerank/cascade
   * alsnog aan ook bij top1 boven strong. Voorkomt "fast path" op queries
   * waar er twee even goede kandidaten zijn.
   */
  adaptiveRerankMargin?: number;
  /**
   * v0.9.2 (latency-pass): gate de decompose-LLM-call achter looksMultiHop() —
   * een pure pre-LLM heuristiek. Skip decompose op overtuigend single-hop vragen
   * (~90% van het corpus), behoud 'm op multi-hop. Bespaart ~820ms p50 op het
   * kritieke pad. Conservatief: bij twijfel wél decomposen. Vereist
   * queryDecomposition=true om effect te hebben. Default false/undefined →
   * decompose draait onvoorwaardelijk (v0.9.1-gedrag).
   */
  decomposeHeuristicGate?: boolean;
  /**
   * v0.6.2: strenger cascadeMinTopSim wanneer adaptiveRag aan. Default 0.60
   * (vs 0.50 in v0.5 hotfix). Cascade fired alleen bij medium/strong
   * retrieval — bij weak heeft een sterker model geen grond. Zonder
   * adaptiveRag: bestaand cascadeMinTopSim blijft leidend.
   */
  adaptiveCascadeMinTopSim?: number;
  /**
   * v0.6.2: top-K kandidaten per retrieve-call. Default V0_RAG_DEFAULTS.TOP_K
   * (5) bij undefined. Verhoogd naar 8 op v0.6.2 om reranker meer keuze te
   * geven, maar finalContextMaxChunks bepaalt nog steeds wat naar LLM gaat.
   */
  retrievalTopK?: number;
  /**
   * v0.6.2: maximaal aantal chunks dat naar de LLM-rerank-call gaat.
   * Default V0_RAG_DEFAULTS.MAX_RERANK_INPUT (10) bij undefined. Verhoogd
   * naar 20 op v0.6.2 — meer kandidaten om uit te kiezen, langere rerank-
   * prompt acceptabel omdat we hem selectief skippen.
   */
  rerankInputMax?: number;
  /**
   * v0.6.2: max chunks in de uiteindelijke answer-context (MAX_CONTEXT_CHARS
   * blijft de byte-cap). Default = retrievalTopK / TOP_K. 5 op v0.6.2 om
   * de extra kandidaten uit topK=8 niet allemaal door te geven.
   */
  finalContextMaxChunks?: number;
  /**
   * v0.6.2: bij history-aanwezigheid de multi-turn addon ALLEEN prepend
   * wanneer needsHistoryResolution(question)=true (keyword-heuristic op
   * referentie-aanwijzingen). Default false (v0.6.1-pad: prepend bij elke
   * non-empty history). Bij true: korte prompts voor zelfstandige
   * vervolgvragen die geen referentie nodig hebben.
   */
  adaptiveHistoryResolution?: boolean;
  /**
   * v0.6.2: zet gap_kind in extras (en daarmee in query_log) bij fallback/
   * low-confidence/low-grounding/off_topic-paden. Gebruikt door de
   * knowledge-gap-snapshot voor fijnere classificatie. Default false:
   * legacy gedrag (snapshot leunt op kind='fallback' OR category='off_topic').
   */
  knowledgeGapLogging?: boolean;
  /**
   * v0.6.3: welk decision-pad krijgt een composite query (subQueryCount > 1)?
   * v0.6.2-diagnose: composite-queries gingen naar 'careful', dat triggerde
   * shouldRegenerateClaims=true en gaf op 2 specifieke cases zware regressie
   * (-2.00 en -1.67 vs v0.5). v0.6.3 zet dit op 'standard' zodat alleen
   * weak-retrieval echt careful wordt. Default 'careful' (= v0.6.2-gedrag).
   */
  compositeQueryPath?: 'careful' | 'standard';
  /**
   * v0.6.3: gebruikt hard-fact verifier de generieke `numbers`-set als
   * fallback om money-claims te ondersteunen? V0.6.1/v0.6.2 deden dat
   * (default true) maar dat geeft false-positives: "€249 Business tier"
   * passeert als "249" als substring ergens in een chunk voorkomt
   * (bv. pricing-tabel "300 gesprekken | €0,07 / extra"). v0.6.3 zet dit
   * op false zodat money alleen matcht tegen source-money. Default true
   * (= v0.6.1/v0.6.2-gedrag voor append-only).
   */
  hardFactNumericFallback?: boolean;
  /**
   * v0.8.1: anti-adoptie. Na generatie detecteert de pipeline of een
   * entiteit (persoonsnaam) die de user in de chat-history introduceerde —
   * en die NIET in de retrieval-sources voorkomt — tóch in het antwoord
   * verschijnt (= mogelijke adoptie van een geplant onwaar feit). Zo ja:
   * voed de BESTAANDE claim-regenerate-trigger (Stage 15) als extra OR-term,
   * met een instructie de onbevestigde entiteit niet over te nemen. Geen
   * nieuwe parallelle gate; vereist bot.claimRegenerateEnabled om effect te
   * hebben. Default false/undefined → identiek aan v0.7.3 (append-only).
   */
  historyEntityVerification?: boolean;
  /**
   * v0.9 (iter2): deterministisch hard-fact-weiger-template. Wanneer de bot een
   * hard feit (bedrag/datum/aantal) noemt dat NIET in de bronnen staat ÉN de
   * retrieval ZWAK/MEDIUM was, vervang het antwoord deterministisch door een
   * eerlijk weiger/doorverwijs-template i.p.v. de (empirisch onbetrouwbare)
   * tweede LLM-poging. Adresseert de dominante out_of_corpus_overanswer-
   * faalmodus. De retrieval-sterkte-conditie (NIET claim-confidence — een
   * fabricatie heeft confidence≈1) spaart gegronde tiered-calc bij STRONG
   * retrieval → geen over-refusal. Consolidatie in de bestaande regenerate-laag;
   * geen parallelle gate, geen prompt-only fix. Vereist bot.claimRegenerateEnabled
   * + bot.adaptiveHardFactVerification. Default false/undefined → identiek aan
   * v0.8.1 (append-only).
   */
  hardFactDeterministicRefusal?: boolean;
  /**
   * v0.9.1: safety-aware verfijning van hardFactDeterministicRefusal. De weiger-
   * gate vuurt NIET wanneer de draft al een spoed-/nood-doorverwijzing bevat
   * (112/huisartsenpost/ambulance/spoedeisende hulp). Reden: NUMBER_RE extraheert
   * élk getal ≥2 cijfers als hard feit, dus een correct "bel 112"-noodadvies telt
   * als ongegrond getal (112 staat per definitie niet in een fysio-/dakdekker-
   * corpus) → de generieke weigering overschreef in v0.9 een levensreddende
   * doorverwijzing (hh-globex-spoed-regressie). Prijs-/datum-fabricaties bevatten
   * deze termen nooit → de anti-fabricatie-upside van v0.9 blijft intact. Default
   * false/undefined → v0.9 byte-identiek (append-only).
   */
  hardFactRefusalSafetyAware?: boolean;
  /**
   * v0.10 (C11): over-refusal-tune. Beperkt de deterministische hard-fact-weiger-
   * gate (hardFactDeterministicRefusal) tot de FABRICATIE-KLASSE: de gate vuurt
   * alléén nog wanneer een ONGEGROND feit in {money, percentage, date} valt, niet
   * bij een benign generiek getal/jaartal/aantal dat in een verder gegrond antwoord
   * landt. Reden: v0.9.3 weigert ~13% van de beantwoordbare vragen doordat een
   * gegrond antwoord met een benign getal dat net niet exact in de bron staat, bij
   * medium-retrieval (top1Sim 0,50–0,56) door de generieke weigering wordt vervangen.
   * De fabricatie-klasse (geld/datum/percentage) is precies waar hallucinatie
   * schadelijk is → die blijft 100% gegate (de aoc-* geld-fabricaties blijven
   * medium-retrieval gevangen). Vereist hardFactDeterministicRefusal=true om effect
   * te hebben. Default false/undefined → v0.9.3-gedrag (alle ongegronde harde feiten
   * gaten, append-only). Zie shouldDeterministicallyRefuseHardFact (hard-facts.ts).
   */
  hardFactRefusalFabricationClassOnly?: boolean;
  /**
   * v0.9.1: deterministische off-domein-code-guard. Wanneer het antwoord code/
   * programmeer-syntax bevat (``` , def/function, for-in-range, etc.) wordt het
   * vervangen door de off-topic-refusal. Een klantcontact-bot van een niet-
   * technische org hoort nooit code te produceren; de prompt-instructie alleen
   * houdt gpt-4o-mini daar niet betrouwbaar van af (scope-acme-code flake).
   * Default false/undefined → v0.9 byte-identiek (append-only).
   */
  offDomainCodeRefusal?: boolean;
  /**
   * v0.9.1: echte bron-links. Wanneer aan, krijgt de answer-LLM per gecrawlde
   * website-bron de echte `website_pages.url` (+ titel) mee én de instructie
   * om UITSLUITEND naar die URLs te linken — nooit een URL/pad te verzinnen.
   * Een server-side sanitizer strijkt daarna elke link met een niet-aangeleverde
   * of niet-http(s) URL terug naar platte tekst (de harde anti-hallucinatie-
   * garantie). Beide effecten zijn inert wanneer de context géén bron-URL bevat
   * (document-only orgs, DEV_ORG eval) → byte-identiek aan voorheen.
   *
   * STANDAARD AAN vanaf v0.9.1 (besluit 2026-05-29); nieuwe versies erven dit
   * via de spread-idioom en houden het aan tenzij expliciet uitgezet.
   */
  sourceLinksEnabled?: boolean;
  /**
   * v0.7: which LENGTH/STYLE instruction set wordt aangezogen via
   * lib/v0/style.ts → buildSystemPrompt. 'v1' (default/undefined) = bestaande
   * strings; 'v2' = scherpere lengtes (kort=1-2 zinnen, normaal=adaptief,
   * lang=gestructureerd); 'v3' (v0.7.2) = tune van v2 die context/wedervraag/
   * CTA teruggeeft (too_curt-fix). Per-versie zodat oudere eval-runs
   * reproduceerbaar blijven.
   */
  outputStyleVersion?: 'v1' | 'v2' | 'v3';
  /**
   * Eval budget (uit #15) — max gemiddelde bot-latency in ms voor de eval-runner.
   * Bij overschrijding zet de runner exit-code 1 (regressie-signaal). Per versie
   * omdat v0.4 met cascade nooit dezelfde latency haalt als v0.1.
   */
  evalBudgetMs: number;
  /** Eval budget — max gemiddelde bot-cost in USD per query. */
  evalBudgetUsd: number;
  /**
   * V1+: when true, the retrieval RPC receives a `p_chatbot_id` param to scope
   * results to a single chatbot's knowledge base. When false (V0, single-bot per
   * org), the param is omitted — the RPC filters on org only.
   */
  chatbotScoped: boolean;
};

export type RagPersona = {
  /**
   * Naam zoals de bot zichzelf noemt. Wordt in {{COMPANY}} ingelezen.
   * DEV_ORG: "ChatManta". Anders: bedrijfsnaam ("Dakwerken De Boer").
   */
  company: string;

  /**
   * Optionele aanvulling op de bedrijfsnaam. Bij DEV_ORG: " — een product
   * van Jorion Solutions" (incl. leading punctuation). Bij anderen: "".
   * Wordt direct na {{COMPANY}} geplakt zodat één template beide vormen
   * (parent / standalone) dekt.
   */
  companySuffix: string;

  /**
   * Beschrijving van de typische gesprekspartner — staat na "Je
   * gesprekspartners zijn ". DEV_ORG: "meestal mensen die het project leren
   * kennen: vrienden van de founders, geïnteresseerden, en de founders
   * zelf". Anders org-specifiek.
   */
  audience: string;

  /**
   * Pedagogische voorbeelden in de inline-citaties-uitleg van V0.3+ system
   * prompts. Twee voorbeelden zodat we de "[1]" en "[2][3]"-patronen kunnen
   * blijven tonen. Org-specifiek, anders leest de LLM "ChatManta gebruikt
   * pgvector" terwijl hij accountancy-content moet citeren.
   */
  citationExample1: string;
  citationExample2: string;

  /**
   * Smalltalk-voorbeeld voor `"hey"` in de preProcessSystem. DEV_ORG:
   * "Hoi! Leuk dat je er bent. Wat wil je weten over ChatManta?". Anders
   * passend bij de org-naam.
   */
  smalltalkGreeting: string;

  /**
   * Smalltalk-voorbeeld voor `"wat kan je?"` in de preProcessSystem.
   * Beschrijft kort welke onderwerpen de bot kan toelichten.
   */
  smalltalkHelpScope: string;

  /**
   * Domein-keywords voor (a) de general-knowledge prompt ("vraag binnen ons
   * domein: ..."), (b) de DOMAIN_ALLOWLIST in reclassify-pure.ts, en (c)
   * de off-topic refusal-zin. DEV_ORG: ["MKB", "SaaS", "AI", "RAG",
   * "chatbots", "klantcontact", "ondernemerschap", "marketing"].
   */
  domainKeywords: string[];

  /**
   * Sluitzin van het general-knowledge antwoord (na GENERAL_OPENING + LLM-
   * core). DEV_ORG: " Wil je weten hoe ChatManta hier specifiek mee omgaat?
   * Vraag gerust." — wordt 1-op-1 achter de core geplakt.
   */
  generalKnowledgeClosing: string;

  /**
   * Korte beschrijving voor de off-topic refusal — staat na "Ik help met
   * vragen rondom ". DEV_ORG: "ChatManta en aanverwante onderwerpen — denk
   * aan MKB-tech, chatbots, klantcontact".
   */
  offTopicScope: string;
};
