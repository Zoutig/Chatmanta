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
  'v0.5',
  'v0.6',
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
