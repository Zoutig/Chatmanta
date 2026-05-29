// Pure builder voor de "Kopieer voor Claude Code"-payload: een ErrorGroup →
// plak-klaar markdown-blok. Bouwt UITSLUITEND uit reeds-geredigeerde velden
// (last_context.inputRedacted) zodat de Copy-knop nooit rauwe PII kan lekken.
// Geen DB/IO — los unit-testbaar.

import type { ErrorGroup } from './sink';

function line(label: string, value: string | null | undefined): string | null {
  const v = (value ?? '').toString().trim();
  return v ? `- **${label}:** ${v}` : null;
}

/** orgName wordt door de caller (detailpagina) uit KNOWN_ORGS geresolved zodat
 *  deze functie puur blijft. */
export function buildClaudePayload(group: ErrorGroup, opts?: { orgName?: string }): string {
  const c = group.context ?? {};
  const org = opts?.orgName ?? group.organizationId ?? '—';
  const route = [c.method, c.route].filter(Boolean).join(' ');
  const meta = [
    line('Severity', group.severity),
    line('Status', group.status),
    line('Org', org),
    line('Voorgekomen', `${group.count}× · eerst ${group.firstSeenAt} · laatst ${group.lastSeenAt}`),
    line('Request-ID', c.requestId),
    line('Route', route),
    line('Bot-versie', c.botVersion),
    line('Thread', c.threadId),
    line('Commit', c.commit),
    line('Env', c.env),
    c.originSuspect ? '- **⚠ Origin verdacht:** ja (mogelijk gespoofed)' : null,
  ].filter(Boolean);

  const stack = (c.stack || c.topFrame || '(geen stacktrace beschikbaar)').toString().trim();
  const startAt = c.topFrame || c.route || '(onbekend)';
  const ctx = [
    line('URL', c.url),
    line('Gebruikersinvoer (PII-geredigeerd)', c.inputRedacted),
    c.breadcrumbs && c.breadcrumbs.length ? `- **Breadcrumbs:** ${c.breadcrumbs.join(' → ')}` : null,
  ].filter(Boolean);

  const melding = [group.title, group.message && group.message !== group.title ? group.message : null]
    .filter(Boolean)
    .join('\n');

  // Losse blokken, met een lege regel ertussen. Bewust GEEN globale leeg-filter
  // (die zou ook de bedoelde blanco regels tussen secties wegslopen).
  const blocks = [
    `## ChatManta foutrapport — ${group.code} op ${group.surface}`,
    meta.join('\n'),
    `### Foutmelding\n${melding}`,
    `### Stacktrace\n\`\`\`text\n${stack}\n\`\`\``,
    `### Context\n${(ctx.length ? ctx : ['- (geen extra context)']).join('\n')}`,
    `### Vraag aan Claude Code\nVind de oorzaak van deze fout in de codebase en stel een fix voor. Begin bij \`${startAt}\`. Reproduceer indien mogelijk en leg uit waarom het misging.`,
  ];
  return `${blocks.join('\n\n')}\n`;
}
