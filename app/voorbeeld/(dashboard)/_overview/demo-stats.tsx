'use client';

// Cijferstrook van Overzicht in het voorbeeld. Zelfde opbouw als de V1-versie
// (buildStats in page.tsx van app/v1/app), maar client-side zodat hij de
// demo-instellingen van de bezoeker volgt: staat "Contactverzoeken" uit in
// Instellingen, dan verdwijnt het cijfer. Eigen gesprekken en contactverzoeken
// uit de voorbeeldwidget tellen mee.

import type { V1OverviewMetrics } from '@/lib/v1/dashboard/metrics';
import { StatStrip, type Stat } from '@/app/v1/_ui/stat-strip';
import { useDemoContactRequests, useDemoConversations, useDemoSettings } from '@/lib/voorbeeld/demo-store';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function buildStats(
  m: V1OverviewMetrics,
  ownConversations: number,
  contacts: { enabled: boolean; newCount: number },
): Stat[] {
  const { deltaPct } = m.conversationsWeekDelta;
  const conversations: Stat = {
    label: 'Gesprekken',
    value: String(m.conversationsThisMonth.threads + ownConversations),
    sub: 'Deze maand',
    spark: m.conversationsTrend,
    href: '/voorbeeld/gesprekken',
  };
  if (deltaPct !== null) {
    conversations.delta = `${deltaPct > 0 ? '+' : ''}${deltaPct}% deze week`;
    conversations.deltaTone = deltaPct > 0 ? 'ok' : deltaPct < 0 ? 'warn' : 'neutral';
  }

  const h = m.helpfulness;
  const helped: Stat = {
    label: 'Zelf beantwoord',
    value: h.rate === null ? 'Nog geen' : `${h.rate}%`,
    sub: h.rate === null ? 'Nog geen gesprekken deze maand' : `${h.successful} van ${h.total} gesprekken`,
    info: 'Gesprekken waarin je chatbot een antwoord gaf zonder door te verwijzen. Over deze maand.',
  };

  const stats: Stat[] = [conversations, helped];

  if (contacts.enabled) {
    stats.push({
      label: 'Contactverzoeken',
      value: String(contacts.newCount),
      sub: contacts.newCount === 1 ? 'Nieuw verzoek' : 'Nieuwe verzoeken',
      href: '/voorbeeld/contactverzoeken',
    });
  }

  const s = m.sources;
  stats.push({
    label: 'Kennisbronnen',
    value: String(s.websitePages + s.documents + s.qaItems),
    sub: `${plural(s.websitePages, 'pagina', "pagina's")} · ${plural(s.documents, 'document', 'documenten')} · ${s.qaItems} Q&A`,
    href: '/voorbeeld/kennisbank',
  });
  return stats;
}

export function DemoStats({ metrics, contactRequestsNewCount }: { metrics: V1OverviewMetrics; contactRequestsNewCount: number }) {
  const settings = useDemoSettings();
  const ownContacts = useDemoContactRequests();
  const ownConversations = useDemoConversations();
  const ownNew = ownContacts.filter((r) => r.status === 'new').length;

  const stats = buildStats(metrics, ownConversations.length, {
    enabled: settings.contactRequestsEnabled,
    newCount: contactRequestsNewCount + ownNew,
  });
  return <StatStrip label="Cijfers deze maand" items={stats} />;
}
