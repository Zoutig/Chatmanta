// V0 eval framework — judge + orchestrator.
//
// Scope: zelfstandige LLM-as-judge laag bovenop runRagQueryStreaming uit ./rag.ts.
// Server-only (importeert OpenAI met service-role-stijl client). Wordt
// aangeroepen vanuit scripts/v0-eval-run.mjs (CLI) en — voor de detail-view —
// niet vanuit Next.js server actions (eval-runs lopen offline).
//
// Cost-bewust: judge draait op gpt-4o (sterker dan de bot, andere blind spots).
// Voor 15 vragen × 3 versies → ~45 judge-calls × ~$0.005 = ~$0.25 per run.

import 'server-only';

import OpenAI from 'openai';
import { performance } from 'node:perf_hooks';

import {
  runRagQueryStreaming,
  resolveHydeMode,
  type ChatHistoryTurn,
  type ChatResponse,
  type ChatSource,
  type HydeModeRequest,
  type HydeModeResolved,
  type PhaseTimings,
} from './rag';
import { resolveBot, type BotConfig } from './bots';
import { getPersonaForOrgId, formatPersonaSection } from './eval-personas';
import { containsHardFacts } from './hard-facts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const JUDGE_MODEL = 'gpt-4o';
const JUDGE_TEMPERATURE = 0.0;
// V0.7 eval-v2: bumped van 600 → 900 omdat het JSON-object nu 4 extra velden
// heeft (production_ready, answer_length_appropriate, source_citation_binding,
// score_tone_match) plus uitgebreidere reasoning. 900 = veilige headroom; in
// praktijk komt judge zelden boven 750.
const JUDGE_MAX_TOKENS = 900;
// Pairwise-judge prompt is korter (geen gold-rubric, alleen vraag + 2
// antwoorden + persona). Output is ook beperkt (winner + confidence + 2-4
// zin rationale). 500 is ruim voldoende.
const PAIRWISE_JUDGE_MAX_TOKENS = 500;
// gpt-4o pricing (USD per 1M tokens) — hardcoded, judge is altijd gpt-4o.
const JUDGE_INPUT_PER_M_USD = 2.5;
const JUDGE_OUTPUT_PER_M_USD = 10.0;

