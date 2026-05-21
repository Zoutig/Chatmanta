# Widget threads + dashboard-customisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geef widget-bezoekers multi-thread support (drawer-overlay, localStorage-persistentie, auto-prune) en geef klanten in het dashboard pulse-aan/uit, gelogiseerde positie-knoppen en een 9-preset color-picker.

**Architecture:** Twee onafhankelijke werkpakketten in één PR.
- **Threads** zijn pure client-side state: `LocalStorageThreadStore` (achter een `ThreadStore`-interface zodat V1 later DB-impl kan injecteren) + drawer-overlay binnen het bestaande paneel. Geen API-routes, geen migration.
- **Customisation** breidt de bestaande `WidgetSettings` jsonb uit met `pulseEnabled?: boolean` (backwards-compat via default-merge), swapt JSX-volgorde van positie-knoppen, en introduceert een herbruikbare `<PresetColorPicker>`-component die de huidige 4 native pickers vervangt.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (`v0_org_settings.widget` jsonb), lucide-react icons. Geen tests (repo heeft geen widget-test-suite) — verificatie via `npm run typecheck` + handmatige browser-check.

**Spec:** `docs/superpowers/specs/2026-05-21-widget-threads-customisation-design.md`

---

## File Structure

**Create:**
- `lib/widget/thread-types.ts` — `Thread`, `ThreadMessage` types
- `lib/widget/thread-store.ts` — `ThreadStore` interface + `LocalStorageThreadStore` impl
- `lib/widget/color-presets.ts` — 9-color hex array constant
- `app/widget/components/thread-drawer.tsx` — drawer-overlay (new-thread button + thread list + delete)
- `app/klantendashboard/widget/components/preset-color-picker.tsx` — herbruikbare picker met preset-grid + uitklap

**Modify:**
- `lib/v0/klantendashboard/types.ts` — `+ pulseEnabled?: boolean` op `WidgetSettings`
- `lib/v0/klantendashboard/mock/widget-settings.ts` — `pulseEnabled: true` op 4 mock-orgs
- `app/widget/[slug]/layout.tsx` — `pulseEnabled` doorzetten in `widgetOverrides`
- `app/widget/components/widget-shell.tsx` — `pulseEnabled?: boolean` toevoegen aan props + door-pijp naar widget
- `app/widget/components/chatmanta-widget.tsx` — `pulseEnabled` prop + gate pulse-ring + integreer thread-store + render ThreadDrawer + ☰-knop in header
- `app/klantendashboard/widget/components/widget-form.tsx` — swap positie-knoppen-volgorde, pulse aan/uit-toggle, vervang inline `<ColorPicker>` door `<PresetColorPicker>`

---

## Task 1: Type + mock-defaults voor `pulseEnabled`

**Files:**
- Modify: `lib/v0/klantendashboard/types.ts:178-214` (WidgetSettings)
- Modify: `lib/v0/klantendashboard/mock/widget-settings.ts:10-63` (alle 4 mock-orgs)

- [ ] **Step 1: Voeg veld toe aan `WidgetSettings`**

In `lib/v0/klantendashboard/types.ts`, na `pulseColor?: string;` (line 194) en vóór `headerColor?: string;` (line 195), voeg toe:

```ts
  pulseColor?: string; // pulse-ring achter de FAB
  /**
   * Pulse-ring aan/uit. Default `true` (backwards-compat — bestaande rijen
   * zonder dit veld worden behandeld als aan). Wanneer `false` verbergt de
   * widget-runtime de pulse-animatie volledig.
   */
  pulseEnabled?: boolean;
  headerColor?: string; // header bij geopende widget + verstuurknop
```

- [ ] **Step 2: Zet `pulseEnabled: true` op alle 4 mock-orgs**

In `lib/v0/klantendashboard/mock/widget-settings.ts`, voeg per org-object `pulseEnabled: true,` toe (binnen elk van de 4 entries; volgorde maakt niet uit). Voorbeeld voor `acme-corp`:

```ts
  'acme-corp': {
    primaryColor: '#d97706',
    position: 'bottom-right',
    pulseEnabled: true,
    logoStyle: 'brand-mark',
    customLogoDataUrl: null,
    title: 'Vraag het Dakwerken De Boer',
    // ... rest blijft gelijk
  },
```

Doe hetzelfde voor `dev-org`, `globex-inc` en `initech`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (geen errors).

- [ ] **Step 4: Commit**

```bash
git add lib/v0/klantendashboard/types.ts lib/v0/klantendashboard/mock/widget-settings.ts
git commit -m "feat(widget): pulseEnabled-veld op WidgetSettings + mock-defaults"
```

---

