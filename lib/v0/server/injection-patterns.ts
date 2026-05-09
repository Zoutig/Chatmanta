// V0.4 prompt-injection patterns — losse file zodat tunen niet door rag/api code raakt.
//
// Eerlijk over scope: regex is een brute-force defense-in-depth laag, NIET
// een onfeilbare filter. Leetspeak, unicode-tricks, encoding en creatieve
// herformuleringen kunnen elke regex omzeilen. Het doel is:
//   1) De evidente jailbreaks vangen ("ignore previous", "you are now", etc.)
//   2) Telemetrie verzamelen over hoe vaak ze geprobeerd worden
//   3) De aanvaller een drempel geven, niet een muur
//
// Pattern-keuze: case-insensitive, gericht op semantische injectie-frases
// (Engels + Nederlands). False-positives worden gemonitord via
// INJECTION_MODE='log-only' default — pas op 'block' zetten als de patterns
// gestabiliseerd zijn op echte data.

export type InjectionPattern = {
  /** Korte stabiele naam — wordt in query_log.injection_pattern gelogd. */
  name: string;
  /** Hoe ernstig is een match? Niet voor blocking-beslissing in V0 (binary), maar nuttig in V1 voor scoring. */
  severity: 'low' | 'medium' | 'high';
  /** Regex (case-insensitive bij default — gebruik /i flag in de literal). */
  regex: RegExp;
  /** Korte uitleg wat dit patroon vangt. */
  description: string;
};

export const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    name: 'ignore_previous',
    severity: 'high',
    regex: /\bignore\s+(?:the\s+)?(?:previous|above|prior|all)\s+(?:instructions?|prompts?|rules?|messages?)\b/i,
    description: '"ignore previous instructions" — klassieke prompt-override poging',
  },
  {
    name: 'ignore_previous_nl',
    severity: 'high',
    regex: /\bnegeer\s+(?:de\s+)?(?:vorige|bovenstaande|alle|eerdere)\s+(?:instructies|regels|berichten|prompts?)\b/i,
    description: 'Nederlandse variant van ignore_previous',
  },
  {
    name: 'forget_instructions',
    severity: 'high',
    regex: /\bforget\s+(?:your|the|all|any)\s+(?:instructions?|prompts?|rules?|previous)\b/i,
    description: '"forget your instructions" — geheugen-reset poging',
  },
  {
    name: 'forget_instructions_nl',
    severity: 'high',
    regex: /\bvergeet\s+(?:je|de|alle)\s+(?:instructies|regels)\b/i,
    description: 'Nederlandse variant van forget_instructions',
  },
  {
    name: 'system_prompt_leak',
    severity: 'medium',
    regex: /\b(?:system\s*[:>]\s*|<\s*system\s*>|\[system\])/i,
    description: 'Probeert system-prompt rol te imiteren ("system:", "<system>")',
  },
  {
    name: 'new_role',
    severity: 'high',
    regex: /\b(?:you\s+are\s+now|you\s+now\s+are|act\s+as|pretend\s+to\s+be|new\s+role\s*[:>])\s+(?!a\s+helpful)/i,
    description: '"you are now X" / "act as X" — rol-overschrijving',
  },
  {
    name: 'new_role_nl',
    severity: 'high',
    regex: /\b(?:je\s+bent\s+nu|gedraag\s+je\s+als|doe\s+alsof\s+je|nieuwe\s+rol\s*[:>])\s+/i,
    description: 'Nederlandse variant van new_role',
  },
  {
    name: 'override_instructions',
    severity: 'medium',
    regex: /\b(?:override|bypass|disable|jailbreak|circumvent)\s+(?:safety|guard\w*|filters?|instructions?|rules?|moderation)\b/i,
    description: '"override safety", "bypass guardrails" — security-bypass woordenschat',
  },
  {
    name: 'reveal_prompt',
    severity: 'medium',
    regex: /\b(?:reveal|show(?:\s+me)?|print|output|display|tell\s+me|give\s+me)\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?|rules?)\b/i,
    description: 'Vraagt om systeem-prompt te onthullen',
  },
  {
    name: 'reveal_prompt_nl',
    severity: 'medium',
    regex: /\b(?:laat\s+(?:zien|me\s+zien)|toon|print|geef\s+me)\s+(?:je|de)\s+(?:systeem\s+)?(?:prompt|instructies|regels)\b/i,
    description: 'Nederlandse variant van reveal_prompt',
  },
  {
    name: 'developer_mode',
    severity: 'medium',
    regex: /\b(?:developer\s+mode|admin\s+mode|root\s+mode|debug\s+mode|sudo\s+mode|god\s+mode|dev\s+mode)\b/i,
    description: 'Probeert "speciale modus" te activeren',
  },
  {
    name: 'dan_jailbreak',
    severity: 'high',
    regex: /\b(?:DAN|do\s+anything\s+now|STAN|DUDE|jailbreak)\b/i,
    description: 'Bekende jailbreak-aliassen (DAN, STAN, DUDE, etc.)',
  },
  {
    name: 'instruction_break',
    severity: 'low',
    regex: /\b(?:end\s+of\s+(?:instructions?|prompt)|---+\s*end|\[end\s+of\s+(?:system|instructions?)\])/i,
    description: 'Probeert instruction-block te "sluiten" om eigen instructies te starten',
  },
];

/**
 * Default for env-var INJECTION_MODE als die niet gezet is.
 * V0 default = 'log-only' zodat false-positives zichtbaar worden via
 * query_log.injection_detected vóór we daadwerkelijk gaan blokkeren.
 */
export type InjectionMode = 'log-only' | 'block';
export const DEFAULT_INJECTION_MODE: InjectionMode = 'log-only';

/** User-zichtbare boodschap bij block-mode rejection. */
export const INJECTION_BLOCKED_MESSAGE =
  'Je vraag bevat een patroon dat we niet kunnen verwerken. Herformuleer je vraag of neem contact op met ons team.';
