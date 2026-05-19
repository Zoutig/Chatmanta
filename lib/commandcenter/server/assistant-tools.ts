// Command Center Assistant — tool-schemas + server-side executors.
//
// Elke tool heeft:
//   - schema: OpenAI tool-format (function-calling), wordt naar GPT-4o gestuurd
//   - execute(args): server-side uitvoering; bij write-tools retourneert het
//     `beforeState` zodat de undo-route de wijziging kan terugdraaien.
//
// Read-tools retourneren { ok, item }; write-tools { ok, item, beforeState }.
// Bij fouten: { ok: false, error } i.p.v. throwen — dan kan het model
// herstellen door iets anders te proberen.

import 'server-only';

import {
  type AssistantToolResult,
  OWNERS,
  type Owner,
  PRIORITIES,
  PROJECT_AREAS,
  ROADMAP_PHASES,
  TASK_STATUSES,
  IMPACTS,
  EFFORTS,
  type Task,
  type TaskInput,
  type TaskPatch,
  type CheckInInput,
  type DecisionInput,
  DECISION_STATUSES,
  MILESTONE_STATUSES,
  compareTasks,
  CUSTOMER_STATUSES,
} from '../types';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from './storage';
import { createCheckIn, listCheckIns } from './checkins';
import { createDecision, listDecisions } from './decisions';
import { listCustomers } from './customers';
import { listMilestones } from './milestones';

// ---------------------------------------------------------------------------
// OpenAI tool-schema type (komt overeen met openai.chat.completions tools-param)
// ---------------------------------------------------------------------------

export type ToolSchema = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

type Executor = (args: Record<string, unknown>) => Promise<AssistantToolResult>;

export type AssistantTool = {
  schema: ToolSchema;
  execute: Executor;
  /** True voor tools die DB muteren → resultaat bevat `beforeState` voor undo. */
  isWrite: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ok(item: unknown, beforeState?: unknown): AssistantToolResult {
  return beforeState !== undefined ? { ok: true, item, beforeState } : { ok: true, item };
}

function fail(error: string): AssistantToolResult {
  return { ok: false, error };
}

function asString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return v.trim();
}

function asOptString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

function asEnum<T extends readonly string[]>(v: unknown, allowed: T, field: string): T[number] {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return v as T[number];
}

function asOptEnum<T extends readonly string[]>(
  v: unknown,
  allowed: T,
): T[number] | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  return asEnum(v, allowed, 'value');
}

function safeRun(fn: () => Promise<AssistantToolResult>): Promise<AssistantToolResult> {
  return fn().catch((e) => fail(e instanceof Error ? e.message : String(e)));
}

// ---------------------------------------------------------------------------
// READ tools
// ---------------------------------------------------------------------------

const list_tasks: AssistantTool = {
  isWrite: false,
  schema: {
    type: 'function',
    function: {
      name: 'list_tasks',
      description:
        'Lijst taken op. Filter op owner, status, priority, of zoek op title-substring. ' +
        'Default sortering: overdue eerst, dan priority (P1>P2>P3), dan deadline. ' +
        'Roep deze tool aan vóór create_task om duplicaten te voorkomen.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', enum: [...OWNERS] },
          status: { type: 'string', enum: [...TASK_STATUSES] },
          priority: { type: 'string', enum: [...PRIORITIES] },
          contains: {
            type: 'string',
            description: 'Substring (case-insensitive) in title of description',
          },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const all = await listTasks();
      const ownerF = asOptEnum(args.owner, OWNERS);
      const statusF = asOptEnum(args.status, TASK_STATUSES);
      const prioF = asOptEnum(args.priority, PRIORITIES);
      const containsF =
        typeof args.contains === 'string' && args.contains.trim()
          ? args.contains.trim().toLowerCase()
          : null;
      const limit = typeof args.limit === 'number' ? Math.min(50, Math.max(1, args.limit)) : 20;

      const filtered = all
        .filter((t) => !ownerF || t.owner === ownerF)
        .filter((t) => !statusF || t.status === statusF)
        .filter((t) => !prioF || t.priority === prioF)
        .filter((t) => {
          if (!containsF) return true;
          const hay = (t.title + ' ' + (t.description ?? '')).toLowerCase();
          return hay.includes(containsF);
        })
        .sort(compareTasks)
        .slice(0, limit);

      return ok({
        count: filtered.length,
        total: all.length,
        tasks: filtered.map(taskBrief),
      });
    }),
};

