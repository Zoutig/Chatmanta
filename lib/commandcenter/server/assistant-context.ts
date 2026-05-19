// Command Center Assistant — context-builder + system prompt.
//
// Per-turn context-injectie: huidige DB-snapshot in een compacte JSON die het
// model ziet als reference. Static system-prompt bevat rolverdeling, enums,
// en gedragsregels.

import 'server-only';

import {
  ASSISTANT_TOOLS,
  type AssistantTool,
} from './assistant-tools';
import { listTasks } from './storage';
import { listMilestones } from './milestones';
import { listCheckIns } from './checkins';
import { listDecisions } from './decisions';
import {
  compareTasks,
  OWNERS,
  PRIORITIES,
  PROJECT_AREAS,
  ROADMAP_PHASES,
  TASK_STATUSES,
} from '../types';

export type AssistantContext = {
  today: string;
  openTasks: Array<{
    id: string;
    title: string;
    owner: string;
    status: string;
    priority: string;
    deadline: string | null;
    projectArea: string;
  }>;
  upcomingMilestones: Array<{
    id: string;
    title: string;
    phase: string;
    owner: string;
    status: string;
    deadline: string | null;
  }>;
  recentCheckIns: Array<{
    id: string;
    week: string;
    date: string;
    sebastiaanNext: string[];
    nielsNext: string[];
    shared: string[];
  }>;
  openDecisions: Array<{
    id: string;
    title: string;
    date: string;
    status: string;
  }>;
};

export async function buildAssistantContext(): Promise<AssistantContext> {
  const today = new Date().toISOString().slice(0, 10);
  const fourWeeksFromNow = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 28);
    return d.toISOString().slice(0, 10);
  })();

  const [tasks, milestones, checkins, decisions] = await Promise.all([
    listTasks(),
    listMilestones(),
    listCheckIns(),
    listDecisions(),
  ]);

  const openTasks = tasks
    .filter((t) => t.status !== 'Klaar')
    .sort(compareTasks)
    .slice(0, 20)
    .map((t) => ({
      id: t.id,
      title: t.title,
      owner: t.owner,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      projectArea: t.projectArea,
    }));

  const upcomingMilestones = milestones
    .filter((m) => m.status !== 'Afgerond')
    .filter((m) => !m.deadline || m.deadline <= fourWeeksFromNow)
    .slice(0, 10)
    .map((m) => ({
      id: m.id,
      title: m.title,
      phase: m.roadmapPhase,
      owner: m.owner,
      status: m.status,
      deadline: m.deadline,
    }));

  const recentCheckIns = checkins.slice(0, 3).map((c) => ({
    id: c.id,
    week: c.weekLabel,
    date: c.date,
    sebastiaanNext: c.sebastiaanNextTasks,
    nielsNext: c.nielsNextTasks,
    shared: c.sharedNextTasks,
  }));

  const openDecisions = decisions
    .filter((d) => d.status === 'Actief' || d.status === 'Te herzien')
    .slice(0, 10)
    .map((d) => ({ id: d.id, title: d.title, date: d.date, status: d.status }));

  return {
    today,
    openTasks,
    upcomingMilestones,
    recentCheckIns,
    openDecisions,
  };
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ROLE_DESCRIPTION = `# Wie je bent
Je bent de "Command Center Assistent" — een interne tool voor de twee oprichters van ChatManta (Sebastiaan en Niels). Je hoeft niet beleefd-formeel te zijn, gewoon praktisch en kort. Antwoord altijd in het Nederlands.

# Wat ChatManta is
Een SaaS-chatbot voor MKB-websites: een knowledge-bot op basis van RAG over websitecontent + documenten. Producten leven onder de prefixes V0 (interne RAG-leerplatform), Widget (publieke chatbot), en Command Center (deze tool). Sebastiaan bouwt; Niels doet sales/testklanten en deelt deel-product-input.

# Rolverdeling (gebruik bij owner-toewijzing)
- **Sebastiaan**: techniek, code, RAG-pipeline, evals, infra, datamodel, security, deploy
- **Niels**: sales, testklanten benaderen, gesprekken voeren, productinput uit klantgesprek, content
- **Samen**: strategische beslissingen, prijsstelling, demo-voorbereiding, productdemo, sprint-reviews
- **Nog toe te wijzen**: gebruik als je twijfelt — vraag in een vervolg-turn welke owner

# Hoe je werkt
- Voor het antwoorden, ROEP TOOLS AAN. Praat niet over wat je gaat doen — doe het meteen.
- Vraag niet onnodig om bevestiging vóór mutaties. De gebruiker kan met de Ongedaan-knop terugdraaien.
- VOOR create_task: roep eerst list_tasks aan met \`contains\` om duplicaten te zien.
- Bij update_task: gebruik altijd een \`id\` uit de context-snapshot of een eerdere tool-result. Verzin nooit een uuid.
- Als de gebruiker meerdere taken in één bericht noemt, voer parallelle tool-calls uit (één per taak).
- Antwoordfinale tekst: max 2-3 zinnen, in spreektaal. Geen lijstjes tenzij ze om een lijstje vragen.`;