## Task 2: Pulse on/off door layout → shell → widget pijpen

**Files:**
- Modify: `app/widget/components/widget-shell.tsx:31-48` (widgetOverrides type) en `:161-181` (prop-doorgift)
- Modify: `app/widget/components/chatmanta-widget.tsx:26-66` (props) en `:288-301` (pulse-render)
- Modify: `app/widget/[slug]/layout.tsx:69-90` (widgetOverrides blob)

- [ ] **Step 1: WidgetShell — accepteer + geef door**

In `app/widget/components/widget-shell.tsx`, voeg `pulseEnabled?: boolean;` toe aan `widgetOverrides` (na `pulseColor?: string;`, line 38):

```ts
    pulseColor?: string;
    pulseEnabled?: boolean;
    headerColor?: string;
```

En bij de `<ChatMantaWidget>`-call (rond line 174), voeg toe:

```tsx
        pulseColor={widgetOverrides?.pulseColor}
        pulseEnabled={widgetOverrides?.pulseEnabled}
        headerColor={widgetOverrides?.headerColor}
```

- [ ] **Step 2: ChatMantaWidget — accepteer prop**

In `app/widget/components/chatmanta-widget.tsx`, voeg toe aan `ChatMantaWidgetProps` (na `pulseColor?: string;`, line 47):

```ts
  pulseColor?: string;
  /**
   * Toggle voor de pulse-animatie. Default `true` — false verbergt de ring.
   */
  pulseEnabled?: boolean;
  headerColor?: string; // header + send-button + user-bubble
```

En bij de destructure (rond line 82), voeg toe:

```ts
  pulseColor,
  pulseEnabled = true,
  headerColor,
```

- [ ] **Step 3: Gate de pulse-render op `pulseEnabled`**

In `app/widget/components/chatmanta-widget.tsx`, vervang de pulse-render guard op line 288:

```tsx
        {/* Pulse-ring achter de FAB — alleen zichtbaar als chat gesloten is.
            Per render gegenereerd met primaryColor zodat hij de org-context volgt. */}
        {!open && pulseEnabled && (
          <span
            aria-hidden="true"
```

(Was: `{!open && (` — voeg `pulseEnabled &&` toe.)

- [ ] **Step 4: Layout — geef `pulseEnabled` mee in `widgetOverrides`**

In `app/widget/[slug]/layout.tsx`, voeg toe aan de widgetOverrides-blob (na `pulseColor: orgSettings.widget.pulseColor,`, ~line 76):

```tsx
        pulseColor: orgSettings.widget.pulseColor,
        pulseEnabled: orgSettings.widget.pulseEnabled,
        headerColor: orgSettings.widget.headerColor,
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/widget/components/widget-shell.tsx app/widget/components/chatmanta-widget.tsx app/widget/[slug]/layout.tsx
git commit -m "feat(widget): pulseEnabled door layout → shell → widget"
```

---

## Task 3: Color-presets constant

**Files:**
- Create: `lib/widget/color-presets.ts`

- [ ] **Step 1: Schrijf het constant-bestand**

Maak `lib/widget/color-presets.ts`:

```ts
// 9 meest-gekozen merkkleuren voor de widget-color-picker.
// Volgorde = 3×3 grid in dashboard (rij 1 = neutraal/blauw, rij 2 = groen/oranje,
// rij 3 = rood/paars/magenta). Wijzigen van de array verandert de visuele
// volgorde — zorg dat klant-favorieten boven-rechts blijven (oranje +07c).

export const COLOR_PRESETS = [
  '#0e1014', // zwart
  '#1e3a8a', // donkerblauw
  '#2563eb', // kobalt
  '#10b981', // mintgroen
  '#047857', // smaragd
  '#f97316', // oranje
  '#ef4444', // rood
  '#7c3aed', // paars
  '#ec4899', // magenta
] as const;

export type ColorPresetHex = (typeof COLOR_PRESETS)[number];

/** True als `hex` exact in de preset-set zit (case-insensitive). */
export function isPreset(hex: string): boolean {
  const norm = hex.toLowerCase();
  return COLOR_PRESETS.some((p) => p.toLowerCase() === norm);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/widget/color-presets.ts
git commit -m "feat(widget): 9 color-presets constant + isPreset helper"
```

---

## Task 4: `<PresetColorPicker>` component

**Files:**
- Create: `app/klantendashboard/widget/components/preset-color-picker.tsx`

- [ ] **Step 1: Schrijf component**