const list_milestones: AssistantTool = {
  isWrite: false,
  schema: {
    type: 'function',
    function: {
      name: 'list_milestones',
      description:
        'Lijst milestones op. Filter op roadmap_phase, owner, status. Toont deadline + acceptance criteria.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', enum: [...OWNERS] },
          status: { type: 'string', enum: [...MILESTONE_STATUSES] },
          roadmap_phase: { type: 'string', enum: [...ROADMAP_PHASES] },
        },
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const all = await listMilestones();
      const ownerF = asOptEnum(args.owner, OWNERS);
      const statusF = asOptEnum(args.status, MILESTONE_STATUSES);
      const phaseF = asOptEnum(args.roadmap_phase, ROADMAP_PHASES);
      const filtered = all
        .filter((m) => !ownerF || m.owner === ownerF)
        .filter((m) => !statusF || m.status === statusF)
        .filter((m) => !phaseF || m.roadmapPhase === phaseF);
      return ok({
        count: filtered.length,
        milestones: filtered.map((m) => ({
          id: m.id,
          title: m.title,
          phase: m.roadmapPhase,
          owner: m.owner,
          status: m.status,
          deadline: m.deadline,
          acceptance: m.acceptanceCriteria,
        })),
      });
    }),
};

const list_recent_checkins: AssistantTool = {
  isWrite: false,
  schema: {
    type: 'function',
    function: {
      name: 'list_recent_checkins',
      description:
        'Toont de laatste check-ins (week-reviews) met wie wat heeft gedaan en wat voor de komende week gepland is.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 10, default: 3 },
        },
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const all = await listCheckIns();
      const limit = typeof args.limit === 'number' ? Math.min(10, Math.max(1, args.limit)) : 3;
      const recent = all.slice(0, limit); // listCheckIns retourneert nieuw-eerst (createdAt desc)
      return ok({
        count: recent.length,
        checkins: recent.map((c) => ({
          id: c.id,
          week: c.weekLabel,
          date: c.date,
          completed: c.completed,
          notCompleted: c.notCompleted,
          sebastiaanNext: c.sebastiaanNextTasks,
          nielsNext: c.nielsNextTasks,
          shared: c.sharedNextTasks,
          blockers: c.blockers,
        })),
      });
    }),
};

