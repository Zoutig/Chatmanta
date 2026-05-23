// ChatManta Command Center — shared types.
//
// Single source of truth voor de domain-types. SQL-CHECK-constraints in
// migration 0025 spiegelen exact deze unions; bij wijziging beide updaten.

export const OWNERS = ['Sebastiaan', 'Niels', 'Samen', 'Nog toe te wijzen'] as const;
export type Owner = (typeof OWNERS)[number];

export const PROJECT_AREAS = [
  'Product / UX',
  'RAG & AI kwaliteit',
  'Widget',
  'Dashboard',
  'Kennisbank',
  'Backend / database',
  'Auth / accounts',
  'Performance',
  'Evaluaties / testdata',
  'Bugs',
  'Sales / testklanten',
  'Pricing / positionering',
  'Documentatie',
  'Deployment / hosting',
  'Later / ideeën',
] as const;
export type ProjectArea = (typeof PROJECT_AREAS)[number];

export const ROADMAP_PHASES = [
  'Backlog',
  'v0',
  'v1',
  'v2',
  'v3',
  'Later',
] as const;
export type RoadmapPhase = (typeof ROADMAP_PHASES)[number];

export const TASK_STATUSES = [
  'Backlog',
  'Deze week',
  'Bezig',
  'Review',
  'Geblokkeerd',
  'Klaar',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['P1', 'P2', 'P3'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<Priority, string> = {
  P1: 'P1 — bedrijfskritisch',
  P2: 'P2 — belangrijk',
  P3: 'P3 — later / nice-to-have',
};

export const IMPACTS = ['Hoog', 'Middel', 'Laag'] as const;
export type Impact = (typeof IMPACTS)[number];

export const EFFORTS = ['Klein', 'Middel', 'Groot'] as const;
export type Effort = (typeof EFFORTS)[number];

export type Task = {
  id: string;
  title: string;
  description: string | null;
  projectArea: ProjectArea;
  roadmapPhase: RoadmapPhase;
  owner: Owner;
  status: TaskStatus;
  priority: Priority;
  deadline: string | null; // ISO date (YYYY-MM-DD)
  impact: Impact;
  effort: Effort;
  blockerReason: string | null;
  nextAction: string | null;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type TaskInput = {
  title: string;
  description?: string | null;
  projectArea?: ProjectArea;
  roadmapPhase?: RoadmapPhase;
  owner?: Owner;
  status?: TaskStatus;
  priority?: Priority;
  deadline?: string | null;
  impact?: Impact;
  effort?: Effort;
  blockerReason?: string | null;
  nextAction?: string | null;
  labels?: string[];
};

export type TaskPatch = Partial<Omit<TaskInput, 'title'>> & { title?: string };

/** Defaults uit goal-prompt §9.2. */
export const TASK_DEFAULTS = {
  status: 'Backlog' as TaskStatus,
  priority: 'P2' as Priority,
  owner: 'Nog toe te wijzen' as Owner,
  impact: 'Middel' as Impact,
  effort: 'Middel' as Effort,
  roadmapPhase: 'Backlog' as RoadmapPhase,
  projectArea: 'Later / ideeën' as ProjectArea,
};

/** Bron-spec §24: overdue = deadline vóór vandaag én status !== Klaar. */
export function isOverdue(task: Pick<Task, 'deadline' | 'status'>): boolean {
  if (!task.deadline || task.status === 'Klaar') return false;
  const today = new Date().toISOString().slice(0, 10);
  return task.deadline < today;
}

/** Sortering uit bron-spec §21. */
const PRIORITY_RANK: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 };
const STATUS_RANK: Record<TaskStatus, number> = {
  Geblokkeerd: 0,
  Bezig: 1,
  'Deze week': 2,
  Review: 3,
  Backlog: 4,
  Klaar: 5,
};

export function compareTasks(a: Task, b: Task): number {
  const overA = isOverdue(a) ? 0 : 1;
  const overB = isOverdue(b) ? 0 : 1;
  if (overA !== overB) return overA - overB;
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr !== 0) return pr;
  // Deadline asc (geen deadline = achteraan)
  const da = a.deadline ?? '9999-12-31';
  const db = b.deadline ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return STATUS_RANK[a.status] - STATUS_RANK[b.status];
}

// ---------------------------------------------------------------------------
// Milestone types — PR 2 toevoeging.
// SQL-CHECK-constraints in 0026_commandcenter_milestones.sql spiegelen exact
// MILESTONE_STATUSES.
// ---------------------------------------------------------------------------

export const MILESTONE_STATUSES = [
  'Niet gestart',
  'Bezig',
  'Geblokkeerd',
  'Afgerond',
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export type Milestone = {
  id: string;
  title: string;
  description: string | null;
  roadmapPhase: RoadmapPhase;
  owner: Owner;
  status: MilestoneStatus;
  deadline: string | null;
  acceptanceCriteria: string[];
  linkedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type MilestoneInput = {
  title: string;
  description?: string | null;
  roadmapPhase?: RoadmapPhase;
  owner?: Owner;
  status?: MilestoneStatus;
  deadline?: string | null;
  acceptanceCriteria?: string[];
  linkedTaskIds?: string[];
};

export type MilestonePatch = Partial<Omit<MilestoneInput, 'title'>> & { title?: string };

export const MILESTONE_DEFAULTS = {
  status: 'Niet gestart' as MilestoneStatus,
  owner: 'Nog toe te wijzen' as Owner,
  roadmapPhase: 'v1' as RoadmapPhase,
};

const MILESTONE_STATUS_RANK: Record<MilestoneStatus, number> = {
  Bezig: 0,
  Geblokkeerd: 1,
  'Niet gestart': 2,
  Afgerond: 3,
};

export function compareMilestones(a: Milestone, b: Milestone): number {
  const sr = MILESTONE_STATUS_RANK[a.status] - MILESTONE_STATUS_RANK[b.status];
  if (sr !== 0) return sr;
  const da = a.deadline ?? '9999-12-31';
  const db = b.deadline ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  return a.title.localeCompare(b.title);
}

/** Een milestone telt als "effectief afgerond" zodra status='Afgerond', óf
 *  zodra alle gekoppelde taken (linkedTaskIds) op status='Klaar' staan.
 *  Zo beweegt roadmap-voortgang live mee met taken zonder DB-write. */
export function isMilestoneEffectivelyDone(m: Milestone, tasks: Task[]): boolean {
  if (m.status === 'Afgerond') return true;
  if (m.linkedTaskIds.length === 0) return false;
  const linked = tasks.filter((t) => m.linkedTaskIds.includes(t.id));
  return (
    linked.length === m.linkedTaskIds.length &&
    linked.every((t) => t.status === 'Klaar')
  );
}

export type MilestoneTaskProgress = {
  done: number;
  total: number;
  ratio: number;
};

/** Taak-voortgang van één milestone: hoeveel van de gekoppelde taken op
 *  status='Klaar' staan. `total` rekent op daadwerkelijk gevonden taken (niet
 *  op linkedTaskIds.length) zodat verwijderde taak-id's de teller niet vervuilen.
 *  total=0 → "vrije invulling" (milestone zonder taken). */
export function computeMilestoneTaskProgress(
  m: Milestone,
  tasks: Task[],
): MilestoneTaskProgress {
  const linked = tasks.filter((t) => m.linkedTaskIds.includes(t.id));
  const total = linked.length;
  const done = linked.filter((t) => t.status === 'Klaar').length;
  return { done, total, ratio: total > 0 ? done / total : 0 };
}

export type PhaseProgress = {
  done: number;
  total: number;
  ratio: number;
  source: 'milestones' | 'tasks' | 'empty';
  /** Taken-stats voor deze fase — altijd berekend zodat UI ook bij
   *  milestones-source een secundaire taken-regel kan tonen. */
  taskStats: { done: number; total: number };
};

/** Voortgang: afgeronde-milestones / totaal (zie goal-prompt §25). Fallback
 *  naar taken als er geen milestones in de fase zijn. Returns 0..1. */
export function computePhaseProgress(
  milestones: Milestone[],
  tasks: Task[],
  phase: RoadmapPhase,
): PhaseProgress {
  const phaseTasks = tasks.filter((t) => t.roadmapPhase === phase);
  const taskStats = {
    done: phaseTasks.filter((t) => t.status === 'Klaar').length,
    total: phaseTasks.length,
  };
  const phaseMs = milestones.filter((m) => m.roadmapPhase === phase);
  if (phaseMs.length > 0) {
    const done = phaseMs.filter((m) => isMilestoneEffectivelyDone(m, tasks)).length;
    return {
      done,
      total: phaseMs.length,
      ratio: done / phaseMs.length,
      source: 'milestones',
      taskStats,
    };
  }
  if (taskStats.total > 0) {
    return {
      done: taskStats.done,
      total: taskStats.total,
      ratio: taskStats.done / taskStats.total,
      source: 'tasks',
      taskStats,
    };
  }
  return { done: 0, total: 0, ratio: 0, source: 'empty', taskStats };
}

// ---------------------------------------------------------------------------
// CheckIn — PR 3 (goal-prompt §12 / §18.3)
// ---------------------------------------------------------------------------

export type CheckIn = {
  id: string;
  weekLabel: string;
  date: string;
  attendees: string[];
  completed: string;
  notCompleted: string;
  reasons: string;
  sebastiaanNextTasks: string[];
  nielsNextTasks: string[];
  sharedNextTasks: string[];
  nextPriorities: string[];
  blockers: string;
  decisions: string;
  createdTaskIds: string[];
  createdAt: string;
};

export type CheckInInput = {
  weekLabel: string;
  date: string;
  attendees?: string[];
  completed?: string;
  notCompleted?: string;
  reasons?: string;
  sebastiaanNextTasks?: string[];
  nielsNextTasks?: string[];
  sharedNextTasks?: string[];
  nextPriorities?: string[];
  blockers?: string;
  decisions?: string;
  createdTaskIds?: string[];
};

export type CheckInPatch = Partial<CheckInInput>;

// ---------------------------------------------------------------------------
// Decision — PR 3 (goal-prompt §13 / §18.4)
// ---------------------------------------------------------------------------

export const DECISION_STATUSES = [
  'Actief',
  'Te herzien',
  'Vervangen',
  'Geannuleerd',
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type Decision = {
  id: string;
  date: string;
  title: string;
  decision: string;
  context: string | null;
  impact: Impact | null;
  decidedBy: Owner[];
  reviewDate: string | null;
  status: DecisionStatus;
  createdAt: string;
  updatedAt: string;
};

export type DecisionInput = {
  date: string;
  title: string;
  decision?: string;
  context?: string | null;
  impact?: Impact | null;
  decidedBy?: Owner[];
  reviewDate?: string | null;
  status?: DecisionStatus;
};

export type DecisionPatch = Partial<DecisionInput>;

export const DECISION_DEFAULTS = {
  status: 'Actief' as DecisionStatus,
  decidedBy: ['Sebastiaan', 'Niels'] as Owner[],
};

const DECISION_STATUS_RANK: Record<DecisionStatus, number> = {
  Actief: 0,
  'Te herzien': 1,
  Vervangen: 2,
  Geannuleerd: 3,
};

export function compareDecisions(a: Decision, b: Decision): number {
  const sr = DECISION_STATUS_RANK[a.status] - DECISION_STATUS_RANK[b.status];
  if (sr !== 0) return sr;
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.title.localeCompare(b.title);
}

// ---------------------------------------------------------------------------
// TestCustomer — PR 3 (goal-prompt §14 / §18.5)
// ---------------------------------------------------------------------------

export const CUSTOMER_STATUSES = [
  'Idee / mogelijke klant',
  'Nog benaderen',
  'Benaderd',
  'Gesprek gepland',
  'Demo gegeven',
  'Testklant actief',
  'Betaalde klant',
  'Afgewezen / later',
] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export type TestCustomer = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  website: string | null;
  companyType: string | null;
  status: CustomerStatus;
  owner: Owner;
  lastContactDate: string | null;
  nextAction: string | null;
  notes: string | null;
  mainProblems: string | null;
  caseStudyPotential: boolean;
  linkedTaskIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type TestCustomerInput = {
  companyName: string;
  contactPerson?: string | null;
  website?: string | null;
  companyType?: string | null;
  status?: CustomerStatus;
  owner?: Owner;
  lastContactDate?: string | null;
  nextAction?: string | null;
  notes?: string | null;
  mainProblems?: string | null;
  caseStudyPotential?: boolean;
  linkedTaskIds?: string[];
};

export type TestCustomerPatch = Partial<TestCustomerInput>;

export const CUSTOMER_DEFAULTS = {
  status: 'Idee / mogelijke klant' as CustomerStatus,
  owner: 'Niels' as Owner,
};

const CUSTOMER_STATUS_RANK: Record<CustomerStatus, number> = {
  'Testklant actief': 0,
  'Gesprek gepland': 1,
  'Demo gegeven': 2,
  Benaderd: 3,
  'Nog benaderen': 4,
  'Idee / mogelijke klant': 5,
  'Betaalde klant': 6,
  'Afgewezen / later': 7,
};

export function compareCustomers(a: TestCustomer, b: TestCustomer): number {
  const sr = CUSTOMER_STATUS_RANK[a.status] - CUSTOMER_STATUS_RANK[b.status];
  if (sr !== 0) return sr;
  // Most recently contacted first within same status
  const da = a.lastContactDate ?? '0000-00-00';
  const db = b.lastContactDate ?? '0000-00-00';
  if (da !== db) return da < db ? 1 : -1;
  return a.companyName.localeCompare(b.companyName);
}

// ---------------------------------------------------------------------------
// Assistant types — Command Center chatbot (migration 0028).
// ---------------------------------------------------------------------------

export const ASSISTANT_ROLES = ['user', 'assistant', 'tool', 'system'] as const;
export type AssistantRole = (typeof ASSISTANT_ROLES)[number];

export type AssistantThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

/** OpenAI-format tool-call op een assistant-turn. */
export type AssistantToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON-encoded
  };
};

/** Payload op role='tool' messages: resultaat van een server-side tool-execute.
 *  `beforeState` wordt door /api/commandcenter/assistant/undo gelezen. */
export type AssistantToolResult = {
  ok: boolean;
  item?: unknown;
  beforeState?: unknown;
  error?: string;
  undone?: boolean;
};

export type AssistantMessage = {
  id: string;
  threadId: string;
  role: AssistantRole;
  content: string | null;
  toolCalls: AssistantToolCall[] | null;
  toolCallId: string | null;
  toolName: string | null;
  toolResult: AssistantToolResult | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  createdAt: string;
};
