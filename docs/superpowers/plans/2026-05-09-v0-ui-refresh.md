# V0 UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Voeg expliciete System/Light/Dark theme-toggle toe aan V0, en verfijn de visuele stijl van alle V0-componenten — zonder functionele wijzigingen.

**Architecture:** Tailwind v4 `@custom-variant dark (.dark)` zet `dark:` utilities op opt-in via class i.p.v. media-query. Eigen `useTheme` hook (~40 regels) beheert `'system' | 'light' | 'dark'` keuze in localStorage en zet `class="dark"` op `<html>`. Inline FOUC-script in `<head>` zet de class vóór React hydrateert. Alle V0-componenten krijgen typografische polish (uppercase tracking-labels, mono metrics, border-left status-accents).

**Tech Stack:** Next.js 16.2.6 (App Router), React 19.2.4, Tailwind CSS v4, TypeScript 5, Geist Sans/Mono (al geladen). Playwright 1.57+ voor smoke test.

**Spec:** `docs/superpowers/specs/2026-05-09-v0-ui-refresh-design.md` (commit `a18b22e`)

---

## File Structure

| File | Status | Verantwoordelijkheid |
|---|---|---|
| `app/globals.css` | Modify | `@custom-variant dark` + CSS-vars switch op `.dark` selector |
| `lib/v0/hooks/use-theme.ts` | **Create** | React hook: `'system' \| 'light' \| 'dark'` keuze, localStorage, OS-listener |
| `app/components/theme-switch.tsx` | **Create** | 3-stop segmented control die `useTheme` gebruikt |
| `app/layout.tsx` | Modify | Inline FOUC-script in `<head>` |
| `app/page.tsx` | Modify | `<ThemeSwitch />` in header, gap-8 tussen secties |
| `app/components/chat-box.tsx` | Modify | Typografie + status-borders + mono metrics; PhaseIndicator/HistoryPanel/SessionStats polish |
| `app/components/ingest-form.tsx` | Modify | Typografie + section-header + status-borders |
| `app/components/doc-list.tsx` | Modify | Typografie + section-header + per-row polish |
| `app/components/version-switcher.tsx` | Modify | Padding/border consistent met ThemeSwitch |
| `package.json` | Modify | Voeg `typecheck` script + `@playwright/test` devDep toe |
| `playwright.config.ts` | **Create** | Minimale Playwright config (chromium, baseURL=localhost:3000) |
| `tests/v0/theme-switch.spec.ts` | **Create** | Smoke test: toggle wisselt class, localStorage persist, geen FOUC |

---

## Task 1: Tailwind v4 dark variant + CSS-vars op `.dark` selector

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Lees huidige `app/globals.css`**

Verwacht (huidige inhoud, ter referentie):

```css
@import "tailwindcss";

:root {
  --background: #ffffff;
  --foreground: #171717;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 2: Vervang `app/globals.css` volledig**

```css
@import "tailwindcss";

/* Make `dark:` utilities trigger when <html class="dark"> is set,
   instead of @media (prefers-color-scheme: dark). The useTheme hook
   manages this class explicitly. */
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --foreground: #171717;
}

.dark {
  --background: #0a0a0a;
  --foreground: #ededed;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

Belangrijke wijzigingen:
1. `@custom-variant dark` → `dark:` werkt nu op `class="dark"` in plaats van OS-preference
2. `.dark { ... }` selector vervangt `@media (prefers-color-scheme: dark)` voor CSS-vars
3. `body { font-family }` gebruikt nu `var(--font-sans)` (Geist) i.p.v. Arial — kleine fix, paste bij V0-UI

- [ ] **Step 3: Verify next dev start zonder errors**

```bash
npm run dev
```

Expected: server start zonder Tailwind compile-errors. Open `http://localhost:3000` — moet er hetzelfde uitzien als nu (we hebben nog geen `class="dark"` toegevoegd, dus light-mode is default. Hard rule: bestaande `dark:` classes "doen niets" tot stap 4).

Stop dev server na verify (`Ctrl+C`).

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "refresh(V0): tailwind v4 dark variant via class strategy

Switch from @media (prefers-color-scheme: dark) to @custom-variant
dark (.dark). Bestaande dark: utilities triggeren nu op class op <html>.
Maakt expliciete theme-toggle mogelijk."
```

---

## Task 2: useTheme hook

**Files:**
- Create: `lib/v0/hooks/use-theme.ts`

- [ ] **Step 1: Maak directory**

```bash
mkdir -p lib/v0/hooks
```

- [ ] **Step 2: Schrijf `lib/v0/hooks/use-theme.ts`**

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'chatmanta-theme';

function readChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'system';
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // localStorage kan ontoegankelijk zijn (private browsing); val terug op system
  }
  return 'system';
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice !== 'system') return choice;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyToDom(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  root.setAttribute('data-theme', resolved);
}

export function useTheme(): {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  set: (c: ThemeChoice) => void;
} {
  // SSR: start met 'system'. Inline FOUC-script in layout.tsx heeft de DOM
  // al voor ons gezet, dus initial render flickert niet.
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  // Eerste mount: lees opgeslagen voorkeur en resolve.
  useEffect(() => {
    const stored = readChoice();
    setChoice(stored);
    setResolved(resolveTheme(stored));
  }, []);

  // Listen naar OS-preference change als choice='system'.
  useEffect(() => {
    if (choice !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next = resolveTheme('system');
      setResolved(next);
      applyToDom(next);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [choice]);

  const set = useCallback((c: ThemeChoice) => {
    setChoice(c);
    try {
      window.localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // Negeer write-fouten in private browsing
    }
    const next = resolveTheme(c);
    setResolved(next);
    applyToDom(next);
  }, []);

  return { choice, resolved, set };
}
```

- [ ] **Step 3: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: geen errors.

- [ ] **Step 4: Commit**

```bash
git add lib/v0/hooks/use-theme.ts
git commit -m "refresh(V0): useTheme hook met system/light/dark + localStorage

Eigen hook (~50 regels), geen next-themes dep. Beheert keuze in
localStorage en zet class='dark' op <html>. OS-listener actief
wanneer choice='system'."
```

---

## Task 3: FOUC-preventie via inline script in layout.tsx

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Lees huidige `app/layout.tsx`**

Verwacht (huidige inhoud):

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ChatManta V0',
  description: 'V0 RAG demo — Jorion Solutions.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Vervang `app/layout.tsx` volledig**

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ChatManta V0',
  description: 'V0 RAG demo — Jorion Solutions.',
};