const list_open_decisions: AssistantTool = {
  isWrite: false,
  schema: {
    type: 'function',
    function: {
      name: 'list_open_decisions',
      description: 'Lijst beslissingen op die nog actief of te herzien zijn.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  execute: () =>
    safeRun(async () => {
      const all = await listDecisions();
      const open = all.filter((d) => d.status === 'Actief' || d.status === 'Te herzien');
      return ok({
        count: open.length,
        decisions: open.map((d) => ({
          id: d.id,
          date: d.date,
          title: d.title,
          decision: d.decision,
          status: d.status,
          impact: d.impact,
          decidedBy: d.decidedBy,
          reviewDate: d.reviewDate,
        })),
      });
    }),
};

const list_test_customers: AssistantTool = {
  isWrite: false,
  schema: {
    type: 'function',
    function: {
      name: 'list_test_customers',
      description: 'Lijst (potentiele) testklanten op. Optionele filter op status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: [...CUSTOMER_STATUSES] },
        },
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const all = await listCustomers();
      const statusF = asOptEnum(args.status, CUSTOMER_STATUSES);
      const filtered = statusF ? all.filter((c) => c.status === statusF) : all;
      return ok({
        count: filtered.length,
        customers: filtered.map((c) => ({
          id: c.id,
          name: c.companyName,
          contact: c.contactPerson,
          status: c.status,
          owner: c.owner,
          lastContact: c.lastContactDate,
          nextAction: c.nextAction,
        })),
      });
    }),
};

const get_owner_workload: AssistantTool = {
  isWrite: false,
  schema: {
    type: 'function',
    function: {
      name: 'get_owner_workload',
      description:
        'Geef een overzicht van hoeveel taken een persoon open heeft, per status en priority. Bruikbaar om verdeling tussen Sebastiaan en Niels te peilen.',
      parameters: {
        type: 'object',
        properties: {
          owner: { type: 'string', enum: [...OWNERS] },
        },
        required: ['owner'],
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const owner = asEnum(args.owner, OWNERS, 'owner');
      const all = await listTasks();
      const mine = all.filter((t) => t.owner === owner && t.status !== 'Klaar');
      const byStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      for (const t of mine) {
        byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
        byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
      }
      const overdue = mine.filter(
        (t) => t.deadline && t.deadline < new Date().toISOString().slice(0, 10),
      );
      return ok({
        owner,
        openTotal: mine.length,
        byStatus,
        byPriority,
        overdue: overdue.length,
        overdueTasks: overdue.slice(0, 5).map(taskBrief),
      });
    }),
};

// ---------------------------------------------------------------------------
// WRITE tools — retourneren beforeState voor undo
// ---------------------------------------------------------------------------

const create_task: AssistantTool = {
  isWrite: true,
  schema: {
    type: 'function',
    function: {
      name: 'create_task',
      description:
        'Maak een nieuwe taak aan. Roep eerst list_tasks aan met contains om duplicaten te voorkomen. ' +
        'Vraag NIET om bevestiging — als de intentie helder is, maak hem direct aan. ' +
        'De gebruiker kan met de Ongedaan-knop terugdraaien.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string' },
          owner: { type: 'string', enum: [...OWNERS] },
          priority: { type: 'string', enum: [...PRIORITIES] },
          status: { type: 'string', enum: [...TASK_STATUSES] },
          deadline: {
            type: 'string',
            description: 'ISO datum YYYY-MM-DD',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          },
          project_area: { type: 'string', enum: [...PROJECT_AREAS] },
          roadmap_phase: { type: 'string', enum: [...ROADMAP_PHASES] },
          impact: { type: 'string', enum: [...IMPACTS] },
          effort: { type: 'string', enum: [...EFFORTS] },
          next_action: { type: 'string' },
          labels: { type: 'array', items: { type: 'string' } },
        },
        required: ['title'],
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const input: TaskInput = {
        title: asString(args.title, 'title'),
        description: asOptString(args.description) ?? null,
        owner: asOptEnum(args.owner, OWNERS),
        priority: asOptEnum(args.priority, PRIORITIES),
        status: asOptEnum(args.status, TASK_STATUSES),
        deadline: asOptString(args.deadline) ?? null,
        projectArea: asOptEnum(args.project_area, PROJECT_AREAS),
        roadmapPhase: asOptEnum(args.roadmap_phase, ROADMAP_PHASES),
        impact: asOptEnum(args.impact, IMPACTS),
        effort: asOptEnum(args.effort, EFFORTS),
        nextAction: asOptString(args.next_action) ?? null,
        labels: Array.isArray(args.labels) ? (args.labels as string[]).filter((s) => typeof s === 'string') : undefined,
      };
      const created = await createTask(input);
      // beforeState voor create = { id } zodat undo de juiste taak kan deleten
      return ok(taskBrief(created), { id: created.id });
    }),
};