const ENUMS_SECTION = `# Toegestane waarden (gebruik EXACT deze spelling)
- owner: ${OWNERS.join(' | ')}
- priority: ${PRIORITIES.join(' | ')}
- status: ${TASK_STATUSES.join(' | ')}
- project_area: ${PROJECT_AREAS.join(' | ')}
- roadmap_phase: ${ROADMAP_PHASES.join(' | ')}

Defaults bij create_task als velden ontbreken:
- status = "Backlog"
- priority = "P2"
- owner = "Nog toe te wijzen"
- impact = "Middel"
- effort = "Middel"
- project_area = "Later / ideeën"
- roadmap_phase = "Backlog"`;

function formatContextBlock(ctx: AssistantContext): string {
  const lines: string[] = [];
  lines.push(`# Huidige stand (${ctx.today})`);

  if (ctx.openTasks.length > 0) {
    lines.push(`## Open taken (top 20, gesorteerd op urgentie)`);
    for (const t of ctx.openTasks) {
      const dl = t.deadline ? ` deadline=${t.deadline}` : '';
      lines.push(`- [${t.id}] (${t.priority}/${t.status}) ${t.owner}: ${t.title}${dl}`);
    }
  } else {
    lines.push(`## Open taken: geen`);
  }

  if (ctx.upcomingMilestones.length > 0) {
    lines.push(`## Milestones komende 4 weken`);
    for (const m of ctx.upcomingMilestones) {
      const dl = m.deadline ? ` deadline=${m.deadline}` : '';
      lines.push(`- [${m.id}] (${m.phase}/${m.status}) ${m.owner}: ${m.title}${dl}`);
    }
  }

  if (ctx.recentCheckIns.length > 0) {
    lines.push(`## Recente check-ins`);
    for (const c of ctx.recentCheckIns) {
      lines.push(`- ${c.week} (${c.date})`);
      if (c.sebastiaanNext.length) lines.push(`  Sebastiaan: ${c.sebastiaanNext.join('; ')}`);
      if (c.nielsNext.length) lines.push(`  Niels: ${c.nielsNext.join('; ')}`);
      if (c.shared.length) lines.push(`  Samen: ${c.shared.join('; ')}`);
    }
  }

  if (ctx.openDecisions.length > 0) {
    lines.push(`## Open beslissingen`);
    for (const d of ctx.openDecisions) {
      lines.push(`- [${d.id}] (${d.status}) ${d.date}: ${d.title}`);
    }
  }

  return lines.join('\n');
}

export function buildSystemPrompt(ctx: AssistantContext): string {
  return [ROLE_DESCRIPTION, ENUMS_SECTION, formatContextBlock(ctx)].join('\n\n');
}

/** Helper voor de turn-handler: pakt een tool uit de registry of throwt. */
export function getTool(name: string): AssistantTool | null {
  return ASSISTANT_TOOLS[name] ?? null;
}
