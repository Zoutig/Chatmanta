// V0 multi-org isolation test — bewijst dat retrieval scoped is op
// organization_id. Drie scenarios:
//
//   1. Dakwerken-vraag aan acme-corp (Dakwerken De Boer) → moet hit zijn
//   2. Dakwerken-vraag aan globex-inc (FysioPlus Utrecht) → moet fallback geven
//      (geen dakwerken-data in fysio-org)
//   3. Fysio-vraag aan globex-inc → moet hit zijn (positive)
//
// Pass-criterium: scenario 2 retourneert kind='fallback' OF een answer die
// dakwerken-termen niet noemt (anti-hallucinatie deed zijn werk). Scenarios 1
// en 3 moeten kind='answer' zijn met de juiste termen in de tekst.
//
// Usage:
//   npm run v0:test-org-isolation

import { runRagQueryStreaming, type ChatResponse } from '../lib/v0/server/rag';
import { resolveBot } from '../lib/v0/server/bots';
import { KNOWN_ORGS } from '../lib/v0/server/active-org';

type Scenario = {
  label: string;
  question: string;
  orgSlug: 'acme-corp' | 'globex-inc';
  /** Strings die WEL in het antwoord moeten zitten (case-insensitive). */
  expectContains?: string[];
  /** Strings die NIET in het antwoord mogen zitten (anders = data lek). */
  forbidContains?: string[];
  /** Acceptabel dat fallback triggert? */
  allowFallback?: boolean;
  /** Vereist dat fallback triggert (anders fail)? */
  requireFallback?: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    label: 'Dakwerken-vraag aan Dakwerken (positive)',
    question: 'Leggen jullie ook platte daken aan met EPDM of bitumen?',
    orgSlug: 'acme-corp',
    expectContains: ['dak'],
    forbidContains: ['manuele therapie', 'fysio', 'jaarrekening'],
  },
  {
    label: 'Dakwerken-vraag aan FysioPlus (isolation)',
    question: 'Leggen jullie ook platte daken aan met EPDM of bitumen?',
    orgSlug: 'globex-inc',
    forbidContains: ['Dakwerken De Boer', 'EPDM', 'bitumen', 'dakgoot'],
    allowFallback: true,
    // Niet requireFallback: bot mag ook een vriendelijke 'dat doen wij niet'
    // teruggeven zonder formele fallback-status — beide zijn OK zolang er
    // geen dakwerken-data lekt.
  },
  {
    label: 'Fysio-vraag aan FysioPlus (positive)',
    question: 'Behandelen jullie ook manuele therapie?',
    orgSlug: 'globex-inc',
    expectContains: ['manuele'],
    forbidContains: ['Dakwerken De Boer', 'EPDM', 'jaarrekening'],
  },
];

async function runOnce(question: string, orgId: string): Promise<ChatResponse | null> {
  const bot = resolveBot('v0.4');
  for await (const ev of runRagQueryStreaming({
    question,
    threshold: bot.similarityThreshold,
    enableRewrite: true,
    bot: { ...bot, cacheEnabled: false }, // cache uit zodat resultaten echt uit retrieval komen
    organizationId: orgId,
  })) {
    if (ev.kind === 'smalltalk' || ev.kind === 'fallback' || ev.kind === 'answer-done') {
      return ev.response;
    }
    if (ev.kind === 'error') {
      console.error('  ✗ stream error:', ev.code);
      return null;
    }
  }
  return null;
}

function checkScenario(s: Scenario, response: ChatResponse | null): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!response) {
    reasons.push('geen response');
    return { pass: false, reasons };
  }

  const isFallback = response.kind === 'fallback';
  const text = response.kind === 'answer' || response.kind === 'fallback' ? response.answer : response.answer;
  const lower = text.toLowerCase();

  if (s.requireFallback && !isFallback) {
    reasons.push(`expected fallback maar kreeg kind=${response.kind}`);
  }

  for (const must of s.expectContains ?? []) {
    if (!lower.includes(must.toLowerCase())) {
      reasons.push(`mist verwachte string "${must}"`);
    }
  }

  for (const forbid of s.forbidContains ?? []) {
    if (lower.includes(forbid.toLowerCase())) {
      // Als fallback en allowFallback, maar de fallback bevat verboden string,
      // dan is dat lekkage van leftover state. Strict.
      reasons.push(`bevat verboden string "${forbid}" (DATA LEAK)`);
    }
  }

  // Als fallback toegestaan en triggerde: geen extra eisen meer.
  if (isFallback && s.allowFallback) {
    return { pass: reasons.filter((r) => r.includes('DATA LEAK')).length === 0, reasons };
  }

  return { pass: reasons.length === 0, reasons };
}

async function main(): Promise<void> {
  console.log('--- V0 multi-org isolation test ---\n');

  let pass = 0;
  let fail = 0;
  for (const s of SCENARIOS) {
    const orgId = KNOWN_ORGS[s.orgSlug].id;
    const response = await runOnce(s.question, orgId);
    const result = checkScenario(s, response);
    const tag = result.pass ? '✓' : '✗';
    console.log(`${tag} [${s.orgSlug}] ${s.label}`);
    console.log(`   Q: ${s.question}`);
    if (response) {
      const ans = (response.kind === 'answer' || response.kind === 'fallback' || response.kind === 'smalltalk')
        ? response.answer.replace(/\s+/g, ' ').slice(0, 180)
        : '';
      console.log(`   A: [${response.kind}] ${ans}${ans.length >= 180 ? '…' : ''}`);
    }
    if (!result.pass) {
      for (const r of result.reasons) console.log(`     ⚠ ${r}`);
      fail++;
    } else {
      pass++;
    }
    console.log('');
  }

  console.log(`---`);
  console.log(`${pass} pass / ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error('✗ fout:', err);
  process.exit(1);
});