const update_task: AssistantTool = {
  isWrite: true,
  schema: {
    type: 'function',
    function: {
      name: 'update_task',
      description:
        'Werk een bestaande taak bij. Alleen meegegeven velden worden aangepast. Gebruik dit voor hernoemen, owner-wijzigingen, priority-veranderingen, deadline-verschuiven, etc.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task id (uuid)' },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: 'string' },
          owner: { type: 'string', enum: [...OWNERS] },
          priority: { type: 'string', enum: [...PRIORITIES] },
          status: { type: 'string', enum: [...TASK_STATUSES] },
          deadline: {
            type: 'string',
            pattern: '^\\d{4}-\\d{2}-\\d{2}$',
            description: 'ISO datum YYYY-MM-DD, of "" om de deadline te verwijderen',
          },
          project_area: { type: 'string', enum: [...PROJECT_AREAS] },
          roadmap_phase: { type: 'string', enum: [...ROADMAP_PHASES] },
          impact: { type: 'string', enum: [...IMPACTS] },
          effort: { type: 'string', enum: [...EFFORTS] },
          next_action: { type: 'string' },
        },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const id = asString(args.id, 'id');
      const before = await getTask(id);
      if (!before) return fail(`Taak met id ${id} bestaat niet.`);
      const patch: TaskPatch = {};
      if (typeof args.title === 'string') patch.title = args.title.trim();
      if (typeof args.description === 'string') patch.description = args.description;
      if (args.owner !== undefined) patch.owner = asEnum(args.owner, OWNERS, 'owner');
      if (args.priority !== undefined) patch.priority = asEnum(args.priority, PRIORITIES, 'priority');
      if (args.status !== undefined) patch.status = asEnum(args.status, TASK_STATUSES, 'status');
      if (args.deadline !== undefined)
        patch.deadline = typeof args.deadline === 'string' && args.deadline ? args.deadline : null;
      if (args.project_area !== undefined)
        patch.projectArea = asEnum(args.project_area, PROJECT_AREAS, 'project_area');
      if (args.roadmap_phase !== undefined)
        patch.roadmapPhase = asEnum(args.roadmap_phase, ROADMAP_PHASES, 'roadmap_phase');
      if (args.impact !== undefined) patch.impact = asEnum(args.impact, IMPACTS, 'impact');
      if (args.effort !== undefined) patch.effort = asEnum(args.effort, EFFORTS, 'effort');
      if (typeof args.next_action === 'string') patch.nextAction = args.next_action;
      const updated = await updateTask(id, patch);
      return ok(taskBrief(updated), taskSnapshot(before));
    }),
};

const complete_task: AssistantTool = {
  isWrite: true,
  schema: {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Markeer een taak als Klaar (status="Klaar"). Trigger vult completed_at automatisch.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const id = asString(args.id, 'id');
      const before = await getTask(id);
      if (!before) return fail(`Taak met id ${id} bestaat niet.`);
      if (before.status === 'Klaar') return fail('Taak is al klaar.');
      const updated = await updateTask(id, { status: 'Klaar' });
      return ok(taskBrief(updated), taskSnapshot(before));
    }),
};

const delete_task: AssistantTool = {
  isWrite: true,
  schema: {
    type: 'function',
    function: {
      name: 'delete_task',
      description:
        'Verwijder een taak. Onomkeerbaar in de UI alleen via de Ongedaan-knop binnen 10s; daarna definitief.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const id = asString(args.id, 'id');
      const before = await getTask(id);
      if (!before) return fail(`Taak met id ${id} bestaat niet.`);
      await deleteTask(id);
      return ok({ id, title: before.title, deleted: true }, taskSnapshot(before));
    }),
};