Maak `app/klantendashboard/widget/components/preset-color-picker.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { COLOR_PRESETS, isPreset } from '@/lib/widget/color-presets';

export function PresetColorPicker({
  label,
  hint,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  // Open "Meer kleuren" direct als de huidige waarde geen preset is, zodat
  // de bezoeker niet denkt "mijn kleur is weg".
  const [expanded, setExpanded] = useState(() => !isPreset(value));
  const norm = value.toLowerCase();

  return (
    <div
      style={{
        padding: 10,
        background: 'var(--klant-surface)',
        borderRadius: 'var(--klant-r-md)',
        border: '1px solid var(--klant-border)',
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--klant-fg)' }}>
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--klant-fg-dim)' }}>{hint}</span>
      </div>

      {/* 3×3 swatch-grid */}
      <div
        role="radiogroup"
        aria-label={label}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(9, 1fr)',
          gap: 6,
        }}
      >
        {COLOR_PRESETS.map((hex) => {
          const selected = hex.toLowerCase() === norm;
          return (
            <button
              key={hex}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={hex}
              onClick={() => onChange(hex)}
              style={{
                aspectRatio: '1 / 1',
                borderRadius: 8,
                background: hex,
                border: selected
                  ? '2px solid var(--klant-accent)'
                  : '1px solid var(--klant-border)',
                cursor: 'pointer',
                padding: 0,
                position: 'relative',
                outline: 'none',
                boxShadow: selected ? '0 0 0 2px var(--klant-bg)' : 'none',
              }}
            >
              {selected && (
                <Check
                  size={12}
                  strokeWidth={3}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    margin: 'auto',
                    color: '#fff',
                    mixBlendMode: 'difference',
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: 10,
          background: 'transparent',
          border: 'none',
          color: 'var(--klant-fg-muted)',
          fontSize: 12,
          cursor: 'pointer',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'inherit',
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Meer kleuren
      </button>

      {expanded && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: 34,
              height: 30,
              border: '1px solid var(--klant-border)',
              borderRadius: 'var(--klant-r-sm)',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="klant-input"
            style={{
              fontFamily: 'var(--font-mono), monospace',
              fontSize: 12,
              padding: '6px 8px',
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/klantendashboard/widget/components/preset-color-picker.tsx
git commit -m "feat(klant): PresetColorPicker met 3x3 grid + Meer-kleuren uitklap"
```

---

## Task 5: `widget-form.tsx` — swap positie, pulse-toggle, gebruik nieuwe picker

**Files:**
- Modify: `app/klantendashboard/widget/components/widget-form.tsx:218-243` (4 color-pickers)
- Modify: `app/klantendashboard/widget/components/widget-form.tsx:377-396` (positie-knoppen)
- Modify: `app/klantendashboard/widget/components/widget-form.tsx:832-886` (oude `ColorPicker` function — kan weg na vervanging)

- [ ] **Step 1: Import `PresetColorPicker`**

In `app/klantendashboard/widget/components/widget-form.tsx`, voeg toe na de bestaande imports (rond line 20):

```ts
import { PresetColorPicker } from './preset-color-picker';
```

- [ ] **Step 2: Vervang de 4 `<ColorPicker>`-aanroepen door `<PresetColorPicker>`**

Vervang lines 219-242 (de hele `<div style={{ display: 'grid', ... }}>` met 4 pickers) door:

```tsx
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 10,
            }}
          >
            <PresetColorPicker
              label="Logo-kleur"
              hint="ChatManta-mark of chat-bubble"
              value={resolvedColors.logo}
              onChange={(v) => update('logoColor', v)}
            />
            <PresetColorPicker
              label="Achtergrond-knop"
              hint="Rond bolletje rechtsonder"
              value={resolvedColors.bg}
              onChange={(v) => update('widgetBgColor', v)}
            />
            <div
              style={{
                padding: 10,
                background: 'var(--klant-surface)',
                borderRadius: 'var(--klant-r-md)',
                border: '1px solid var(--klant-border)',
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  color: 'var(--klant-fg)',
                  cursor: 'pointer',
                }}
              >
                <span>
                  Pulse-ring{' '}
                  <span style={{ color: 'var(--klant-fg-dim)', fontWeight: 400 }}>
                    · Animatie rond gesloten knop
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={w.pulseEnabled !== false}
                  onChange={(e) => update('pulseEnabled', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
              </label>
              <PresetColorPicker
                label="Kleur"
                hint="Alleen actief als pulse aanstaat"
                value={resolvedColors.pulse}
                onChange={(v) => update('pulseColor', v)}
                disabled={w.pulseEnabled === false}
              />
            </div>
            <PresetColorPicker
              label="Header + verstuurknop"
              hint="Bovenkant + send-button"
              value={resolvedColors.header}
              onChange={(v) => update('headerColor', v)}
            />
          </div>
```