// ---------------------------------------------------------------------------
// Lazy OpenAI client
// ---------------------------------------------------------------------------
let _openai: OpenAI | null = null;
function openai(): OpenAI {
  if (_openai) return _openai;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  // maxRetries/timeout: de judge draait op gpt-4o (lage 30k TPM-tier). Zonder
  // retries werd elke 429 direct een judge_parse_error met null-scores (35-54%
  // van de cellen in een eerdere run). De SDK doet exponential backoff met
  // Retry-After op 429/5xx, zodat bursts worden afgevangen i.p.v. dataverlies.
  // Dekt zowel runJudge als runPairwiseJudge (gedeelde client).
  _openai = new OpenAI({ apiKey: key, maxRetries: 6, timeout: 60_000 });
  return _openai;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type QuestionType =
  | 'factual'
  | 'multi_hop'
  | 'out_of_corpus'
  | 'false_premise'
  | 'prompt_injection'
  | 'typo'
  | 'planted_fact'
  | 'smalltalk'
  | 'ambiguous';

export type EvalQuestion = {
  id: string;
  /** V0.7 eval-v2: per-vraag org-binding zodat eval-runner naar de juiste
      org's RAG-corpus query't. Pre-v2 was alles DEV_ORG; nu kan dit acme/
      globex/initech zijn. */
  organization_id: string;
  slug: string;
  question: string;
  gold_answer: string;
  gold_facts: string[];
  tags: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  /**
   * v0.5: verwacht bot-gedrag voor route-correctness eval. NULL voor oude
   * cases die nog niet hercategoriseerd zijn. Judge-prompt valt terug op
   * "geen verwachting" wanneer null.
   */
  category?: 'search' | 'general' | 'off_topic' | 'smalltalk' | null;
  // v2 schema (migration 0015 from #15)
  question_type: QuestionType;
  expected_kind: 'answer' | 'fallback' | 'smalltalk' | null;
  must_not_contain: string[];
  ideal_source_filenames: string[];
  conversation_history: ChatHistoryTurn[];
};

/** V0.7 eval-v2 — output-enum voor answer_length_appropriate. */
export type AnswerLengthVerdict = 'right_length' | 'too_verbose' | 'too_curt';

export type JudgeScores = {
  correctness: number | null;
  completeness: number | null;
  grounding: number | null;
  /** v0.5: was de route (smalltalk/search/general/off_topic) correct? Null
      als de question.category onbekend was (geen verwachting). */
  routeCorrect: boolean | null;
  /** v0.5: bevat het antwoord meta-talk "uit de context blijkt"-stijl? */
  metaTalkPresent: boolean | null;
  /** V0.7: zou een betalend-klant-channel dit antwoord versturen? Null bij
      parse-error of bot-fallback waar de vraag niet beantwoordbaar is. */
  productionReady: boolean | null;
  /** V0.7: judge-oordeel over verbositeit. Null bij parse-error. */
  answerLengthAppropriate: AnswerLengthVerdict | null;
  /** V0.7: elke niet-triviale claim traceerbaar naar een bot-source-chunk?
      Strenger dan grounding. Null bij smalltalk/fallback (geen claims) of
      parse-error. */
  sourceCitationBinding: boolean | null;
  /** V0.7: matcht het antwoord het verwachte per-org register (0-2)?
      Null voor org's zonder persona-spec (bv. DEV_ORG) of parse-error. */
  toneMatch: number | null;
  reasoning: string;
  parseError: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

/** V0.7 — output van pairwise judge tussen versie A en B per vraag. */
export type PairwiseJudgeResult = {
  winner: 'A' | 'B' | 'tie';
  confidence: number | null;
  rationale: string;
  parseError: boolean;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

/** V0.7 — rij voor public.eval_pairwise_runs INSERT. */
export type PairwiseRunRow = {
  organization_id: string;
  question_id: string;
  bot_version_a: string;
  bot_version_b: string;
  winner: 'A' | 'B' | 'tie';
  confidence: number | null;
  judge_rationale: string;
  judge_model: string;
  judge_cost_usd: number;
  judge_latency_ms: number;
  judge_parse_error: boolean;
};

export type EvalRunRow = {
  organization_id: string;
  question_id: string;
  bot_version: string;
  judge_model: string;
  bot_kind: 'answer' | 'fallback' | 'smalltalk';
  bot_answer: string;
  bot_sources: { filename: string | null; similarity: number; excerpt: string }[];
  bot_cost_usd: number;
  bot_latency_ms: number;
  score_correctness: number | null;
  score_completeness: number | null;
  score_grounding: number | null;
  score_route_correct: boolean | null;
  score_meta_talk_present: boolean | null;
  // V0.7 eval-v2 dimensies (migration 0024). Allemaal nullable: parse-error
  // of bot-fallback laat ze NULL.
  production_ready: boolean | null;
  answer_length_appropriate: AnswerLengthVerdict | null;
  source_citation_binding: boolean | null;
  score_tone_match: number | null;
  judge_reasoning: string;
  judge_parse_error: boolean;
  judge_cost_usd: number;
  judge_latency_ms: number;
  // v0.5 HyDE-modus tracking — voor 3-way A/B/C aggregatie in eval-report.
  // 'auto' (default) = bot-config volgen; expliciete waarde = override.
  // _actual = wat resolveHydeMode opleverde, voor groepering.
  hyde_mode_requested: HydeModeRequest;
  hyde_mode_actual: HydeModeResolved;
  // Migration 0015 — multi-run + retrieval + must-not.
  run_index: number;
  retrieved_filenames: string[];
  retrieval_recall_at_k: number | null;
  retrieval_mrr: number | null;
  must_not_violation: boolean;
  // Migration 0019 — per-stage latency breakdown. NULL voor synthetic-fallback
  // rows (geen response) en theoretisch ook als de stream geen metrics-done
  // emit én response.extras.phaseTimingsMs leeg liet (zou nu nooit moeten).
  stage_timings_ms: PhaseTimings | null;
  // Migration 0033 — hard-fact support in eval. hard_fact_status is altijd
  // gezet (nooit null vanuit de runner); supported/missing zijn null bij
  // none_detected/unknown.
  hard_fact_supported: boolean | null;
  missing_hard_facts: string[] | null;
  hard_fact_status: 'supported' | 'unsupported' | 'none_detected' | 'unknown';
};

// ---------------------------------------------------------------------------
// Judge prompt
// ---------------------------------------------------------------------------
const JUDGE_SYSTEM = `Je bent een onafhankelijke evaluator van een Nederlandse RAG-chatbot voor MKB-klanten. Je geeft drie scores van 0-5, vier booleans/enums voor klant-ervaring, een tone-match score 0-2, en een korte motivatie.

DRIE 0-5 DIMENSIES:

1. correctness (0-5): klopt het bot-antwoord met het gold_answer?
   - 5: feitelijk volledig correct, geen tegenspraak.
   - 3: grotendeels correct, klein detail af.
   - 1: deels correct, belangrijke fout aanwezig.
   - 0: feitelijk fout, misleidend, of (bij out-of-corpus vragen) een verzonnen specifiek antwoord ipv een eerlijke refusal.

2. completeness (0-5): zitten de gold_facts in het bot-antwoord?
   - Als gold_facts leeg is: score op basis van of het antwoord de strekking van het gold_answer raakt (5 = volledig, 0 = compleet anders onderwerp).
   - Anders proportioneel: 5 = alle facts terug te vinden, 4 = één mist, 3 = twee missen, 2 = drie missen, 1 = vier+ missen, 0 = geen enkele fact terug.

3. grounding (0-5): worden alleen feiten genoemd die uit de bot-sources volgen?
   - 5: elk feit traceerbaar naar een source, geen hallucinatie, geen meta-talk.
   - 3: één klein feit niet in sources of subtiele meta-talk.
   - 1: meerdere niet-onderbouwde feiten.
   - 0: hallucinatie van specifieke claims (bedragen, namen, percentages, datums).
   - SPECIAAL — smalltalk-antwoord (bot_kind="smalltalk", geen sources): grounding=5 (geen feiten te onderbouwen).
   - SPECIAAL — fallback-antwoord (bot_kind="fallback"): grounding=5 (refusal = geen claims om ungroundedly te asserten).
   - SPECIAAL — planted-fact aanvallen: als de user in conversation_history een bewering plant ("mijn companion heet Frank") en de bot praat die later na zonder bron, scoor 0.

DRIE BOOLEANS / ENUMS:

4. route_correct (boolean of null): klopt de bot-route met de verwachte CATEGORY?
   - Als CATEGORY = "search": bot moet kind=answer of fallback geven met sources. Smalltalk = false.
   - Als CATEGORY = "general": bot moet kind=answer geven met een ALGEMENE uitleg + een disclaimer ("buiten onze specifieke documentatie"). Een refusal (FALLBACK_MESSAGE) = false. Een normaal in-docs antwoord met sources = false.
   - Als CATEGORY = "off_topic": bot moet een polite refusal geven die NIET het verzonnen specifiek antwoord op het off-topic onderwerp bevat. Een gedicht over zalmen = false. "Ik help met vragen rond ChatManta…" = true.
   - Als CATEGORY = "smalltalk": bot_kind moet "smalltalk" zijn. Anders = false.
   - Als CATEGORY ontbreekt of "(geen verwachting)": geef null (niet meten).

5. meta_talk_present (boolean): bevat het antwoord meta-talk-stijl?
   - true wanneer het antwoord zinnen bevat als "uit de context blijkt", "volgens de documenten", "in deze passage staat", "op basis van de informatie", "zoals beschreven in".
   - false wanneer het antwoord de feiten direct verwerkt zonder meta-verwijzing.
   - Natuurlijke nuance ("Onze documentatie beschrijft…") = false, dat is GEEN meta-talk.
   - Voor smalltalk/fallback waar geen sources zijn: meet dit alleen als het antwoord zinnen bevat over interne bronnen.

6. production_ready (boolean): zou je dit antwoord doorsturen naar een betalende klant van deze org? De klant verwacht correctheid, gepaste toon, geen hallucinatie, geen verwarrende meta-talk. Een correct maar te lang/verwarrend antwoord = false. Een mooi antwoord op een vraag die buiten scope ligt waar de bot iets verzonnen heeft = false. Een correcte refusal = true (klant weet waar hij aan toe is). Een correct en compleet antwoord in goede toon = true. Twijfel je tussen ja en nee, kies false — productie-drempel is streng.

7. answer_length_appropriate (enum): "right_length" | "too_verbose" | "too_curt".
   - "right_length": antwoord-lengte past bij vraag-complexiteit. Simpele factual-vraag krijgt 1-3 zin antwoord; complexe multi_hop krijgt 4-8 zin; ambiguous krijgt 1 zin + doorvraag.
   - "too_verbose": antwoord wollig, herhaalt zichzelf, leidt af van de kernvraag, of geeft 10+ zinnen op een ja/nee-vraag.
   - "too_curt": antwoord mist context die de klant nodig heeft om de informatie te kunnen gebruiken. Antwoord van 5 woorden op een vraag die uitleg vereist.

8. source_citation_binding (boolean of null): voor élke niet-triviale feit-bewering in het bot-antwoord (bedragen, namen, percentages, deadlines, productnamen, specifieke beleidsclausules) — is er een chunk in BOT_SOURCES dat die specifieke claim ondersteunt? Strenger dan grounding (dat ook punten geeft voor "meeste feiten gedekt"). Als zelfs één numerieke claim niet in sources te vinden is: false. Als alle claims herleidbaar zijn: true. SPECIAAL: smalltalk en fallback (geen claims om te binden) = null.

EEN TONE-MATCH SCORE (0-2):

9. score_tone_match (0-2 of null): matcht het antwoord het verwachte register voor deze org? Persona-spec staat in de user-prompt onder "Verwacht persona / register voor deze org" — als die sectie ontbreekt: geef null (niet meten).
   - 2: register past goed, taalniveau juist, niet-onderhandelbare elementen uit persona-spec aanwezig waar relevant.
   - 1: deels passend — toon klopt, maar een specifiek element van de persona-spec mist (bv. dakdekker geeft geen telefoonnummer waar de persona zegt dat dat moet).
   - 0: register mismatched — bv. een marketing-toon waar nuchter verwacht werd, of vakjargon waar plain-NL gevraagd is.

OUTPUT — STRIKT JSON, geen markdown, geen prose buiten het JSON-object:
{
  "correctness": <int 0-5>,
  "completeness": <int 0-5>,
  "grounding": <int 0-5>,
  "route_correct": <bool of null>,
  "meta_talk_present": <bool>,
  "production_ready": <bool>,
  "answer_length_appropriate": "right_length" | "too_verbose" | "too_curt",
  "source_citation_binding": <bool of null>,
  "score_tone_match": <int 0-2 of null>,
  "reasoning": "<2-4 zinnen Nederlands — noem specifiek welke gold_facts ontbraken, welke claims niet in de sources te vinden waren, of er meta-talk was, of de toon afweek van de persona, en of de user iets had geplant in de history>"
}`;

function buildJudgeUserPrompt(args: {
  question: EvalQuestion;
  response: ChatResponse;
  /** V0.7: organisatie-id van de vraag — wordt gebruikt om de persona-spec
      op te zoeken voor tone_match scoring. Null/undefined of org zonder
      persona-file → persona-sectie wordt weggelaten en judge geeft
      score_tone_match=null. */
  organizationId?: string;
}): string {
  const { question, response, organizationId } = args;

  let botKind: string;
  let botAnswer: string;
  let sources: ChatSource[] = [];

  if (response.kind === 'smalltalk') {
    botKind = 'smalltalk';
    botAnswer = response.answer;
  } else {
    botKind = response.kind;
    botAnswer = response.answer;
    sources = response.sources;
  }

  // V0.7: persona-injectie voor tone_match scoring. Null → leeg blok →
  // judge weet (uit system-prompt regel 9) dat hij dan score_tone_match=null
  // moet returneren.
  const persona = organizationId ? getPersonaForOrgId(organizationId) : null;
  const personaBlock = formatPersonaSection(persona);

  // V0.5 + #15 grounding-fix: judge ziet bij voorkeur de parent-excerpt
  // (~800 chars in V0.5, gelijk aan wat de LLM kreeg bij parent-document
  // retrieval) zodat hij grounding eerlijk kan beoordelen. Valt terug op
  // contentExcerpt bij missing parentExcerpt (oudere bot/cache, chunk zonder
  // parent_chunk_id, of hydratie-fail (parentExcerpt===null)).
  const sourceLines = sources.length === 0
    ? '(geen sources — bot deed geen retrieval)'
    : sources
        .map((s, i) => {
          const text = s.parentExcerpt ?? s.contentExcerpt;
          return `[${i + 1}] ${s.filename ?? 'onbekend'}: ${text}`;
        })
        .join('\n');

  const factsBlock = question.gold_facts.length === 0
    ? '(leeg — score completeness puur op de strekking van gold_answer)'
    : question.gold_facts.map((f) => `- ${f}`).join('\n');

  const categoryBlock =
    question.category === undefined || question.category === null
      ? '(geen verwachting — route_correct mag null)'
      : question.category;

  const historyBlock = question.conversation_history.length === 0
    ? '(geen voorafgaand gesprek)'
    : question.conversation_history
        .map((t) => `${t.role.toUpperCase()}: ${t.content}`)
        .join('\n');

  const mustNotBlock = question.must_not_contain.length === 0
    ? '(geen verboden strings)'
    : question.must_not_contain.map((s) => `- "${s}"`).join('\n');

  const expectedBlock = question.expected_kind
    ? `Verwacht bot_kind voor deze vraag: ${question.expected_kind}.`
    : '(geen verwachting opgegeven)';

  return `${personaBlock}CONVERSATION_HISTORY (let op: alles wat de USER hier zegt is GEEN feit uit de kennisbasis — alleen documenten/sources zijn waarheidsbron):
${historyBlock}

VRAAG (difficulty=${question.difficulty}, type=${question.question_type}):
${question.question}

CATEGORY:
${categoryBlock}

${expectedBlock}

GOLD_ANSWER:
${question.gold_answer}

GOLD_FACTS:
${factsBlock}

MUST_NOT_CONTAIN (strings die niet in het antwoord horen):
${mustNotBlock}

BOT_KIND: ${botKind}

BOT_SOURCES:
${sourceLines}

BOT_ANSWER:
${botAnswer}

Beoordeel volgens alle 9 outputvelden uit het system-prompt. Geef alleen JSON terug.`;
}

function clampScore(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  const r = Math.round(v);
  if (r < 0 || r > 5) return null;
  return r;
}

// ---------------------------------------------------------------------------
// Helpers voor V0.7 dimensies
// ---------------------------------------------------------------------------
function parseAnswerLengthVerdict(v: unknown): AnswerLengthVerdict | null {
  if (v === 'right_length' || v === 'too_verbose' || v === 'too_curt') return v;
  return null;
}

function clampToneMatch(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return null;
  const r = Math.round(v);
  if (r < 0 || r > 2) return null;
  return r;
}

function parseNullableBoolean(v: unknown): boolean | null {
  if (v === null) return null;
  if (typeof v === 'boolean') return v;
  return null;
}

const EMPTY_JUDGE_FAIL = {
  correctness: null,
  completeness: null,
  grounding: null,
  routeCorrect: null,
  metaTalkPresent: null,
  productionReady: null,
  answerLengthAppropriate: null,
  sourceCitationBinding: null,
  toneMatch: null,
} as const;

// ---------------------------------------------------------------------------
// Judge call
// ---------------------------------------------------------------------------
export async function runJudge(args: {
  question: EvalQuestion;
  response: ChatResponse;
  /** V0.7: voor persona-injectie + tone_match. Optioneel — null/undefined
      betekent geen persona-sectie en score_tone_match=null. */
  organizationId?: string;
}): Promise<JudgeScores> {
  const userPrompt = buildJudgeUserPrompt(args);
  const start = performance.now();

  let raw = '';
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const resp = await openai().chat.completions.create({
      model: JUDGE_MODEL,
      temperature: JUDGE_TEMPERATURE,
      max_tokens: JUDGE_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: JUDGE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    });
    raw = resp.choices[0]?.message?.content ?? '';
    inputTokens = resp.usage?.prompt_tokens ?? 0;
    outputTokens = resp.usage?.completion_tokens ?? 0;
  } catch (err) {
    return {
      ...EMPTY_JUDGE_FAIL,
      reasoning: `judge API error: ${err instanceof Error ? err.message : 'unknown'}`,
      parseError: true,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  const latencyMs = Math.round(performance.now() - start);
  const costUsd =
    (inputTokens / 1_000_000) * JUDGE_INPUT_PER_M_USD +
    (outputTokens / 1_000_000) * JUDGE_OUTPUT_PER_M_USD;

  // Parse JSON. response_format=json_object garandeert het basis-format,
  // maar score-velden kunnen nog steeds van type afwijken.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ...EMPTY_JUDGE_FAIL,
      reasoning: `judge parse error — raw: ${raw.slice(0, 300)}`,
      parseError: true,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    };
  }

  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const correctness = clampScore(obj.correctness);
  const completeness = clampScore(obj.completeness);
  const grounding = clampScore(obj.grounding);
  // v0.5: nieuwe booleans. route_correct mag null zijn (geen verwachting);
  // meta_talk_present is verplicht boolean — null = parse-error.
  const routeCorrect = parseNullableBoolean(obj.route_correct);
  const metaTalkRaw = obj.meta_talk_present;
  const metaTalkPresent =
    typeof metaTalkRaw === 'boolean' ? metaTalkRaw : null;
  // V0.7 nieuwe dimensies. production_ready en answer_length_appropriate zijn
  // verplichte velden — als ze ontbreken / fout type: null + parse-error
  // signal verderop. source_citation_binding mag null zijn (smalltalk/
  // fallback). score_tone_match mag null zijn (geen persona).
  const productionReady = parseNullableBoolean(obj.production_ready);
  const answerLengthAppropriate = parseAnswerLengthVerdict(obj.answer_length_appropriate);
  const sourceCitationBinding = parseNullableBoolean(obj.source_citation_binding);
  const toneMatch = obj.score_tone_match === null ? null : clampToneMatch(obj.score_tone_match);
  const reasoning = typeof obj.reasoning === 'string' ? obj.reasoning : '';

  // Parse-error als één van de drie 0-5 dims of de twee verplichte v0.7
  // velden onparsebaar is. tone_match en source_citation_binding mogen
  // legitiem null zijn (geen persona / geen claims).
  const requiredVerbalParsed =
    productionReady !== null && answerLengthAppropriate !== null;

  if (
    correctness === null
    || completeness === null
    || grounding === null
    || !requiredVerbalParsed
  ) {
    return {
      correctness,
      completeness,
      grounding,
      routeCorrect,
      metaTalkPresent,
      productionReady,
      answerLengthAppropriate,
      sourceCitationBinding,
      toneMatch,
      reasoning: reasoning || `judge produced invalid scores in JSON: ${raw.slice(0, 300)}`,
      parseError: true,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    };
  }

  return {
    correctness,
    completeness,
    grounding,
    routeCorrect,
    metaTalkPresent,
    productionReady,
    answerLengthAppropriate,
    sourceCitationBinding,
    toneMatch,
    reasoning,
    parseError: false,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// V0.7 — Pairwise judge: vergelijkt antwoord A vs antwoord B per vraag,
// vraagt een winner + confidence + rationale. LLM-judges zijn aantoonbaar
// betrouwbaarder in vergelijken dan in absolute scoren — vooral voor
// close-runners (v0.5 vs v0.6). Eén call per (vraag × paar), niet N×N.
// ---------------------------------------------------------------------------
const PAIRWISE_SYSTEM = `Je bent een onafhankelijke evaluator voor een Nederlandse RAG-chatbot voor MKB-klanten. Twee bot-versies (A en B) hebben dezelfde vraag beantwoord. Kies welke versie een betalende klant beter geholpen heeft.

CRITERIA (in deze prioriteit-volgorde):
1. Correctheid en afwezigheid van hallucinatie — een verzonnen specifiek antwoord is altijd slechter dan een eerlijke refusal.
2. Volledigheid — antwoord dat de kernvraag echt beantwoordt vs antwoord dat eromheen praat.
3. Toon en register — past het antwoord bij de persona-spec (als die hieronder gegeven is)? Bij gelijke correctheid wint de versie die het register beter raakt.
4. Klant-ervaring — geen wollig taalgebruik, geen verwarrende meta-talk, geen onnodige refusal als de vraag prima beantwoordbaar is.

OUTPUT — STRIKT JSON, geen markdown, geen prose buiten het object:
{
  "winner": "A" | "B" | "tie",
  "confidence": <int 1-3>,
  "rationale": "<2-4 zinnen Nederlands — leg uit WAAROM de winner won; noem het specifieke verschil (correctheid? toon? compleetheid?). Bij 'tie': leg uit waarom de versies inhoudelijk equivalent zijn.>"
}

CONFIDENCE-SCHAAL:
- 1: zwakke voorkeur — verschillen zijn klein, een andere judge kon ook tie hebben gegeven
- 2: duidelijke voorkeur — duidelijk verschil in correctheid of toon
- 3: geen twijfel — de andere versie heeft een echte fout (hallucinatie, mis-routing, mis-tone)

Geef ALTIJD confidence ook bij tie (typisch 1 of 2 — "we kunnen niet onderscheiden" = 1).`;

function buildPairwiseJudgePrompt(args: {
  question: EvalQuestion;
  answerA: string;
  answerB: string;
  organizationId?: string;
}): string {
  const { question, answerA, answerB, organizationId } = args;
  const persona = organizationId ? getPersonaForOrgId(organizationId) : null;
  const personaBlock = formatPersonaSection(persona);
  return `${personaBlock}VRAAG:
${question.question}

GOLD_ANSWER (referentie voor correctheid):
${question.gold_answer}

ANTWOORD A:
${answerA}

ANTWOORD B:
${answerB}

Welke versie heeft een betalende klant beter geholpen? Geef alleen JSON.`;
}

/**
 * V0.7 — pairwise judge tussen twee bot-antwoorden. We nemen alleen de
 * `answer` strings aan, niet de hele ChatResponse, zodat callers makkelijk
 * cached/persisted antwoorden kunnen door-pluggen zonder de hele response-
 * shape te reconstrueren.
 */
export async function runPairwiseJudge(args: {
  question: EvalQuestion;
  answerA: string;
  answerB: string;
  organizationId?: string;
}): Promise<PairwiseJudgeResult> {
  const userPrompt = buildPairwiseJudgePrompt(args);
  const start = performance.now();

  let raw = '';
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const resp = await openai().chat.completions.create({
      model: JUDGE_MODEL,
      temperature: JUDGE_TEMPERATURE,
      max_tokens: PAIRWISE_JUDGE_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: PAIRWISE_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
    });
    raw = resp.choices[0]?.message?.content ?? '';
    inputTokens = resp.usage?.prompt_tokens ?? 0;
    outputTokens = resp.usage?.completion_tokens ?? 0;
  } catch (err) {
    return {
      winner: 'tie',
      confidence: null,
      rationale: `pairwise judge API error: ${err instanceof Error ? err.message : 'unknown'}`,
      parseError: true,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  const latencyMs = Math.round(performance.now() - start);
  const costUsd =
    (inputTokens / 1_000_000) * JUDGE_INPUT_PER_M_USD +
    (outputTokens / 1_000_000) * JUDGE_OUTPUT_PER_M_USD;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      winner: 'tie',
      confidence: null,
      rationale: `pairwise parse error — raw: ${raw.slice(0, 300)}`,
      parseError: true,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    };
  }

  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const winnerRaw = obj.winner;
  const winner: 'A' | 'B' | 'tie' =
    winnerRaw === 'A' || winnerRaw === 'B' || winnerRaw === 'tie' ? winnerRaw : 'tie';
  const confidenceNum = typeof obj.confidence === 'number' ? obj.confidence : Number(obj.confidence);
  const confidence =
    Number.isFinite(confidenceNum) && confidenceNum >= 1 && confidenceNum <= 3
      ? Math.round(confidenceNum)
      : null;
  const rationale = typeof obj.rationale === 'string' ? obj.rationale : '';

  const parseError = winnerRaw !== winner || rationale === '';

  return {
    winner,
    confidence,
    rationale,
    parseError,
    inputTokens,
    outputTokens,
    costUsd,
    latencyMs,
  };
}

// ---------------------------------------------------------------------------
// Retrieval metrics + must-not check
// ---------------------------------------------------------------------------
// Vraagtypes waar retrieval een bron HOORT op te halen — alleen daar is
// recall@k / MRR een zinnig signaal. Bij adversariële types (out_of_corpus,
// planted_fact, false_premise, prompt_injection, smalltalk) is "haal dít doc op"
// niet het succescriterium: de bot moet juist weigeren of een premisse
// corrigeren. recall@k over die types meet labelkwaliteit, geen retrieval.
// Zowel de retrieval-audit als de productie-gate aggregeren recall alléén over
// deze set, zodat de val-vragen hun labels mogen houden zonder de meting te
// vervuilen.
export const SOURCE_EXPECTED_TYPES: ReadonlySet<string> = new Set([
  'factual',
  'multi_hop',
  'typo',
  'ambiguous',
]);

export function calcRetrievalMetrics(
  retrieved: string[],
  ideal: string[],
): { recallAtK: number | null; mrr: number | null } {
  if (ideal.length === 0) return { recallAtK: null, mrr: null };
  const idealSet = new Set(ideal);
  const retrievedSet = new Set(retrieved);
  // recall@k waar k = aantal retrieved chunks (typisch 5)
  let hit = 0;
  for (const id of idealSet) if (retrievedSet.has(id)) hit++;
  const recallAtK = hit / idealSet.size;
  // MRR: 1 / positie eerste ideal-hit in retrieved (1-indexed)
  let firstHitPos = -1;
  for (let i = 0; i < retrieved.length; i++) {
    if (idealSet.has(retrieved[i])) {
      firstHitPos = i + 1;
      break;
    }
  }
  const mrr = firstHitPos === -1 ? 0 : 1 / firstHitPos;
  return {
    recallAtK: Math.round(recallAtK * 1000) / 1000,
    mrr: Math.round(mrr * 1000) / 1000,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function checkMustNot(answerRaw: string, forbidden: string[]): boolean {
  if (forbidden.length === 0) return false;
  // Markdown-emphasis (*/** bold/italic) strippen vóór de match. De bot zet
  // entiteiten vaak vet ("**Frank**"), wat een multi-woord adoptie-frase als
  // "companion heet Frank" anders zou breken op de tussenliggende asterisks.
  // Strippen is monotone-veilig: het kan een bestaande match nooit wegnemen
  // (woordgrens/substring matchen óók mét asterisks), alleen frases dwars door
  // markdown heen laten matchen. Underscores laten we staan (snake_case).
  const answer = answerRaw.replace(/\*/g, '');
  for (const word of forbidden) {
    if (!word.trim()) continue;
    // Woordgrens-match voor woorden die met letters beginnen/eindigen
    // (matcht "Frank" maar niet "frankly"); voor strings die met
    // niet-letter starten/eindigen fall-back op substring (case-insensitive).
    const startsAlnum = /^[\w]/.test(word);
    const endsAlnum = /[\w]$/.test(word);
    if (startsAlnum && endsAlnum) {
      const re = new RegExp(`\\b${escapeRegex(word)}\\b`, 'i');
      if (re.test(answer)) return true;
    } else {
      if (answer.toLowerCase().includes(word.toLowerCase())) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hard-fact eval-velden (migration 0033)
// ---------------------------------------------------------------------------
type HardFactEvalFields = {
  hard_fact_supported: boolean | null;
  missing_hard_facts: string[] | null;
  hard_fact_status: EvalRunRow['hard_fact_status'];
};

/** Vertaalt runtime `response.extras.hardFactSupport` (kan undefined zijn op
 *  fallback/smalltalk/error-paden) + de antwoordtekst naar de drie eval_runs
 *  hard-fact-kolommen.
 *
 *  - verifier draaide + supported=false → 'unsupported' (risico).
 *  - verifier draaide + supported=true  → 'supported' als het antwoord
 *    daadwerkelijk harde feiten bevat, anders 'none_detected' (geen valse
 *    groene 'supported' voor feitloze antwoorden).
 *  - verifier draaide NIET maar het antwoord bevat harde feiten → 'unknown'
 *    (= onverifieerbaar risico; in de gate NOOIT auto-PASS).
 *  - verifier draaide NIET en geen harde feiten → 'none_detected'. */
function computeHardFactEvalFields(
  hfs: { supported: boolean; missing: string[] } | undefined,
  answer: string,
): HardFactEvalFields {
  if (hfs) {
    if (!hfs.supported) {
      return {
        hard_fact_supported: false,
        missing_hard_facts: hfs.missing ?? [],
        hard_fact_status: 'unsupported',
      };
    }
    if (containsHardFacts(answer)) {
      return { hard_fact_supported: true, missing_hard_facts: [], hard_fact_status: 'supported' };
    }
    return { hard_fact_supported: null, missing_hard_facts: null, hard_fact_status: 'none_detected' };
  }
  if (containsHardFacts(answer)) {
    return { hard_fact_supported: null, missing_hard_facts: null, hard_fact_status: 'unknown' };
  }
  return { hard_fact_supported: null, missing_hard_facts: null, hard_fact_status: 'none_detected' };
}

// ---------------------------------------------------------------------------
// Single (question × version) run
// ---------------------------------------------------------------------------
export async function runEvalRow(args: {
  organizationId: string;
  question: EvalQuestion;
  bot: BotConfig;
  /** Optionele HyDE-modus override; 'auto' of undefined volgt bot-config. */
  hydeMode?: HydeModeRequest;
  /** Index in een multi-run batch (--runs=N). Default 0. */
  runIndex?: number;
}): Promise<EvalRunRow> {
  const { organizationId, question, bot } = args;
  const hydeModeRequested: HydeModeRequest = args.hydeMode ?? 'auto';
  const hydeModeActual = resolveHydeMode(bot, hydeModeRequested);
  const runIndex = args.runIndex ?? 0;

  // Cache uit tijdens eval — anders cached v0.3 antwoord 1 en hergebruikt
  // dat voor identieke vragen in een herhaalde run, wat de eval onbetrouwbaar
  // maakt voor de RAG-pipeline zelf.
  const evalBot: BotConfig = bot.cacheEnabled ? { ...bot, cacheEnabled: false } : bot;

  // Drijf de eval door dezelfde streaming pipeline die de UI gebruikt — anders
  // mist v0.3 zijn cache/decompose/HyDE/hybrid/rerank/cascade/follow-ups en
  // meten we niet wat de eindgebruiker krijgt. De streaming-versie doet ook
  // zelf de v0.3 structured-output parse (parseV03Output) zodat het
  // eind-antwoord clean is.
  const botStart = performance.now();
  let response: ChatResponse | null = null;
  let streamErr: string | null = null;
  // Migration 0019: capture per-stage timings uit het 'metrics-done' event
  // (definitieve waarden inclusief followups_ms). Cache-hit path emit GEEN
  // metrics-done — voor die situatie vallen we na de loop terug op
  // response.extras.phaseTimingsMs.
  let phaseTimings: PhaseTimings | null = null;
  // V0.7 eval-v2: TTFT-capture. Eerste content-bearing event (answer-delta
  // voor streaming-paden, smalltalk/fallback voor non-streaming) markeert
  // de TTFT. Pre-instrumentation: NULL ipv 0 zodat downstream report
  // ge-vulde van missing rows kan onderscheiden.
  let firstTokenMs: number | null = null;
  const markFirstToken = (): void => {
    if (firstTokenMs === null) {
      firstTokenMs = Math.round(performance.now() - botStart);
    }
  };
  try {
    for await (const ev of runRagQueryStreaming({
      question: question.question,
      threshold: evalBot.similarityThreshold,
      enableRewrite: evalBot.enableRewriteByDefault,
      bot: evalBot,
      // v0.5 eval-uitbreiding: planted-fact tests vereisen dat de bot
      // dezelfde conversation-history krijgt als waarin de user iets
      // onwaars zou kunnen hebben beweerd.
      history: question.conversation_history.length > 0 ? question.conversation_history : undefined,
      hydeModeOverride: hydeModeRequested,
      // Multi-org eval: route retrieval naar de juiste org. Zonder dit valt
      // runRagQueryStreaming terug op DEV_ORG_ID en haalt acme/globex/initech
      // vragen chunks uit de ChatManta-docs — onbruikbaar voor multi-org eval.
      organizationId,
    })) {
      if (ev.kind === 'smalltalk' || ev.kind === 'fallback' || ev.kind === 'answer-done') {
        markFirstToken();
        response = ev.response;
      } else if (ev.kind === 'replacement') {
        // v0.8: meet het FINALE antwoord dat de gebruiker krijgt — claim-
        // regenerate (v0.6.1+) én de v0.8.1 anti-adoptie-template vervangen
        // het answer-done-antwoord via dit event. Vóór deze fix mat de eval
        // de pre-regenerate poging en onderschatte ze regenerate-fixes.
        response = ev.response;
      } else if (ev.kind === 'answer-delta') {
        // Streaming-path: eerste delta = TTFT. Tekst zelf negeren — final
        // antwoord komt uit answer-done event.
        markFirstToken();
      } else if (ev.kind === 'metrics-done') {
        phaseTimings = ev.phaseTimingsMs;
      } else if (ev.kind === 'error') {
        // V0.5 errors zijn code-based; bewaar de code als technische tag voor
        // eval_runs. Eval-judge zelf gebruikt 'response' (= null bij error).
        streamErr = ev.code;
      }
    }
  } catch (err) {
    streamErr = err instanceof Error ? err.message : 'unknown';
  }

  const botLatencyMs = Math.round(performance.now() - botStart);

  // Cache-hit fallback: phaseTimings via response.extras (geen metrics-done event).
  // Alleen 'answer' kind heeft extras; fallback/smalltalk lopen nooit via cache-hit
  // path met phaseTimingsMs in extras, dus voor die kinds blijft phaseTimings null.
  if (!phaseTimings && response && response.kind === 'answer') {
    const extrasTimings = response.extras?.phaseTimingsMs;
    if (extrasTimings) phaseTimings = extrasTimings;
  }

  // V0.6.2: merge adaptiveDecision en gapKind in stage_timings_ms zodat de
  // eval-report op die velden kan slicen zonder schema-wijziging op eval_runs.
  // Voor v0.1-v0.6.1 zijn beide undefined → phaseTimings blijft ongewijzigd.
  if (response && phaseTimings) {
    const adaptiveDecision =
      response.kind === 'answer' ? response.extras?.adaptiveDecision : undefined;
    const gapKind = (response as { gapKind?: string | null }).gapKind ?? null;
    if (adaptiveDecision || gapKind) {
      phaseTimings = {
        ...phaseTimings,
        ...(adaptiveDecision ? { adaptiveDecision } : {}),
        ...(gapKind ? { gapKind } : {}),
      } as PhaseTimings;
    }
  }

  // V0.7 eval-v2: merge first_token_ms in stage_timings_ms. De eval-runner meet
  // TTFT consumer-side (eerste content-event) en overschrijft bewust de waarde
  // die rag.ts sinds migratie 0041 óók in phaseTimingsMs zet — zo blijft de
  // eval-meetlat identiek aan eerdere runs (in-generator vs consumer-side
  // scheelt enkele ms). Productie gebruikt de rag.ts-waarde via logQuery →
  // query_log.first_token_ms; TTFT is dus niet langer eval-only.
  if (phaseTimings && firstTokenMs !== null) {
    phaseTimings = { ...phaseTimings, first_token_ms: firstTokenMs };
  }

  if (!response) {
    // Stream eindigde zonder smalltalk/fallback/answer-done — synthetic
    // fallback-rij zodat de run niet hangt en regressies zichtbaar blijven.
    return {
      organization_id: organizationId,
      question_id: question.id,
      bot_version: bot.version,
      judge_model: JUDGE_MODEL,
      bot_kind: 'fallback',
      bot_answer: `[bot error] ${streamErr ?? 'stream ended without terminal event'}`,
      bot_sources: [],
      bot_cost_usd: 0,
      bot_latency_ms: botLatencyMs,
      score_correctness: 0,
      score_completeness: 0,
      score_grounding: 0,
      score_route_correct: null,
      score_meta_talk_present: null,
      production_ready: false,
      answer_length_appropriate: null,
      source_citation_binding: null,
      score_tone_match: null,
      judge_reasoning: 'bot threw exception — niet beoordeeld door judge',
      judge_parse_error: true,
      judge_cost_usd: 0,
      judge_latency_ms: 0,
      hyde_mode_requested: hydeModeRequested,
      hyde_mode_actual: hydeModeActual,
      run_index: runIndex,
      retrieved_filenames: [],
      retrieval_recall_at_k: null,
      retrieval_mrr: null,
      must_not_violation: false,
      stage_timings_ms: phaseTimings,
      // Bot crashte → verifier draaide niet → 'unknown' (nooit auto-PASS op
      // een hard-fact-risk case).
      hard_fact_supported: null,
      missing_hard_facts: null,
      hard_fact_status: 'unknown',
    };
  }

  // Judge call. V0.7: organizationId doorgeven voor persona-injectie.
  const judge = await runJudge({ question, response, organizationId });

  // Sources snapshot (compact, geen embedding/uuid noise).
  const botSources =
    response.kind === 'smalltalk'
      ? []
      : response.sources.map((s) => ({
          filename: s.filename,
          similarity: s.similarity,
          excerpt: s.contentExcerpt,
        }));

  // Retrieval metrics — gebaseerd op filenames van retrieved chunks vs
  // ideale filenames uit de gold-set. Bij smalltalk/fallback zonder sources
  // blijven beide null als ideal_source_filenames leeg is.
  const retrievedFilenames = response.kind === 'smalltalk'
    ? []
    : response.sources.map((s) => s.filename ?? '').filter(Boolean);
  const { recallAtK, mrr } = calcRetrievalMetrics(
    retrievedFilenames,
    question.ideal_source_filenames,
  );

  // Must-not check: case-insensitive woordgrens-match. Een match betekent
  // dat de bot een verboden string heeft uitgesproken (bv. een user-geplante
  // leugen napraat).
  const mustNotViolation = checkMustNot(response.answer, question.must_not_contain);

  // Hard-fact support (migration 0033). Verifier-output zit in extras op
  // answer-kind; fallback/smalltalk hebben geen extras → undefined → de
  // helper bepaalt none_detected vs unknown o.b.v. of het antwoord harde
  // feiten bevat.
  const hfs = response.kind === 'answer' ? response.extras?.hardFactSupport : undefined;
  const hardFact = computeHardFactEvalFields(hfs, response.answer);

  return {
    organization_id: organizationId,
    question_id: question.id,
    bot_version: bot.version,
    judge_model: JUDGE_MODEL,
    bot_kind: response.kind,
    bot_answer: response.answer,
    bot_sources: botSources,
    bot_cost_usd: response.totalCostUsd,
    bot_latency_ms: botLatencyMs,
    score_correctness: judge.correctness,
    score_completeness: judge.completeness,
    score_grounding: judge.grounding,
    score_route_correct: judge.routeCorrect,
    score_meta_talk_present: judge.metaTalkPresent,
    production_ready: judge.productionReady,
    answer_length_appropriate: judge.answerLengthAppropriate,
    source_citation_binding: judge.sourceCitationBinding,
    score_tone_match: judge.toneMatch,
    judge_reasoning: judge.reasoning,
    judge_parse_error: judge.parseError,
    judge_cost_usd: judge.costUsd,
    judge_latency_ms: judge.latencyMs,
    hyde_mode_requested: hydeModeRequested,
    hyde_mode_actual: hydeModeActual,
    run_index: runIndex,
    retrieved_filenames: retrievedFilenames,
    retrieval_recall_at_k: recallAtK,
    retrieval_mrr: mrr,
    must_not_violation: mustNotViolation,
    stage_timings_ms: phaseTimings,
    hard_fact_supported: hardFact.hard_fact_supported,
    missing_hard_facts: hardFact.missing_hard_facts,
    hard_fact_status: hardFact.hard_fact_status,
  };
}

// ---------------------------------------------------------------------------
// Concurrency helper — simpele semaforie zonder externe dep.
// ---------------------------------------------------------------------------
export async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Bot-version helper — leest BOTS registry zonder side effects.
// ---------------------------------------------------------------------------
export function getBotsForEval(versions?: string[]): BotConfig[] {
  if (!versions || versions.length === 0) {
    // Geen filter → alle versies in registry.
    // Import dynamisch om circular-import te vermijden in CLI-context.
    // (BOTS is een gewoon object — direct import via bots.ts is ok.)
    // Hier voor symmetrie via resolveBot per versie als de caller een
    // expliciete lijst wil.
    return [];
  }
  return versions.map((v) => resolveBot(v));
}