const create_checkin: AssistantTool = {
  isWrite: true,
  schema: {
    type: 'function',
    function: {
      name: 'create_checkin',
      description:
        'Maak een wekelijkse check-in aan (review meeting). Gebruik dit als de gebruiker zegt "we hadden een check-in" of dicteert wat er besproken is.',
      parameters: {
        type: 'object',
        properties: {
          week_label: { type: 'string', description: 'Bijv. "Week 21 — 19 mei 2026"' },
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          completed: { type: 'string' },
          not_completed: { type: 'string' },
          reasons: { type: 'string' },
          sebastiaan_next: { type: 'array', items: { type: 'string' } },
          niels_next: { type: 'array', items: { type: 'string' } },
          shared_next: { type: 'array', items: { type: 'string' } },
          blockers: { type: 'string' },
          decisions: { type: 'string' },
        },
        required: ['week_label', 'date'],
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const input: CheckInInput = {
        weekLabel: asString(args.week_label, 'week_label'),
        date: asString(args.date, 'date'),
        completed: typeof args.completed === 'string' ? args.completed : '',
        notCompleted: typeof args.not_completed === 'string' ? args.not_completed : '',
        reasons: typeof args.reasons === 'string' ? args.reasons : '',
        sebastiaanNextTasks: arrStrings(args.sebastiaan_next),
        nielsNextTasks: arrStrings(args.niels_next),
        sharedNextTasks: arrStrings(args.shared_next),
        blockers: typeof args.blockers === 'string' ? args.blockers : '',
        decisions: typeof args.decisions === 'string' ? args.decisions : '',
      };
      const created = await createCheckIn(input);
      return ok(
        {
          id: created.id,
          week: created.weekLabel,
          date: created.date,
        },
        { id: created.id },
      );
    }),
};

const create_decision: AssistantTool = {
  isWrite: true,
  schema: {
    type: 'function',
    function: {
      name: 'create_decision',
      description:
        'Leg een beslissing vast (bv. "we kiezen voor X i.p.v. Y omdat..."). Status default Actief.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          decision: { type: 'string' },
          context: { type: 'string' },
          impact: { type: 'string', enum: [...IMPACTS] },
          decided_by: { type: 'array', items: { type: 'string', enum: [...OWNERS] } },
          review_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          status: { type: 'string', enum: [...DECISION_STATUSES] },
        },
        required: ['date', 'title'],
        additionalProperties: false,
      },
    },
  },
  execute: (args) =>
    safeRun(async () => {
      const input: DecisionInput = {
        date: asString(args.date, 'date'),
        title: asString(args.title, 'title'),
        decision: typeof args.decision === 'string' ? args.decision : '',
        context: typeof args.context === 'string' ? args.context : null,
        impact: asOptEnum(args.impact, IMPACTS) ?? null,
        decidedBy: Array.isArray(args.decided_by)
          ? (args.decided_by as string[]).filter((x) => (OWNERS as readonly string[]).includes(x)) as Owner[]
          : undefined,
        reviewDate: typeof args.review_date === 'string' ? args.review_date : null,
        status: asOptEnum(args.status, DECISION_STATUSES),
      };
      const created = await createDecision(input);
      return ok({ id: created.id, title: created.title, date: created.date }, { id: created.id });
    }),
};

// ---------------------------------------------------------------------------
// Mini-helpers voor brief/snapshot van Task
// ---------------------------------------------------------------------------

function taskBrief(t: Task) {
  return {
    id: t.id,
    title: t.title,
    owner: t.owner,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    projectArea: t.projectArea,
  };
}

function taskSnapshot(t: Task): TaskInput {
  return {
    title: t.title,
    description: t.description,
    projectArea: t.projectArea,
    roadmapPhase: t.roadmapPhase,
    owner: t.owner,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    impact: t.impact,
    effort: t.effort,
    blockerReason: t.blockerReason,
    nextAction: t.nextAction,
    labels: t.labels,
  };
}

function arrStrings(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x) => typeof x === 'string') as string[] : [];
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ASSISTANT_TOOLS: Record<string, AssistantTool> = {
  list_tasks,
  list_milestones,
  list_recent_checkins,
  list_open_decisions,
  list_test_customers,
  get_owner_workload,
  create_task,
  update_task,
  complete_task,
  delete_task,
  create_checkin,
  create_decision,
};

export const ASSISTANT_TOOL_SCHEMAS: ToolSchema[] = Object.values(ASSISTANT_TOOLS).map(
  (t) => t.schema,
);