(Let op: de pulse-block wikkelt de picker in een container die óók de toggle bevat. Grid is nu `1fr` ipv `auto-fit` zodat de pickers volle breedte krijgen — past beter bij het 9-grid.)

- [ ] **Step 3: Swap positie-knoppen-volgorde**

Vervang lines 377-396 (de twee knoppen "Rechtsonder" + "Linksonder") door:

```tsx
          <Field label="Positie">
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => update('position', 'bottom-left')}
                className="klant-btn"
                data-variant={w.position === 'bottom-left' ? 'primary' : 'ghost'}
                style={{ flex: 1 }}
              >
                Linksonder
              </button>
              <button
                type="button"
                onClick={() => update('position', 'bottom-right')}
                className="klant-btn"
                data-variant={w.position === 'bottom-right' ? 'primary' : 'ghost'}
                style={{ flex: 1 }}
              >
                Rechtsonder
              </button>
            </div>
          </Field>
```

- [ ] **Step 4: Verwijder de oude inline `ColorPicker`-helper**

Verwijder de hele `function ColorPicker({ ... })`-definitie (lines 832-886 in de huidige file). Hij wordt niet meer gebruikt. Bewaar `Field`, `LogoChoice`, `StatusCell`, `WidgetMockup`.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/klantendashboard/widget/components/widget-form.tsx
git commit -m "feat(klant): pulse-toggle, positie-knoppen-volgorde, preset-color-picker overal"
```

---

## Task 6: Thread types + LocalStorageThreadStore

**Files:**
- Create: `lib/widget/thread-types.ts`
- Create: `lib/widget/thread-store.ts`

- [ ] **Step 1: Types**

Maak `lib/widget/thread-types.ts`:

```ts
// Thread-types voor de publieke widget. Pure DTOs zonder UI-koppeling, zodat
// de storage-laag (lib/widget/thread-store.ts) en de UI-laag (chatmanta-widget,
// thread-drawer) hetzelfde contract delen.
//
// V0: storage = localStorage. V1 (Supabase Auth) kan zelfde types hergebruiken
// voor een server-store implementatie.

export type ThreadMessage = {
  role: 'user' | 'assistant';
  content: string;
  id: string;
};

export type Thread = {
  id: string;
  /** Auto-gegenereerd uit eerste user-message, max 40 chars. */
  title: string;
  /** ms-since-epoch — sorteer-key voor de lijst. */
  createdAt: number;
  updatedAt: number;
  messages: ThreadMessage[];
};
```

- [ ] **Step 2: Store-interface + LocalStorage-impl**

Maak `lib/widget/thread-store.ts`:

```ts
// Thread-storage voor de widget. Interface + één concrete impl (localStorage).
//
// Waarom een interface? V1 (Supabase Auth + DB) kan z'n eigen ServerThreadStore
// injecteren zonder de UI te raken. Onbenutte tweede impl nu = bewust gekozen
// (lichte over-engineering, ~30 regels) zodat de migratie-grens scherp is.
//
// Per-bot-versie-isolatie: storage-key bevat orgSlug én botVersion zodat v0.6
// en v0.7 demo's niet door elkaar lopen.

import type { Thread, ThreadMessage } from './thread-types';

const MAX_THREADS = 20;
const TITLE_MAX = 40;
const STORAGE_PREFIX = 'chatmanta:widget:threads';
const ACTIVE_PREFIX = 'chatmanta:widget:activeThread';

export interface ThreadStore {
  list(): Thread[];
  get(id: string): Thread | null;
  create(): Thread;
  update(id: string, patch: { messages: ThreadMessage[] }): Thread | null;
  delete(id: string): void;
  getActiveId(): string | null;
  setActiveId(id: string | null): void;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deriveTitle(messages: ThreadMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return 'Nieuw gesprek';
  const clean = firstUser.content.replace(/\s+/g, ' ').trim();
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean;
}

export class LocalStorageThreadStore implements ThreadStore {
  private readonly storageKey: string;
  private readonly activeKey: string;
  private cache: Thread[] | null = null;

  constructor(orgSlug: string, botVersion: string) {
    const ns = `${orgSlug}:${botVersion}`;
    this.storageKey = `${STORAGE_PREFIX}:${ns}`;
    this.activeKey = `${ACTIVE_PREFIX}:${ns}`;
  }

