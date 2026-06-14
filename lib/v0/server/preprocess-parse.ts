// Pure, side-effect-vrije helpers voor de pre-processor-output. Bewust LOSGEKOPPELD
// van rag.ts (die bij module-load een OpenAI-client instantieert) zodat deze parser
// zonder env/SDK te unit-testen is.

export function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length < 2) return t;
  const first = t[0];
  const last = t[t.length - 1];
  if ((first === '"' && last === '"') || (first === '„' && last === '"') || (first === "'" && last === "'")) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/**
 * Parse the model's two-line output. Returns null on malformed reply so the
 * caller can fall back to default search behavior.
 */
export function parsePreProcessOutput(
  raw: string,
): { kind: 'smalltalk'; reply: string } | { kind: 'search'; query: string } | { kind: 'off_topic' } | null {
  const text = raw.trim();
  const actionMatch = text.match(/^ACTION:\s*(smalltalk|search|off_topic)\b/im);
  if (!actionMatch) return null;
  const action = actionMatch[1].toLowerCase();

  // off_topic: geen REPLY/QUERY nodig — de orchestrator levert de vaste
  // off-topic-fallback. Vóór smalltalk/search zodat het een eigen ACTION is.
  if (action === 'off_topic') {
    return { kind: 'off_topic' };
  }

  if (action === 'smalltalk') {
    const replyMatch = text.match(/^REPLY:\s*([\s\S]+?)$/im);
    const reply = stripQuotes(replyMatch?.[1] ?? '').slice(0, 500);
    if (!reply) return null;
    return { kind: 'smalltalk', reply };
  }

  const queryMatch = text.match(/^QUERY:\s*([\s\S]+?)$/im);
  const query = stripQuotes(queryMatch?.[1] ?? '').slice(0, 1000);
  if (!query) return null;
  return { kind: 'search', query };
}
