// Pure builder voor de "Kopieer voor Claude Code"-payload van een melding
// (admin_feedback). FeedbackItem (+ historie) → plak-klaar markdown-blok, bedoeld
// voor technische meldingen (type=bug). Vrije tekst (beschrijving/vraag/notities)
// wordt PII-geredigeerd zodat de Copy-knop nooit rauwe e-mail/telefoon/IBAN/BSN
// kan lekken. Geen DB/IO — los unit-testbaar (spiegelt lib/observability/claude-payload.ts).

import type { FeedbackEvent, FeedbackItem } from './types';
import {
  FEEDBACK_PRIORITY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  FEEDBACK_URGENCY_LABELS,
} from './types';
import { redactPii } from '@/lib/observability/redact';

function line(label: string, value: string | null | undefined): string | null {
  const v = (value ?? '').toString().trim();
  return v ? `- **${label}:** ${v}` : null;
}

const NOTE_LABEL: Record<'comment' | 'internal_note', string> = {
  comment: 'Reactie',
  internal_note: 'Interne notitie',
};

/** orgName wordt door de caller (detailpagina) uit KNOWN_ORGS geresolved zodat
 *  deze functie puur blijft. events is optioneel (alleen comments/notities tellen). */
export function buildFeedbackClaudePayload(
  item: FeedbackItem,
  events: FeedbackEvent[] = [],
  opts?: { orgName?: string },
): string {
  const c = item.context ?? {};
  const org = opts?.orgName ?? item.organizationId;
  const ctxVal = (k: string): string | undefined => {
    const v = c[k];
    return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
  };

  const meta = [
    line('Type', `${FEEDBACK_TYPE_LABELS[item.type]} (${item.type})`),
    line('Urgentie (klant)', FEEDBACK_URGENCY_LABELS[item.urgency]),
    line('Prioriteit (operator)', item.priority ? FEEDBACK_PRIORITY_LABELS[item.priority] : null),
    line('Status', FEEDBACK_STATUS_LABELS[item.status]),
    line('Org', org),
    line('Bron', item.source),
    line('Ingediend op', item.createdAt),
    line('Chat-ID', item.chatId),
  ].filter(Boolean);

  const ctx = [
    line('Request-ID', ctxVal('requestId')),
    line('Bot-versie', ctxVal('botVersion')),
    line('URL', ctxVal('url')),
    line('User-agent', ctxVal('userAgent')),
    line('Bijlage', item.attachmentName),
  ].filter(Boolean);

  const beschrijving = redactPii(item.description).trim() || '(geen beschrijving)';
  const vraag = item.question ? redactPii(item.question).trim() : '';

  // Operator-notities/reacties kunnen repro-stappen bevatten — meenemen, geredigeerd.
  const notes = events
    .filter((e): e is FeedbackEvent & { kind: 'comment' | 'internal_note' } =>
      (e.kind === 'comment' || e.kind === 'internal_note') && !!e.body,
    )
    .map((e) => `- **${NOTE_LABEL[e.kind]}:** ${redactPii(e.body)}`);

  const blocks = [
    `## ChatManta melding — ${FEEDBACK_TYPE_LABELS[item.type]}`,
    meta.join('\n'),
    `### Beschrijving\n${beschrijving}`,
    vraag ? `### Gestelde vraag aan de bot\n${vraag}` : null,
    ctx.length ? `### Context\n${ctx.join('\n')}` : null,
    notes.length ? `### Operator-notities\n${notes.join('\n')}` : null,
    `### Vraag aan Claude Code\nOnderzoek deze melding in de codebase, vind de oorzaak en stel een fix voor. Reproduceer indien mogelijk en leg uit waarom het misging.`,
  ].filter(Boolean);

  return `${blocks.join('\n\n')}\n`;
}