  private read(): Thread[] {
    if (this.cache) return this.cache;
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        this.cache = [];
        return this.cache;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this.cache = [];
        return this.cache;
      }
      this.cache = parsed as Thread[];
      return this.cache;
    } catch (err) {
      // Corrupt JSON of localStorage-fail → behandel als leeg.
      // eslint-disable-next-line no-console
      console.warn('[ThreadStore] read failed, starting fresh', err);
      this.cache = [];
      return this.cache;
    }
  }

  private write(threads: Thread[]): void {
    this.cache = threads;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(threads));
    } catch (err) {
      // QuotaExceededError of disabled storage — in-memory cache blijft werken,
      // bezoeker krijgt geen toast (technische error, niet zijn probleem).
      // eslint-disable-next-line no-console
      console.warn('[ThreadStore] write failed (quota?), in-memory only', err);
    }
  }

  list(): Thread[] {
    return [...this.read()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): Thread | null {
    return this.read().find((t) => t.id === id) ?? null;
  }

  create(): Thread {
    const now = Date.now();
    const thread: Thread = {
      id: makeId(),
      title: 'Nieuw gesprek',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    const all = this.read().slice();
    all.push(thread);
    // Auto-prune: bij 20+ wordt de oudste (laagste updatedAt) verwijderd.
    if (all.length > MAX_THREADS) {
      all.sort((a, b) => a.updatedAt - b.updatedAt);
      all.shift();
    }
    this.write(all);
    return thread;
  }

  update(id: string, patch: { messages: ThreadMessage[] }): Thread | null {
    const all = this.read().slice();
    const idx = all.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const updated: Thread = {
      ...all[idx],
      messages: patch.messages,
      title: deriveTitle(patch.messages) || all[idx].title,
      updatedAt: Date.now(),
    };
    all[idx] = updated;
    this.write(all);
    return updated;
  }

  delete(id: string): void {
    const all = this.read().filter((t) => t.id !== id);
    this.write(all);
    if (this.getActiveId() === id) this.setActiveId(null);
  }

  getActiveId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(this.activeKey);
    } catch {
      return null;
    }
  }

  setActiveId(id: string | null): void {
    if (typeof window === 'undefined') return;
    try {
      if (id === null) window.localStorage.removeItem(this.activeKey);
      else window.localStorage.setItem(this.activeKey, id);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ThreadStore] setActiveId failed', err);
    }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/widget/thread-types.ts lib/widget/thread-store.ts
git commit -m "feat(widget): ThreadStore-interface + LocalStorage-impl met auto-prune"
```

---

## Task 7: `<ThreadDrawer>` component

**Files:**
- Create: `app/widget/components/thread-drawer.tsx`

- [ ] **Step 1: Schrijf de drawer**

Maak `app/widget/components/thread-drawer.tsx`:

```tsx
'use client';

import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import type { Thread } from '@/lib/widget/thread-types';

export function ThreadDrawer({
  threads,
  activeId,
  headerColor,
  onClose,
  onSelect,
  onNew,
  onDelete,
}: {
  threads: Thread[];
  activeId: string | null;
  headerColor: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Gesprekkenlijst"
      style={{
        position: 'absolute',
        inset: 0,
        background: '#f7f8fa',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2,
      }}
    >
      <div style={{ padding: '14px 18px 6px' }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: headerColor,
            color: bestForegroundOn(headerColor),
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        >
          <Plus size={16} strokeWidth={2.2} />
          Nieuw gesprek
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '6px 8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {threads.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              textAlign: 'center',
              padding: '24px 12px',
              lineHeight: 1.5,
            }}
          >
            Nog geen eerdere gesprekken.
            <br />
            Stel een vraag om je eerste gesprek te starten.
          </p>
        ) : (
          threads.map((t) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: t.id === activeId ? '#fff' : 'transparent',
                border: '1px solid',
                borderColor: t.id === activeId ? '#e5e7eb' : 'transparent',
                borderRadius: 10,
                padding: 2,
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(t.id)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '8px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  borderRadius: 8,
                  fontFamily: 'inherit',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: '#0e1014',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 240,
                  }}
                >
                  {t.title}
                </span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  {formatWhen(t.updatedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Gesprek verwijderen?')) onDelete(t.id);
                }}
                aria-label="Verwijder gesprek"
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 8,
                  color: '#9ca3af',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </button>
            </div>
          ))
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid #eaecef',
          background: '#fff',
          padding: '10px 12px',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#6b7280',
            fontSize: 13,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: 4,
            fontFamily: 'inherit',
          }}
        >
          <ArrowLeft size={14} strokeWidth={1.8} />
          Terug naar gesprek
        </button>
      </div>
    </div>
  );
}