// Inline script dat vóór React-hydratie de juiste theme-class zet op <html>.
// Voorkomt flash-of-wrong-theme op hard-reload. Houden we klein en synchroon.
const themeBootScript = `
(function() {
  try {
    var k = 'chatmanta-theme';
    var c = localStorage.getItem(k);
    if (c !== 'light' && c !== 'dark' && c !== 'system') c = 'system';
    var resolved = c;
    if (c === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    root.setAttribute('data-theme', resolved);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="nl"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
        {children}
      </body>
    </html>
  );
}
```

Belangrijk:
- `dangerouslySetInnerHTML` is hier veilig: de string is statisch en bevat geen user-input
- Het script draait synchroon vóór de body-render, dus geen flash
- `suppressHydrationWarning` op `<html>` voorkomt React-warning: het inline-script voegt `class="dark"` toe vóór hydration, dat is een bewuste mismatch met de server-render
- Bij JS-uit (no-script) blijft de UI in light-mode — acceptabel voor interne tool

- [ ] **Step 3: Verify typecheck + dev start**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000`, hard-reload. Expected: geen flash bij laden, light mode standaard. In dev tools: `<html>` heeft `data-theme="light"` attribuut. Stop met Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "refresh(V0): FOUC-preventie via inline theme-boot script

Synchroon script in <head> zet class='dark' + data-theme op <html>
voordat React hydrateert. Leest localStorage of valt terug op
prefers-color-scheme."
```

---

## Task 4: ThemeSwitch component

**Files:**
- Create: `app/components/theme-switch.tsx`

- [ ] **Step 1: Schrijf `app/components/theme-switch.tsx`**

```tsx
'use client';

import { useTheme, type ThemeChoice } from '@/lib/v0/hooks/use-theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: string; aria: string }[] = [
  { value: 'system', label: 'System', icon: '◐', aria: 'Volg systeem-voorkeur' },
  { value: 'light', label: 'Light', icon: '☀', aria: 'Light mode' },
  { value: 'dark', label: 'Dark', icon: '☾', aria: 'Dark mode' },
];

export function ThemeSwitch() {
  const { choice, set } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {OPTIONS.map((opt) => {
        const active = choice === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.aria}
            onClick={() => set(opt.value)}
            className={
              active
                ? 'rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900'
                : 'rounded-full px-2.5 py-1 text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50'
            }
          >
            <span aria-hidden="true">{opt.icon}</span>
            <span className="ml-1">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npx tsc --noEmit
```

Expected: geen errors.

- [ ] **Step 3: Commit**

```bash
git add app/components/theme-switch.tsx
git commit -m "refresh(V0): ThemeSwitch component met system/light/dark radio-groep

Drie-stop segmented control. Toetsenbord-toegankelijk (radiogroup
semantiek). Visueel klein, past in header naast version-switcher."
```

---

## Task 5: Wire ThemeSwitch in header (page.tsx)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Lees huidige `app/page.tsx`**

Verwacht: bevat `<header>` met `<VersionSwitcher>`. Het hele block moet aangepast om ThemeSwitch ernaast te zetten.

- [ ] **Step 2: Vervang `app/page.tsx` volledig**

```tsx
// V0 demo home — chat UI + sources panel + threshold slider + ingest +
// doc-list + bot version switcher + theme switch.

import { ChatBox } from './components/chat-box';
import { DocList } from './components/doc-list';
import { IngestForm } from './components/ingest-form';
import { VersionSwitcher } from './components/version-switcher';
import { ThemeSwitch } from './components/theme-switch';
import { listDocs } from '@/lib/v0/server/rag';
import { BOT_VERSIONS_ORDERED, BOTS, resolveBot } from '@/lib/v0/server/bots';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const bot = resolveBot(v);
  const docs = await listDocs();

  // Strip server-only fields (long prompts) before passing to client.
  const allBots = BOT_VERSIONS_ORDERED.map((vKey) => {
    const b = BOTS[vKey];
    return { version: b.version, label: b.label, description: b.description };
  });

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            ChatManta
          </h1>
          <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            RAG · {bot.version} · {bot.chatModel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <VersionSwitcher current={bot.version} bots={allBots} />
        </div>
      </header>

      <ChatBox
        key={bot.version}
        botVersion={bot.version}
        defaultThreshold={bot.similarityThreshold}
        defaultEnableRewrite={bot.enableRewriteByDefault}
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr]">
        <IngestForm />
        <DocList docs={docs} />
      </section>
    </main>
  );
}
```

