'use client';

// "Jouw activiteit in deze demo": wat de bezoeker zelf deed, uit zijn eigen
// browser (demo-store). Niemand anders ziet dit en wij slaan het nergens op.
// Verschijnt pas zodra er iets te tonen is.

import { StatStrip, type Stat } from '@/app/v1/_ui/stat-strip';
import { useDemoConversations, useDemoQA, useDemoSettings } from '@/lib/voorbeeld/demo-store';
import { DEMO_DEFAULT_SETTINGS } from '@/lib/voorbeeld/demo-defaults';
import { ownActivity } from '@/lib/voorbeeld/own-activity';

export function OwnActivityCard() {
  const conversations = useDemoConversations();
  const qa = useDemoQA();
  const settings = useDemoSettings();
  const a = ownActivity(conversations, qa);
  const changedSettings = (Object.keys(settings) as (keyof typeof settings)[]).filter(
    (k) => JSON.stringify(settings[k]) !== JSON.stringify(DEMO_DEFAULT_SETTINGS[k]),
  ).length;

  if (a.questions === 0 && a.ownQA === 0 && changedSettings === 0) return null;

  const items: Stat[] = [
    {
      label: 'Jouw vragen',
      value: String(a.questions),
      sub: `in ${a.conversations} ${a.conversations === 1 ? 'gesprek' : 'gesprekken'}`,
      href: '/voorbeeld/gesprekken',
    },
    {
      label: 'Beantwoord',
      value: String(a.answered),
      sub: a.unanswered > 0 ? `${a.unanswered} niet beantwoord` : 'Alles beantwoord',
    },
    {
      label: 'Jouw Q&A',
      value: String(a.ownQA),
      sub: a.ownQA === 1 ? 'antwoord toegevoegd' : 'antwoorden toegevoegd',
      href: '/voorbeeld/kennisbank?tab=qa',
    },
    {
      label: 'Instellingen',
      value: String(changedSettings),
      sub: 'aangepast',
      href: '/voorbeeld/instellingen',
    },
  ];

  return (
    <section className="vb-activity" aria-label="Jouw activiteit in deze demo">
      <div className="vb-activity-head">
        <h2>Jouw activiteit in deze demo</h2>
        <span>Alleen jij ziet dit: het staat in je eigen browser.</span>
      </div>
      <StatStrip label="Jouw activiteit" items={items} />
    </section>
  );
}
