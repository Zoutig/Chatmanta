# ChatManta Command Center — design spec (PR 1 / MVP)

**Datum:** 2026-05-18
**Branch:** `feat/seb/commandcenter`
**Worktree:** `C:\Users\solys\Documents\Code\chatmanta-commandcenter`
**Bron-spec:** `c:\Users\solys\Downloads\chatmanta_command_center_goal_prompt.md` (1781 regels)

## Doel

Interne founder-cockpit voor Sebastiaan & Niels om alle ChatManta-taken, prioriteiten, blokkades, beslissingen en testklanten te beheren. Niet bedoeld als productfeature voor klanten — bewust achter de bestaande V0 demo-password gate.

## Decomposition (3 PRs)

De bron-spec is 1781 regels en dekt 9 sub-pagina's. Te groot voor één PR. Opgedeeld:

| PR  | Scope                                                                                                   | Acceptatie-criteria uit bron |
|-----|---------------------------------------------------------------------------------------------------------|-----------------------------|
| 1   | Hub-card op `/home`, `/commandcenter` route, Dashboard, Tasks-pagina met CRUD, seed data                | 1–14, 22–24                 |
| 2   | Roadmap-pagina, Milestones-pagina, voortgang-berekening                                                 | 15, 16                      |
| 3   | Wekelijkse check-ins, Beslissingenlog, Sales/Testklanten pipeline, Projectgebieden-overview            | 17–21                       |

Deze spec dekt **PR 1**. Vervolg-PRs krijgen eigen specs als ze landen.

## Reasonable-call decisions (geen blokkerende vragen gesteld)

1. **Storage = Supabase** — JSON-file werkt niet op Vercel (serverless), localStorage werkt niet voor 2-user gedeelde state. Eén nieuwe migration `0025_commandcenter.sql` met tabel `cc_tasks`.
2. **Geen RLS** — past bij V0 sandbox-disclaimer. Service-role-only access via lokale `sb()` in `lib/commandcenter/server/storage.ts` (zelfde patroon als `lib/v0/server/faq-snapshot.ts`). Geen klantdata in command-center — interne tool.
3. **Auth = bestaande V0 demo-password** — `proxy.ts` gate-t alle paden automatisch. Server actions doen `requireV0Auth()` defense-in-depth.
4. **Routing = modals voor task-CRUD**, niet aparte routes. Sneller en past bij "binnen 10 seconden taak toevoegen" UX-eis.
5. **Geen drag-and-drop in PR 1** — status wisselen via dropdown is voldoende voor MVP. Kanban-view ook deferred naar PR 2 of later.
6. **Seed-data idempotent op eerste load** — `ensureSeeded()` checkt `cc_tasks` count; als 0, insert seed-set uit bron-spec §19.
7. **Migration-nummer = 0025** — hoogste lokale is 0024. Geen check op open PRs gedaan; herstel via rename als 0025 elders al geclaimd is.

## Architectuur

### Data laag

**Migration `0025_commandcenter.sql`:**

```sql
create table public.cc_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text,
  project_area text not null,
  roadmap_phase text not null,
  owner text not null check (owner in ('Sebastiaan','Niels','Samen','Nog toe te wijzen')),
  status text not null,
  priority text not null,
  deadline date,
  impact text not null,
  effort text not null,
  blocker_reason text,
  next_action text,
  labels text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index cc_tasks_owner_idx on public.cc_tasks (owner);
create index cc_tasks_status_idx on public.cc_tasks (status);
create index cc_tasks_deadline_idx on public.cc_tasks (deadline) where deadline is not null;
```

Geen RLS-policies (past bij V0-sandbox). Trigger op `updated_at` voor auto-update.

### Typed layer

`lib/commandcenter/types.ts` — string-union types uit bron-spec §18.1 (Owner, ProjectArea, RoadmapPhase, TaskStatus, Priority, Impact, Effort) + `Task` interface.

`lib/commandcenter/seed-data.ts` — alle 30 seed-taken uit bron-spec §19 als typed array.

### Server laag

`lib/commandcenter/server/storage.ts`:
- `sb()` — singleton service-role client (V0-patroon)
- `listTasks(filter?): Promise<Task[]>`
- `getTask(id): Promise<Task|null>`
- `createTask(input): Promise<Task>`
- `updateTask(id, patch): Promise<Task>`
- `deleteTask(id): Promise<void>`
- `ensureSeeded(): Promise<void>` — idempotent

`app/actions/commandcenter.ts` — server actions, elk met `requireV0Auth()`:
- `createTaskAction`, `updateTaskAction`, `deleteTaskAction`
- `setStatusAction`, `setOwnerAction`, `setPriorityAction` (quick toggles)