Wijzigingen:
- `gap-6` → `gap-8` op main (spec: ruimer tussen secties)
- Header: `gap-4` ipv `gap-2`, items-start sm-style
- Title-block: `RAG demo · OpenAI text-embedding-3-small + {chatModel}` → uppercase tracking-label `RAG · {version} · {chatModel}` (compacter, mono-feel)
- Header rechts: flex container met `<ThemeSwitch />` + `<VersionSwitcher />` naast elkaar

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000`. Expected: ThemeSwitch zichtbaar links van VersionSwitcher in header. Klik System/Light/Dark — UI flipt direct, hard-reload behoudt keuze. Stop met Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "refresh(V0): wire ThemeSwitch in header + ruimere spacing

ThemeSwitch naast VersionSwitcher. Sectie-gap 6→8. Title-tagline
gecomprimeerd naar uppercase tracking-label."
```

---

## Task 6: Visual refresh — chat-box.tsx

**Files:**
- Modify: `app/components/chat-box.tsx`

Dit is de grootste task — chat-box bevat ChatBox, SessionStats, PhaseIndicator, HistoryPanel, ExamplesBar, ThresholdSlider, AnswerPanel, Stats, SourcesPanel, SourcesPanelBody. Alle krijgen polish.

- [ ] **Step 1: Lees huidige `app/components/chat-box.tsx`**

Bevat de 9 sub-componenten hierboven. Logica blijft 100% onveranderd.

- [ ] **Step 2: Update `SessionStats` (regels ±238-275)**

Vervang het complete `SessionStats` block door:

```tsx
function SessionStats({
  costUsd,
  queryCount,
  version,
  turnCount,
  onReset,
}: {
  costUsd: number;
  queryCount: number;
  version: string;
  turnCount: number;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Sessie
      </span>
      <span className="font-mono text-zinc-700 dark:text-zinc-300">{version}</span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <span className="text-zinc-500 dark:text-zinc-400">
        {queryCount} {queryCount === 1 ? 'vraag' : 'vragen'}
      </span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <span className="font-mono text-zinc-900 dark:text-zinc-50">
        ${costUsd.toFixed(6)}
      </span>
      <span className="text-zinc-300 dark:text-zinc-700">·</span>
      <span className="text-zinc-500 dark:text-zinc-400">
        {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
      </span>
      {turnCount > 0 ? (
        <button
          type="button"
          onClick={onReset}
          className="ml-auto rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500 hover:border-red-400 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-500 dark:hover:border-red-700 dark:hover:text-red-400"
        >
          Reset gesprek
        </button>
      ) : null}
    </div>
  );
}
```

Wijzigingen:
- `bg-zinc-50` → `bg-white` (light) / blijft `bg-zinc-900` dark — meer contrast met page-bg
- `<strong>Sessie</strong>` → uppercase tracking label
- Versie wordt mono (visuele consistency met andere metrics)
- Cost krijgt prominent text-color (zinc-900 light / zinc-50 dark) i.p.v. default
- Separator-bullets `·` als zinc-300/700 voor subtiele scheiding
- "turn in geschiedenis" → kortere "turn"/"turns"

- [ ] **Step 3: Update `PhaseIndicator` (regels ±277-284)**

Vervang het complete `PhaseIndicator` block door:

```tsx
function PhaseIndicator({ phase }: { phase: PipelinePhase }) {
  const accentDot =
    phase === 'answer' || phase === 'retrieve'
      ? 'bg-emerald-500 dark:bg-emerald-400'
      : 'bg-zinc-400 dark:bg-zinc-500';
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-200 border-l-2 border-l-zinc-400 bg-white p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:border-l-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
      <span className={`inline-block h-2 w-2 animate-pulse rounded-full ${accentDot}`} />
      <span className="font-mono text-xs">{PHASE_LABELS[phase]}</span>
    </div>
  );
}
```

Wijzigingen:
- Border-left accent (zinc-400 light / zinc-600 dark)
- Pulse-dot wordt emerald als de fase "actief werk" is (retrieve/answer) — voor visuele feedback "we doen iets nuttigs"
- Phase-label in mono-xs (consistent met andere metrics)

- [ ] **Step 4: Update `HistoryPanel` (regels ±286-307)**

Vervang het complete `HistoryPanel` block door:

```tsx
function HistoryPanel({ history }: { history: ChatHistoryTurn[] }) {
  return (
    <details className="rounded-md border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Geschiedenis · {history.length / 2} turns
      </summary>
      <ul className="space-y-1.5 px-3 pb-3">
        {history.map((t, i) => (
          <li
            key={i}
            className="rounded border border-zinc-200 border-l-2 border-l-zinc-300 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:border-l-zinc-700 dark:bg-zinc-950"
          >
            <span className="mr-2 font-mono text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              {t.role === 'user' ? 'jij' : 'bot'}
            </span>
            <span className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{t.content}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
```

Wijzigingen:
- `bg-zinc-50` → `bg-white` (light) — past beter bij de andere kaarten
- Summary in uppercase tracking-label-stijl (consistent met SessionStats)
- Per-turn rij krijgt border-left accent (zinc-300/700) en lichte bg-zinc-50/950 voor onderscheid van section-bg
- "jij"/"bot" label krijgt extra `mr-2` voor ademruimte

- [ ] **Step 5: Update `ThresholdSlider` (regels ±336-362)**

Vervang het complete `ThresholdSlider` block door:

```tsx
function ThresholdSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300">
      <span className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
          Similarity threshold
        </span>
        <span className="font-mono text-xs text-zinc-900 dark:text-zinc-50">
          {value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-zinc-900 dark:accent-zinc-50"
      />
      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
        lager = lossere match · hoger = strikter
      </span>
    </label>
  );
}
```