function formatWhen(ts: number): string {
  const now = Date.now();
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'zojuist';
  if (diffMin < 60) return `${diffMin} min geleden`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} u geleden`;
  const d = new Date(ts);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function isHexDark(hex: string): boolean {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return r * 0.299 + g * 0.587 + b * 0.114 < 128;
}

function bestForegroundOn(hex: string): string {
  return isHexDark(hex) ? '#ffffff' : '#0a0a0a';
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/widget/components/thread-drawer.tsx
git commit -m "feat(widget): ThreadDrawer overlay (lijst + nieuw + delete)"
```

---

## Task 8: Wire threads in `chatmanta-widget.tsx`

**Files:**
- Modify: `app/widget/components/chatmanta-widget.tsx` (meerdere secties)

- [ ] **Step 1: Imports**

Voeg toe na de bestaande imports (rond line 21):

```ts
import { LocalStorageThreadStore } from '@/lib/widget/thread-store';
import type { Thread } from '@/lib/widget/thread-types';
import { ThreadDrawer } from './thread-drawer';
```

- [ ] **Step 2: State + store-ref**

Binnen de `ChatMantaWidget`-component, na `const abortRef = useRef<AbortController | null>(null);` (line 112), voeg toe:

```ts
  const storeRef = useRef<LocalStorageThreadStore | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
```

- [ ] **Step 3: Init effect — load threads + restore active**

Voeg toe ná de bestaande mobiel-mediaquery-effect (rond line 121):

```ts
  // Init thread-store na hydration. localStorage is alleen client-side
  // beschikbaar — vandaar de useEffect-guard. Bij eerste mount:
  //   1. construct store voor (orgSlug, botVersion)
  //   2. lees alle threads in voor de drawer
  //   3. lees activeId; als het een bestaande thread is → laad messages
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const store = new LocalStorageThreadStore(orgSlug, botVersion);
    storeRef.current = store;
    const all = store.list();
    setThreads(all);
    const id = store.getActiveId();
    const active = id ? store.get(id) : null;
    if (active) {
      setActiveThreadId(active.id);
      setMessages(active.messages.map((m) => ({ ...m, streaming: false })));
    }
  }, [orgSlug, botVersion]);
```

- [ ] **Step 4: Persist after send**

In de `send`-callback (rond line 155-248), aan het eind van de try-block, vóór de catch — direct na `updateAssistant(setMessages, assistantId, { streaming: false });` (line 234) — voeg toe:

```ts
        // Persist naar thread-store. Doe dit nadat de assistant-msg af is
        // (streaming: false) zodat de titel correct uit eerste user-msg wordt
        // afgeleid en geen "..."-snippets in localStorage belanden.
        const store = storeRef.current;
        if (store) {
          let id = activeThreadId;
          if (!id) {
            const t = store.create();
            id = t.id;
            setActiveThreadId(id);
            store.setActiveId(id);
          }
          // Lees finale messages (na alle setMessages-updates) via een functional
          // setState-loop kan niet — we serializen vanuit de in-memory `messages`
          // array gecombineerd met userMsg + final assistant content. Eenvoudiger:
          // we triggeren de persist via een effect (zie volgende step).
          setThreads((prev) => {
            // Optimistisch: drawer ziet de nieuwe thread alvast bovenaan.
            const existing = prev.find((t) => t.id === id);
            const now = Date.now();
            if (existing) {
              return [{ ...existing, updatedAt: now }, ...prev.filter((t) => t.id !== id)];
            }
            return [
              { id: id!, title: 'Nieuw gesprek', createdAt: now, updatedAt: now, messages: [] },
              ...prev,
            ];
          });
        }
```

(Persistente write naar localStorage gebeurt in step 5 via een useEffect die op `messages` luistert; dat houdt de logica gecentraliseerd.)

- [ ] **Step 5: Persist-effect**

Voeg na de send-callback (vóór `const showSuggested = ...`, rond line 250) toe:

```ts
  // Persist messages → thread-store. Triggert na elke setMessages-flush,
  // inclusief streaming-delta's. Dat is goed: bij refresh midden in een
  // streaming-antwoord blijft de partial content bewaard zodat de bezoeker
  // niet "leeg" terugkomt.
  useEffect(() => {
    const store = storeRef.current;
    if (!store || !activeThreadId) return;
    // Strip streaming/error velden — die hoeven niet in de store.
    const plain = messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
    if (plain.length === 0) return;
    const updated = store.update(activeThreadId, { messages: plain });
    if (updated) {
      setThreads((prev) => {
        const others = prev.filter((t) => t.id !== updated.id);
        return [updated, ...others];
      });
    }
  }, [messages, activeThreadId]);
```

- [ ] **Step 6: Drawer handlers**

Vóór de `return (`-statement (rond line 270), voeg toe:

```ts
  const openDrawer = useCallback(() => {
    const store = storeRef.current;
    if (store) setThreads(store.list());
    setDrawerOpen(true);
  }, []);

  const handleNewThread = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setActiveThreadId(null);
    storeRef.current?.setActiveId(null);
    setDrawerOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSelectThread = useCallback((id: string) => {
    const store = storeRef.current;
    if (!store) return;
    const t = store.get(id);
    if (!t) return;
    abortRef.current?.abort();
    setActiveThreadId(id);
    store.setActiveId(id);
    setMessages(t.messages.map((m) => ({ ...m, streaming: false })));
    setDrawerOpen(false);
  }, []);

  const handleDeleteThread = useCallback((id: string) => {
    const store = storeRef.current;
    if (!store) return;
    store.delete(id);
    setThreads(store.list());
    if (id === activeThreadId) {
      setMessages([]);
      setActiveThreadId(null);
    }
  }, [activeThreadId]);
```

- [ ] **Step 7: ☰-knop in header**

In de header-JSX (rond line 443-475), vervang de hele header-`<div>` door:

```tsx
          {/* Header */}
          <div
            style={{
              background: c.header,
              color: bestForegroundOn(c.header),
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <button
              type="button"
              onClick={openDrawer}
              aria-label="Open gesprekkenlijst"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 4,
                opacity: 0.85,
                display: 'inline-flex',
              }}
            >
              <MenuIcon size={16} />
            </button>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{displayTitle}</span>
              <span style={{ fontSize: 11, opacity: 0.85 }}>
                {headerSubtitle?.trim() || 'Online · meestal binnen seconden antwoord'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Sluit"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: 4,
                opacity: 0.85,
              }}
            >
              <CloseIcon size={16} />
            </button>
          </div>
```

En voeg een `MenuIcon`-helper toe onderaan in de file, naast `CloseIcon` (rond line 936):

```tsx
function MenuIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  );
}
```

- [ ] **Step 8: Render `<ThreadDrawer>` als overlay**

Aan het eind van het paneel (binnen de `{open && (`-block, na de footer-`</div>`, vóór de outer closing `</div>` op line 633), voeg toe:

```tsx
          {drawerOpen && (
            <ThreadDrawer
              threads={threads}
              activeId={activeThreadId}
              headerColor={c.header}
              onClose={() => setDrawerOpen(false)}
              onSelect={handleSelectThread}
              onNew={handleNewThread}
              onDelete={handleDeleteThread}
            />
          )}
```

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add app/widget/components/chatmanta-widget.tsx
git commit -m "feat(widget): thread-store + drawer + ☰-knop in header"
```

---

## Task 9: Manuele verificatie (browser)

**Files:** Geen — handmatige test.

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Open: `http://localhost:3000/widget/acme-corp/diensten` (login eerst met V0_DEMO_PASSWORD).

- [ ] **Step 2: Threads — golden path**

  1. Open de widget (klik FAB rechtsonder).
  2. Verifieer: header heeft `☰` linksboven, geen pulse als pulseEnabled aan/uit te wisselen is.
  3. Stel een vraag → antwoord komt → refresh de pagina.
  4. Verifieer: bij heropenen widget zie je vorig bericht.
  5. Klik `☰` → drawer toont 1 thread bovenaan + "+ Nieuw gesprek"-knop.
  6. Klik "+ Nieuw gesprek" → drawer sluit, input focust, chat is leeg.
  7. Stel een tweede vraag → antwoord komt.
  8. Klik `☰` → drawer toont 2 threads, nieuwste boven.
  9. Klik op de oudste → die thread laadt, drawer sluit.
  10. Klik `☰`, klik trash op een thread → `confirm` dialoog → bevestig → thread verdwijnt.

- [ ] **Step 3: Customisation — dashboard**

  1. Open `http://localhost:3000/klantendashboard/widget`.
  2. Klap "Uiterlijk" open.
  3. Verifieer: positie-knoppen staan `[Linksonder | Rechtsonder]`.
  4. Klik 9 swatches in elk van de 4 kleuren-blokken → kleur slaat op.
  5. Klik "Meer kleuren" → native picker + hex-veld verschijnt onder de grid.
  6. Zet pulse-toggle uit → verifieer in /widget/[slug]/[page]-tab dat pulse-ring weg is.
  7. Zet een hex `#5e8c61` (geen preset) → herlaad dashboard → picker opent direct in "Meer kleuren"-state.

- [ ] **Step 4: Capture screenshots**

Maak screenshots van:
- Widget met drawer open + 2+ threads
- Dashboard met de nieuwe color-grid + pulse-toggle
- Widget op mobiel (DevTools responsive mode, <640px) met drawer open