### UI laag

```
app/commandcenter/
├── layout.tsx          # shared layout met sidebar nav
├── page.tsx            # Dashboard (default)
├── tasks/
│   └── page.tsx        # Tasks pagina (lijst + filters)
└── components/
    ├── command-shell.tsx        # Sidebar + header
    ├── dashboard-header.tsx     # Titel + huidige week
    ├── focus-of-week.tsx        # Top-3 prioriteiten kaart
    ├── owner-todo-panel.tsx     # Per-owner kaart (4x)
    ├── quick-stats.tsx          # Counters
    ├── blocked-panel.tsx        # Geblokkeerde taken
    ├── overdue-panel.tsx        # Overdue taken
    ├── decisions-needed.tsx     # Taken met label decision-needed
    ├── task-card.tsx            # Compacte taak-render
    ├── task-modal.tsx           # New/edit task form (client)
    ├── task-list.tsx            # Tabel-view (Tasks pagina)
    ├── filters-bar.tsx          # Owner/status/priority quick-filters
    ├── status-badge.tsx
    ├── priority-badge.tsx
    ├── owner-badge.tsx
    ├── overdue-badge.tsx
    └── blocked-badge.tsx
```

### Hub-card op `/home`

Eén `<HubCard variant="primary" iconName="command" title="Command Center" description="Founder cockpit voor taken, roadmap en testklanten." href="/commandcenter" cta="Open command center" />` toegevoegd na de Admintool-card. Vraagt om nieuw icon `command` in `app/components/svg-icons.tsx`.

### Dashboard layout

Bron-spec §6 letterlijk gevolgd, in deze volgorde:
1. Header (titel + subtitel + huidige week)
2. **Focus van deze week** (max 3 prioriteiten — afgeleid uit P1+Deze week)
3. **3 owner-kaarten** (Sebastiaan / Niels / Samen) naast elkaar op desktop, onder elkaar op mobiel. Plus kleine **Nog toe te wijzen** kaart.
4. **Quick stats** (counters)
5. **Geblokkeerd** sectie
6. **Te laat** sectie
7. **Beslissingen nodig** (taken met label `decision-needed`)
8. Roadmap-voortgang placeholder ("Komt in PR 2")

### Tasks pagina

- Bovenaan: `FiltersBar` (Alles / Sebastiaan / Niels / Samen / Nog toe te wijzen / P1 / Deze week / Geblokkeerd / Te laat)
- Knop "Nieuwe taak" (opent `TaskModal`)
- Tabel met kolommen: titel, eigenaar, status, prioriteit, deadline, projectgebied, volgende actie. Klik op rij = open `TaskModal` voor edit.
- Sortering default: P1 boven, overdue boven, deadline asc.

### Wat NIET in PR 1

- Roadmap-pagina (placeholder kaart op dashboard)
- Milestones-pagina
- CheckIns, Decisions (los), Customers
- Kanban-view (Tasks pagina = lijst-only)
- Drag-and-drop (status wisselt via dropdown)
- Drukke inline-editing (modal is primary edit-path)
- Drag-reorder van prioriteiten

## Acceptatie (PR 1)

1. `/home` toont 5e kaart "Command Center" die naar `/commandcenter` linkt.
2. `/commandcenter` is bereikbaar achter V0-password, niet zonder.
3. Dashboard toont Sebastiaan / Niels / Samen / Nog toe te wijzen kaarten met seed-taken.
4. Dashboard toont geblokkeerde + overdue taken in aparte secties.
5. `/commandcenter/tasks` toont alle taken met owner-filters.
6. Nieuwe taak aanmaken via modal werkt (CRUD).
7. Status / owner / priority wijzigen werkt direct vanuit task-modal.
8. Taak verwijderen werkt met confirm-dialog.
9. Type-check passes (`npm run typecheck` of `tsc --noEmit`).
10. Lokale browser-smoke-test: dashboard rendert, modal opent, taak-create persisteert na reload.

## Verifieerbare checks vóór PR

- [ ] `npm run migrate` slaagt (lokaal of staging)
- [ ] `tsc --noEmit` clean
- [ ] ESLint clean op nieuwe bestanden
- [ ] Browser-smoke-test golden path (zie acceptatie 10)
- [ ] `git rev-parse --abbrev-ref HEAD` = `feat/seb/commandcenter` vóór commit
- [ ] Geen V1-hard-rule schending (Command Center is V0-sandbox tool — geen klantdata, geen multi-tenant claim)