Wijzigingen:
- Label naar uppercase tracking
- Waarde wordt prominent (zinc-900/50) en mono — goed scanbaar
- Helper-text (lager/hoger) verplaatst naar onder de slider, kleinere font

- [ ] **Step 6: Update Vraag-textarea label en submit-button (regels ±175-214)**

Zoek het block dat begint met `<form onSubmit={onSubmit}` en `<label className="text-sm font-medium...`. Vervang het volledige `<form>...</form>` block (binnen de `<section>`) door:

```tsx
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
              Vraag
            </span>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Stel een vraag over de geüploade documenten…"
              rows={3}
              maxLength={1000}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>

          <ThresholdSlider value={threshold} onChange={setThreshold} />

          <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={enableRewrite}
              onChange={(e) => setEnableRewrite(e.target.checked)}
              className="h-4 w-4 accent-zinc-900 dark:accent-zinc-50"
            />
            <span>
              Slimme pre-processing
              <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400">
                (smalltalk-detectie + typfouten + synoniemen, +1 LLM-call ≈ $0.0001)
              </span>
            </span>
          </label>

          <ExamplesBar onPick={onExampleClick} disabled={pending} />

          <button
            type="submit"
            disabled={pending || question.trim().length === 0}
            className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {pending ? 'Bezig…' : 'Vraag stellen'}
          </button>
        </form>
```

Enige wijziging: `Vraag` label is nu uppercase tracking-style (consistent met andere section-labels). Rest van form blijft identiek.

- [ ] **Step 7: Update `ExamplesBar` voorbeeldvragen-label (regels ±309-334)**

Vervang het complete `ExamplesBar` block door:

```tsx
function ExamplesBar({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Voorbeeldvragen
      </span>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Enige wijziging: label naar uppercase tracking-style.

- [ ] **Step 8: Update `AnswerPanel` — preserveer v0.3 logica + border-left accent**

Vervang het complete `AnswerPanel` block (en de NIEUWE sub-componenten `ConfidenceBadge`, `CitedText`, `FollowUpsBar` — die staan ondergebracht in dezelfde file) door deze gepolijste versies. Belangrijk: de v0.3 functionaliteit (parseStreamingV03, extras-badges, subQueries, CitedText, thinking-indicator, FollowUpsBar) blijft intact, alleen de styling wordt aangepast.

```tsx
function AnswerPanel({
  response,
  streamingText,
  pending,
  onAskFollowUp,
}: {
  response: ChatResponse;
  streamingText: string | null;
  pending: boolean;
  onAskFollowUp: (q: string) => void;
}) {
  // Border-left accent per response-kind. Subtiele all-around border + bg blijven uniform.
  const accentClass =
    response.kind === 'fallback'
      ? 'border-l-amber-500'
      : response.kind === 'smalltalk'
        ? 'border-l-sky-500'
        : 'border-l-zinc-900 dark:border-l-emerald-500';

  const rewriteToShow =
    response.kind !== 'smalltalk' &&
    response.rewrite &&
    response.rewrite.rewritten !== response.rewrite.original
      ? response.rewrite.rewritten
      : null;

  // V0.3: tijdens streaming kan tekst <thinking>/<answer>/<confidence> bevatten.
  // Parse client-side zodat we alleen het echte antwoord tonen.
  const parsedStreaming = streamingText !== null ? parseStreamingV03(streamingText) : null;
  const displayText = parsedStreaming !== null ? parsedStreaming.answer : response.answer;
  const stillThinking =
    parsedStreaming !== null &&
    parsedStreaming.thinking !== null &&
    parsedStreaming.answer.length === 0;

  const extras = response.kind === 'answer' ? response.extras : undefined;

  return (
    <div
      className={`rounded-lg border border-zinc-200 border-l-2 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 ${accentClass}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {response.botVersion}
        </span>
        {response.kind === 'fallback' ? (
          <span className="text-[10px] uppercase tracking-[0.08em] text-amber-700 dark:text-amber-400">
            Fallback
          </span>
        ) : null}
        {response.kind === 'smalltalk' ? (
          <span className="text-[10px] uppercase tracking-[0.08em] text-sky-700 dark:text-sky-400">
            Smalltalk
          </span>
        ) : null}
        {extras?.fromCache ? (
          <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
            Cache
          </span>
        ) : null}
        {extras?.cascadeUsed ? (
          <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-orange-700 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300">
            Cascade
          </span>
        ) : null}
        {extras?.confidence !== undefined ? <ConfidenceBadge value={extras.confidence} /> : null}
      </div>
      {rewriteToShow ? (
        <div className="mb-3 rounded border border-zinc-200 border-l-2 border-l-blue-500 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <span className="mr-1 text-[10px] uppercase tracking-[0.08em] text-blue-700 dark:text-blue-300">
            Rewritten
          </span>
          <span className="italic">{rewriteToShow}</span>
        </div>
      ) : null}
      {extras?.subQueries && extras.subQueries.length > 1 ? (
        <details className="mb-3 rounded border border-zinc-200 border-l-2 border-l-blue-500 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-blue-700 dark:text-blue-300">
            Sub-vragen · {extras.subQueries.length}
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {extras.subQueries.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {stillThinking ? (
        <p className="text-sm italic text-zinc-500 dark:text-zinc-400">
          <span className="mr-1 text-[10px] uppercase tracking-[0.08em]">Denkt</span>
          aan het nadenken…
        </p>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-50">
          <CitedText
            text={displayText}
            sources={response.kind !== 'smalltalk' ? response.sources : []}
          />
          {streamingText !== null && pending ? (
            <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-zinc-400 align-middle dark:bg-zinc-500" />
          ) : null}
        </p>
      )}
      {extras?.followUps && extras.followUps.length > 0 && streamingText === null ? (
        <FollowUpsBar followUps={extras.followUps} onPick={onAskFollowUp} />
      ) : null}
      {streamingText === null ? <Stats response={response} /> : null}
    </div>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone =
    value >= 0.8
      ? 'border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
      : value >= 0.5
        ? 'border-yellow-200 text-yellow-800 dark:border-yellow-900 dark:text-yellow-300'
        : 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300';
  return (
    <span
      className={`rounded border bg-white px-1.5 py-0.5 font-mono text-[10px] dark:bg-zinc-900 ${tone}`}
    >
      conf {pct}%
    </span>
  );
}

function CitedText({
  text,
  sources,
}: {
  text: string;
  sources: { filename: string | null; similarity: number }[];
}) {
  // Split rond [N] tokens en render ze als kleine sup-badges.
  const parts: React.ReactNode[] = [];
  const re = /\[(\d+)\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const num = Number.parseInt(m[1], 10);
    const src = sources[num - 1];
    parts.push(
      <sup
        key={`${m.index}`}
        title={src ? `${src.filename ?? '(geen filename)'} · sim ${src.similarity.toFixed(3)}` : `chunk ${num}`}
        className="ml-0.5 inline-block cursor-help rounded bg-zinc-100 px-1 font-mono text-[9px] font-bold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        {num}
      </sup>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function FollowUpsBar({
  followUps,
  onPick,
}: {
  followUps: string[];
  onPick: (q: string) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Vervolgvragen
      </span>
      <div className="flex flex-wrap gap-1.5">
        {followUps.map((q, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-full border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-700 hover:border-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-800"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
```

Belangrijke veranderingen:
- AnswerPanel: alle v0.3-logica blijft (parseStreamingV03, extras, CitedText, FollowUpsBar). Visueel: uniforme `border-zinc-200/zinc-800 bg-white/zinc-900` + `border-l-2 border-l-{kleur}` voor status.
- Badges (Cache/Cascade): tekst-only kleur-tinten → outline-stijl met uppercase tracking ("Cache", "Cascade") — consistent met andere uppercase labels.
- ConfidenceBadge: van vol-gevulde kleur-tint naar outline + mono "conf 80%" — visueel rustiger en mono-consistent.
- CitedText: `bg-blue-100 text-blue-800` → neutraal `bg-zinc-100 text-zinc-700` met hover voor affordance — minder kleurpapegaai, mono numbers.
- FollowUpsBar: label "Vervolgvragen" naar uppercase tracking (consistent met "Voorbeeldvragen" in ExamplesBar).
- Rewrite-block: van blue-50 bg → neutrale bg met blue border-left accent (rustiger).
- subQueries-details: zelfde border-left blue pattern, uppercase summary "Sub-vragen · N".
- Thinking-indicator: van enkel emoji "💭" naar uppercase "Denkt" label — past bij rest van de typografie.
- All-around `border-amber-300 bg-amber-50` patroon → uniforme bg + border-left. Visueel rustiger.

- [ ] **Step 9: Update `SourcesPanel` en `SourcesPanelBody` (regels ±438-491)**

Vervang beide blokken door:

```tsx
function SourcesPanel({ response }: { response: ChatResponse | null }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Bronnen
      </h2>
      <SourcesPanelBody response={response} />
    </div>
  );
}

function SourcesPanelBody({ response }: { response: ChatResponse | null }) {
  if (!response) {
    return (
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Stel een vraag om opgehaalde chunks te zien.
      </p>
    );
  }
  if (response.kind === 'smalltalk') {
    return (
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        Direct antwoord — geen documenten doorzocht.
      </p>
    );
  }
  if (response.sources.length === 0) {
    return (
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Geen chunks opgehaald.</p>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {response.sources.map((s, i) => {
        const hit = s.similarity >= response.threshold;
        const accent = hit
          ? 'border-l-emerald-500'
          : 'border-l-zinc-300 dark:border-l-zinc-700';
        return (
          <li
            key={i}
            className={`rounded border border-zinc-200 border-l-2 bg-white p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950 ${accent}`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                {s.filename ?? '(geen filename)'}
              </span>
              <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                {s.similarity.toFixed(3)}
              </span>
            </div>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400">{s.contentExcerpt}</p>
          </li>
        );
      })}
    </ul>
  );
}
```

Wijzigingen:
- Heading "Bronnen" → uppercase tracking style
- Per-chunk: uniforme `border-zinc-200/zinc-800 bg-white/zinc-950` + `border-l-2 border-l-{emerald-500 als hit | zinc-300/700 als miss}` — oud `bg-emerald-50` viel te kleurig op
- `space-y-3` → `space-y-2` (compacter)

- [ ] **Step 10: Update Error-blok (regels ±216-220)**

Zoek de error-render block:

```tsx
{error ? (
  <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
    {error}
  </div>
) : null}
```

Vervang door:

```tsx
{error ? (
  <div className="rounded-md border border-zinc-200 border-l-2 border-l-red-500 bg-white p-3 text-sm text-red-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-red-400">
    <span className="mr-2 text-[10px] uppercase tracking-[0.08em]">Fout</span>
    {error}
  </div>
) : null}
```

Wijziging: consistent border-left pattern + uppercase "Fout" label.

- [ ] **Step 11: Verify**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000`. Stel een vraag (bv. "wat doet ChatManta?"). Expected:
- Vraag-label uppercase
- PhaseIndicator zichtbaar tijdens pipeline (eventueel emerald-dot bij retrieve/answer)
- AnswerPanel met dunne border-left accent (zwart light, emerald dark)
- Sources met emerald border-left voor hits
- Threshold-waarde prominent en mono
- v0.3-badges (Cache/Cascade/conf%) als outline-style uppercase labels naast versie-pill
- CitedText `[N]` als neutrale grijze sup-numbers
- FollowUpsBar met uppercase "Vervolgvragen" label
- Toggle theme via switch en zie dezelfde polish in dark mode

Stop met Ctrl+C.

- [ ] **Step 12: Commit**

```bash
git add app/components/chat-box.tsx
git commit -m "refresh(V0): chat-box typografie + border-left accents

Uppercase tracking-labels op section-headers (Vraag, Voorbeeldvragen,
Threshold, Bronnen, Geschiedenis). Status via border-left ipv all-around
kleur (rustiger). PhaseIndicator pulse-dot accent emerald op retrieve/
answer. Mono metrics consistent prominent."
```

---

## Task 7: Visual refresh — ingest-form.tsx

**Files:**
- Modify: `app/components/ingest-form.tsx`

- [ ] **Step 1: Lees huidige `app/components/ingest-form.tsx`**

Bevat IngestForm + Status sub-components.

- [ ] **Step 2: Vervang `app/components/ingest-form.tsx` volledig**

```tsx
'use client';

import { useActionState, useRef, useEffect } from 'react';
import { ingestAction, type IngestActionState } from '../actions/docs';

const initial: IngestActionState = { kind: 'idle' };

export function IngestForm() {
  const [state, action, pending] = useActionState(ingestAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset file input after a successful upload so the same file can be picked
  // again or a new one chosen.
  useEffect(() => {
    if (state.kind === 'success' && formRef.current) {
      formRef.current.reset();
    }
  }, [state]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Document toevoegen
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        .txt of .md, max 200 KB. Wordt direct gechunked + geëmbed.
      </p>
      <form ref={formRef} action={action} className="mt-3 flex flex-col gap-3">
        <input
          type="file"
          name="file"
          accept=".txt,.md,text/plain,text/markdown"
          required
          className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-800 dark:text-zinc-300 dark:file:bg-zinc-50 dark:file:text-zinc-900 dark:hover:file:bg-zinc-200"
        />
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {pending ? 'Bezig…' : 'Uploaden + indexeren'}
        </button>
      </form>
      <Status state={state} />
    </div>
  );
}

function Status({ state }: { state: IngestActionState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'error') {
    return (
      <p className="mt-3 rounded-md border border-zinc-200 border-l-2 border-l-red-500 bg-white p-2 text-xs text-red-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-red-400">
        <span className="mr-2 text-[10px] uppercase tracking-[0.08em]">Fout</span>
        {state.message}
      </p>
    );
  }
  const { result, filename } = state;
  return (
    <p className="mt-3 rounded-md border border-zinc-200 border-l-2 border-l-emerald-500 bg-white p-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
      <span className="mr-2 text-[10px] uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-400">
        OK
      </span>
      <strong>{filename}</strong> opgenomen — <span className="font-mono">{result.chunks} chunks · {result.embedTokens} embed tokens · ${result.costUsd.toFixed(6)}</span>
    </p>
  );
}
```

Wijzigingen:
- `<h2>` "Document toevoegen" → uppercase tracking-label
- Status-meldingen: border-left pattern (rood error / emerald success) i.p.v. all-around bg-tint
- "OK" label uppercase tracking voor success
- Stats (chunks, tokens, cost) gebundeld in `<span class="font-mono">` voor visuele scan

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: geen errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/ingest-form.tsx
git commit -m "refresh(V0): ingest-form typografie + border-left status

Section-header uppercase tracking. Status-meldingen via border-left
i.p.v. bg-tint. Cost/chunks in mono."
```

---

## Task 8: Visual refresh — doc-list.tsx

**Files:**
- Modify: `app/components/doc-list.tsx`

- [ ] **Step 1: Lees huidige `app/components/doc-list.tsx`**

Bevat DocList + DocRow sub-components.

- [ ] **Step 2: Vervang `app/components/doc-list.tsx` volledig**

```tsx
'use client';

import { useState, useTransition } from 'react';
import { removeDocAction } from '../actions/docs';
import type { DocSummary } from '@/lib/v0/server/rag';

export function DocList({ docs }: { docs: DocSummary[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="flex items-baseline gap-2 text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Geïndexeerde documenten
        <span className="font-mono text-zinc-700 dark:text-zinc-300">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          Nog geen documenten. Upload links om te beginnen.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
          {docs.map((d) => (
            <DocRow key={d.id} doc={d} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocRow({ doc }: { doc: DocSummary }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Verwijder "${doc.filename}"? Chunks worden ook verwijderd.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await removeDocAction(doc.id);
      if (!res.ok) setError(res.error ?? 'verwijderen mislukt');
    });
  }

  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">{doc.filename}</p>
        <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          {doc.chunkCount} chunks · {doc.status}
          {error ? ` · ${error}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        className="rounded border border-zinc-200 px-2 py-1 text-[11px] text-zinc-500 opacity-60 transition hover:border-red-400 hover:text-red-600 hover:opacity-100 disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-500 dark:hover:border-red-700 dark:hover:text-red-400"
      >
        {pending ? '…' : 'Verwijder'}
      </button>
    </li>
  );
}
```

Wijzigingen:
- Heading: uppercase tracking + count in mono naast de tekst
- Row padding: `py-2` → `py-2.5` voor iets meer ademruimte
- Filename prominent (font-medium, zinc-900/50)
- Stats-regel mono `text-[11px]` (subtiele tweede regel)
- Verwijder-knop subtiel tot hover (opacity-60 → opacity-100), `text-[11px]`

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

Expected: geen errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/doc-list.tsx
git commit -m "refresh(V0): doc-list typografie + subtiele delete affordance

Section-header uppercase tracking met count mono. Filename prominent,
stats mono secondary. Delete-knop opacity-60 tot hover."
```

---

## Task 9: Visual refresh — version-switcher.tsx

**Files:**
- Modify: `app/components/version-switcher.tsx`

- [ ] **Step 1: Lees huidige `app/components/version-switcher.tsx`**

Bevat VersionSwitcher (single component).

- [ ] **Step 2: Vervang `app/components/version-switcher.tsx` volledig**

```tsx
'use client';

import { useRouter } from 'next/navigation';

export type BotMeta = {
  version: string;
  label: string;
  description: string;
};

export function VersionSwitcher({
  current,
  bots,
}: {
  current: string;
  bots: BotMeta[];
}) {
  const router = useRouter();
  const currentBot = bots.find((b) => b.version === current);

  function onChange(version: string) {
    // Navigate to ?v=<version> — page is server-rendered so this fetches a
    // fresh render with the new bot's defaults (and resets the chat state via
    // the `key` prop on ChatBox in app/page.tsx).
    router.push(`/?v=${encodeURIComponent(version)}`);
  }

  return (
    <div className="flex flex-col gap-1 sm:items-end">
      <label className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        Bot
        <select
          value={current}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-mono text-xs text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {bots.map((b) => (
            <option key={b.version} value={b.version}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      {currentBot ? (
        <p className="max-w-xs text-right text-[10px] text-zinc-500 dark:text-zinc-400 sm:max-w-sm">
          {currentBot.description}
        </p>
      ) : null}
    </div>
  );
}
```

Wijzigingen:
- Label "Bot-versie" → korter "Bot" (uppercase tracking, paste compacter)
- Border `zinc-300` → `zinc-200` (consistent met andere kaarten)
- Select-tekst nu mono (visueel consistent met andere mono-elementen)
- Description: `text-[11px]` → `text-[10px]` (subtieler)

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run dev
```

Open `http://localhost:3000`. Expected: header heeft nu visueel consistente ThemeSwitch + Bot-dropdown met mono-versie-naam erin. Stop met Ctrl+C.

- [ ] **Step 4: Commit**

```bash
git add app/components/version-switcher.tsx
git commit -m "refresh(V0): version-switcher consistent met ThemeSwitch styling

Border zinc-200, select-tekst mono, label korter en uppercase tracking."
```

---

## Task 10: Playwright smoke test

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `tests/v0/theme-switch.spec.ts`

- [ ] **Step 1: Installeer Playwright als devDep**

```bash
npm install --save-dev @playwright/test
```

Expected: package.json krijgt `"@playwright/test": "^1.x"` in devDependencies. `npx playwright install chromium` is NIET nodig — we installeren de browser via existing install (hetzelfde pad).

```bash
npx playwright install chromium
```

Expected: bestaande chromium-1217 cache wordt hergebruikt of een tweede ophaling (~150 MB als nog niet aanwezig).

- [ ] **Step 2: Voeg `typecheck` + `test:e2e` scripts toe aan `package.json`**

In de `"scripts"` block, voeg toe (na de bestaande scripts):

```json
"typecheck": "tsc --noEmit",
"test:e2e": "playwright test"
```

Het hele `"scripts"` block wordt:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "typecheck": "tsc --noEmit",
  "test:e2e": "playwright test",
  "check-env": "node --env-file=.env.local scripts/check-env.mjs",
  "verify-schema": "node --env-file=.env.local scripts/verify-schema.mjs",
  "v0:ingest": "node --env-file=.env.local scripts/v0-ingest.mjs",
  "v0:chat": "node --env-file=.env.local scripts/v0-chat.mjs",
  "v0:list": "node --env-file=.env.local scripts/v0-list-docs.mjs",
  "v0:reset": "node --env-file=.env.local scripts/v0-reset.mjs",
  "v0:tune": "node --env-file=.env.local scripts/v0-tune-threshold.mjs"
}
```

- [ ] **Step 3: Schrijf `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

- [ ] **Step 4: Maak tests-directory en schrijf failing test**

```bash
mkdir -p tests/v0
```

Schrijf `tests/v0/theme-switch.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('V0 theme switch', () => {
  test.beforeEach(async ({ context }) => {
    // Schone localStorage per test
    await context.clearCookies();
  });

  test('toggle switches html class and persists across reload', async ({ page }) => {
    await page.goto('/');

    // Wacht tot ThemeSwitch zichtbaar is
    const switchGroup = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(switchGroup).toBeVisible();

    // Klik Dark
    await switchGroup.getByRole('radio', { name: 'Dark mode' }).click();

    // Verify <html> heeft class="dark" en data-theme="dark"
    const html = page.locator('html');
    await expect(html).toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Reload — verify dark mode behoudt
    await page.reload();
    await expect(html).toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // Klik Light
    await switchGroup.getByRole('radio', { name: 'Light mode' }).click();
    await expect(html).not.toHaveClass(/(?:^| )dark(?: |$)/);
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('no FOUC on hard reload — initial paint matches stored choice', async ({ page }) => {
    // Stel dark in via een eerste bezoek
    await page.goto('/');
    await page.getByRole('radio', { name: 'Dark mode' }).click();

    // Hard-reload met cache-bust en check dat <html> al class='dark' heeft
    // VOORDAT React hydrateert. We doen dit door de class direct na navigatie te checken.
    await page.goto('/', { waitUntil: 'commit' });

    // 'commit' betekent: navigatie is begonnen maar DOM nog niet volledig geladen.
    // Het inline FOUC-script is op dit moment al gedraaid (synchroon in <head>).
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain('dark');
  });

  test('system mode follows prefers-color-scheme', async ({ browser }) => {
    // Maak een context met dark color-scheme preference
    const darkContext = await browser.newContext({ colorScheme: 'dark' });
    const darkPage = await darkContext.newPage();
    await darkPage.goto('/');
    // Default = system, dus <html> moet class='dark' hebben
    await expect(darkPage.locator('html')).toHaveClass(/(?:^| )dark(?: |$)/);
    await darkContext.close();

    const lightContext = await browser.newContext({ colorScheme: 'light' });
    const lightPage = await lightContext.newPage();
    await lightPage.goto('/');
    await expect(lightPage.locator('html')).not.toHaveClass(/(?:^| )dark(?: |$)/);
    await lightContext.close();
  });
});
```

- [ ] **Step 5: Run de tests**

```bash
npm run test:e2e
```

Expected: alle 3 tests slagen. De webServer draait `npm run dev` automatisch en sluit na de run.

Als een test faalt: lees de Playwright trace (`playwright-report/`), fix het probleem in de relevante component-code, en re-run. Een trace-failure betekent typisch óf: theme-switch niet correct gewired, óf FOUC-script niet vóór hydration.

- [ ] **Step 6: Voeg Playwright artifacts toe aan .gitignore**

Append aan `.gitignore`:

```
# playwright
/test-results/
/playwright-report/
/playwright/.cache/
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/v0/theme-switch.spec.ts .gitignore
git commit -m "test(V0): playwright smoke test voor theme-switch

3 testcases: toggle persist, geen FOUC, system-mode volgt OS.
@playwright/test als devDep, npm run test:e2e wrapper-script."
```

---

## Task 11: Final typecheck + visual review

**Files:** geen wijzigingen (alleen verificatie)

- [ ] **Step 1: Volledige typecheck**

```bash
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 2: Volledige build**

```bash
npm run build
```

Expected: build slaagt zonder warnings van betekenis. Bekijk de output voor unused imports, missing types, of Tailwind-compile-errors.

- [ ] **Step 3: Lint**

```bash
npm run lint
```

Expected: zero errors.

- [ ] **Step 4: Manual visual smoke test**

```bash
npm run dev
```

Loop door deze checklist:

- [ ] Header heeft ThemeSwitch + VersionSwitcher naast elkaar
- [ ] Klik Light/Dark/System — UI flipt direct
- [ ] Hard-reload op `/` — geen flash naar verkeerde mode (FOUC test)
- [ ] Stel een vraag — PhaseIndicator zichtbaar, AnswerPanel met border-left accent (zwart light / emerald dark)
- [ ] Sources-lijst heeft emerald border-left voor hits, zinc voor misses
- [ ] Multi-turn: stel tweede vraag — HistoryPanel toont vorige turn met border-left + uppercase rol-label
- [ ] Reset gesprek — knop wist history
- [ ] Upload een doc (`.txt` of `.md`) — IngestForm Status-melding heeft border-left (rood/emerald)
- [ ] DocList rij — filename prominent, stats mono, delete-knop subtiel tot hover
- [ ] Switch versie via dropdown — page herlaadt met andere bot, theme blijft

- [ ] **Step 5: Rapporteer naar gebruiker**

Schrijf een korte samenvatting wat is geïmplementeerd, welke commits zijn gemaakt, en stel voor de feature te testen door de dev-server te runnen. Vraag of er visuele drift gezien wordt die nog gepolijst moet.

---

## Self-Review Checklist (post-write)

- [x] Spec coverage: alle componenten uit spec hebben een task (chat-box, ingest-form, doc-list, version-switcher, layout, page, theme-switch, useTheme, tailwind/CSS, tests)
- [x] Geen placeholders / TBD / "fill in later"
- [x] Type consistency: `ThemeChoice`, `ResolvedTheme`, hook return-shape consistent over Tasks 2/4
- [x] Status-borders: pattern is uniform door alle componenten (`border-l-2 border-l-{color}`)
- [x] Geen verborgen aannames: package versions, Tailwind v4 config, no-existing-tests setup zijn allemaal expliciet vermeld
- [x] Tasks zijn onafhankelijk genoeg om los te committen
- [x] Tests zijn NA implementatie (Task 10) i.p.v. TDD-stijl voor elke component — pragmatische keus voor visuele refactor (gemotiveerd in plan-text)

---

## Execution Handoff

Plan compleet en gecommit naar `docs/superpowers/plans/2026-05-09-v0-ui-refresh.md`. Twee execution-opties:

**1. Subagent-Driven (recommended)** — ik dispatch een verse subagent per task, jij reviewt tussen tasks, snelle iteratie zonder dat de hoofd-context volloopt. Skill: `superpowers:subagent-driven-development`.

**2. Inline Execution** — ik voer alle tasks uit in deze sessie met `superpowers:executing-plans`, batch-execution met checkpoints voor review.

**Welke aanpak wil je?**