Sla op in repo-root als `qa-threads-drawer.png`, `qa-pulse-toggle.png`, `qa-mobile-drawer.png` (gitignored — alleen voor PR-body).

- [ ] **Step 5: Stop dev server + commit géén screenshots**

Stop dev server. Geen extra commit nodig (screenshots zijn lokaal voor PR-body).

---

## Task 10: PR

**Files:** Geen file-wijzigingen — alleen branch + PR.

- [ ] **Step 1: Verifieer branch + clean state**

Run:
```bash
git rev-parse --abbrev-ref HEAD
git status --porcelain
```
Expected: `feat/seb/widget-threads-customisation` en empty porcelain.

- [ ] **Step 2: Final typecheck + build-check**

Run: `npm run typecheck && npm run build`
Expected: beide PASS. (Build vangt server/client component-boundary fouten op die typecheck mist.)

- [ ] **Step 3: Push branch**

Run: `git push -u origin feat/seb/widget-threads-customisation`
Expected: pre-push-hook laat door (geen direct-push naar main).

- [ ] **Step 4: Open PR**

Run:
```bash
gh pr create --title "feat(widget): multi-thread support + dashboard customisation (pulse-toggle, preset-color-picker)" --body "$(cat <<'EOF'
## Summary

Twee onafhankelijke uitbreidingen:

**Widget — multi-thread support**
- `☰`-knop in header opent een drawer-overlay met alle eerdere gesprekken (per orgSlug + botVersion geïsoleerd).
- "+ Nieuw gesprek"-knop wist messages; thread wordt echt aangemaakt bij eerste user-bericht (geen spook-threads).
- Threads persistent in localStorage achter een `ThreadStore`-interface (V1 kan later DB-impl injecteren). Auto-prune bij 20+.
- Delete per thread via `window.confirm` (geen custom modal).

**Klantendashboard — meer customisation**
- Positie-knoppen staan nu `[Linksonder | Rechtsonder]` (visueel matcht label).
- Pulse-aan/uit-toggle naast de pulse-color picker; widget verbergt de animatie als uit.
- Alle 4 kleur-velden gebruiken een nieuwe `<PresetColorPicker>`: 9 swatches + "Meer kleuren"-uitklap voor native hex/picker.

Spec: `docs/superpowers/specs/2026-05-21-widget-threads-customisation-design.md`
Plan: `docs/superpowers/plans/2026-05-21-widget-threads-customisation.md`

## Hard rules — geen schendingen

- Geen migration: `pulseEnabled` zit in bestaande `v0_org_settings.widget` jsonb, default-merge in `lib/v0/klantendashboard/server/settings.ts:saveWidgetSettings` zorgt voor backwards-compat (`undefined === true`).
- Geen RLS-impact (geen nieuwe tabellen).
- Geen service-role-paden gewijzigd; widget is volledig client-side.
- Geen `NEXT_PUBLIC_*` secret-leaks.

## Test plan

- [ ] `npm run typecheck` + `npm run build` lokaal PASS.
- [ ] Widget op `/widget/acme-corp/diensten`: vraag stellen → refresh → message blijft.
- [ ] Drawer toont threads, "+ Nieuw gesprek" reset chat, delete vraagt confirm.
- [ ] Per-bot-isolation: switch bot-versie in demo-bar → andere thread-set.
- [ ] Auto-prune: 21e thread aanmaken → oudste weg (handmatig in console).
- [ ] Dashboard: positie-knoppen `[Linksonder | Rechtsonder]`, pulse-toggle uit → widget verbergt ring, 9-swatch grid werkt, "Meer kleuren" toont native picker, custom hex opent direct in expanded state.
- [ ] Mobiel (<640px): drawer-overlay rendert correct in fullscreen-paneel.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Verifieer PR**

Run: `gh pr view --json url,number -q '.url'`
Expected: PR-URL terug. Plak in chat-response naar gebruiker.

---

## Self-review checklist (uitgevoerd na schrijven, gefixt inline)

- ✅ Spec coverage — elke acceptance-criterium uit de spec heeft één of meer tasks (Task 1-2 = `pulseEnabled`; Task 3-4 = preset-picker; Task 5 = positie-swap + toggle-UI + integratie; Task 6-7 = thread storage/UI; Task 8 = wire-up).
- ✅ Geen placeholders — alle code-blokken bevatten daadwerkelijke regels, geen "TBD / similar to / fill in".
- ✅ Type-consistentie — `Thread`/`ThreadMessage` defined in Task 6 worden in Task 7-8 met dezelfde shape gebruikt.
- ✅ Bouwordening — Task 6 (store) komt vóór Task 8 (gebruik); Task 4 (component) komt vóór Task 5 (integratie).
