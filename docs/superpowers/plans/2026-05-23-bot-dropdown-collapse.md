# Bot-dropdown collapse implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maak het bot-versie-dropdown compacter door alleen de 3 nieuwste versies standaard te tonen, met een footer-toggle voor de oudere.

**Architecture:** Pure client-side wijziging in `app/components/bot-dropdown.tsx`. Geen prop-API-wijziging — de bestaande `bots: BotMeta[]` blijft staan (oldest-first geleverd door `BOT_VERSIONS_ORDERED`). Het component reverset intern naar newest-first en splitst in twee secties. Eén nieuwe CSS-class in `app/globals.css` voor de toggle-rij.

**Tech Stack:** Next.js 16.2 App Router + React 19.2 client component, Tailwind v4 + plain CSS in `globals.css`, bestaand `<Icon name="caret" />` voor de chevron.

**Spec:** `docs/superpowers/specs/2026-05-23-bot-dropdown-collapse-design.md`

---

### Task 1: Voeg CSS toe voor de toggle-rij

**Files:**
- Modify: `app/globals.css` — voeg `.bot-dropdown-toggle` toe na regel 2128 (`.bot-dropdown-desc`), dus aan het eind van de `.bot-dropdown*`-cluster

- [ ] **Step 1: Append CSS na `.bot-dropdown-desc`**

Voeg deze regels toe direct na de bestaande `.bot-dropdown-desc` regel (de regel die eindigt met `line-height: 1.45; }`):

```css
.bot-dropdown-divider {
  height: 1px;
  background: var(--border);
  margin: 6px 4px;
}
.bot-dropdown-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-dim);
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}
.bot-dropdown-toggle:hover {
  background: var(--surface-2);
  color: var(--fg);
}
.bot-dropdown-toggle:focus { outline: none; }
.bot-dropdown-toggle:focus-visible {
  background: var(--surface-2);
  color: var(--fg);
}
.bot-dropdown-toggle .caret-icon { transition: transform 0.18s ease; }
.bot-dropdown-toggle[data-expanded="true"] .caret-icon { transform: rotate(180deg); }
```

- [ ] **Step 2: Sanity check**

Run: `git diff app/globals.css`

Expected: één hunk, alleen toevoegingen onder `.bot-dropdown-desc`. Geen wijzigingen aan bestaande selectors (Tailwind v4 quirk geldt voor wijzigingen aan bestaande selectors, niet voor nieuwe toevoegingen).

---

### Task 2: Refactor `bot-dropdown.tsx` naar sections + collapse + newest-first

**Files:**
- Modify: `app/components/bot-dropdown.tsx` (volledige file rewrite — 86 regels nu)

- [ ] **Step 1: Vervang volledige inhoud van `app/components/bot-dropdown.tsx`**

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from './svg-icons';

export type BotMeta = {
  version: string;
  label: string;
  description: string;
  chatModel: string;
};

const RECENT_COUNT = 3;

export function BotDropdown({
  current,
  bots,
}: {
  current: string;
  bots: BotMeta[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const currentBot = bots.find((b) => b.version === current);

  // bots arriveert oldest-first uit BOT_VERSIONS_ORDERED. We tonen newest-first
  // (laatste = nieuwste). De "recente" sectie = laatste RECENT_COUNT,
  // ge-reverset zodat de nieuwste bovenaan staat. "Oudere" sectie = de rest,
  // ook newest-first.
  const { recent, older } = useMemo(() => {
    if (bots.length <= RECENT_COUNT) {
      return { recent: [...bots].reverse(), older: [] as BotMeta[] };
    }
    const cut = bots.length - RECENT_COUNT;
    return {
      recent: bots.slice(cut).reverse(),
      older: bots.slice(0, cut).reverse(),
    };
  }, [bots]);

  const currentIsOlder = useMemo(
    () => older.some((b) => b.version === current),
    [older, current],
  );

  // showOlder reset elke keer dat het paneel opengaat. Initial state hangt af
  // van de actieve versie: zit die in de oudere bucket, dan starten we open
  // zodat de gebruiker z'n eigen actieve regel ziet.
  const [showOlder, setShowOlder] = useState(currentIsOlder);
  useEffect(() => {
    if (open) setShowOlder(currentIsOlder);
  }, [open, currentIsOlder]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(version: string) {
    setOpen(false);
    if (version !== current) {
      router.push(`/?v=${encodeURIComponent(version)}`);
    }
  }

  function renderItem(b: BotMeta) {
    const active = b.version === current;
    return (
      <div
        key={b.version}
        role="menuitem"
        tabIndex={0}
        className={`bot-dropdown-item${active ? ' active' : ''}`}
        onClick={() => pick(b.version)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pick(b.version);
          }
        }}
      >
        <div className="bot-dropdown-row">
          <span className="bot-dropdown-version">{b.label}</span>
          <span className="bot-dropdown-model">{b.chatModel}</span>
          {active ? <Icon name="check" size={12} /> : null}
        </div>
        <div className="bot-dropdown-desc">{b.description}</div>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="bot-pill"
        onClick={() => setOpen(!open)}
        title="Wissel bot-versie"
      >
        <span style={{ fontWeight: 600 }}>{current.toUpperCase()}</span>
        <span style={{ color: 'var(--fg-dim)' }}>{currentBot?.chatModel}</span>
        <Icon name="caret" size={11} />
      </button>
      {open ? (
        <div className="bot-dropdown slide-in" role="menu">
          <div className="bot-dropdown-label">Bot-versie</div>
          {recent.map(renderItem)}
          {older.length > 0 ? (
            <>
              <div className="bot-dropdown-divider" />
              <button
                type="button"
                className="bot-dropdown-toggle"
                data-expanded={showOlder ? 'true' : 'false'}
                onClick={() => setShowOlder((v) => !v)}
                aria-expanded={showOlder}
              >
                <span>
                  {showOlder ? 'Verberg oudere versies' : `Toon oudere versies (${older.length})`}
                </span>
                <span className="caret-icon" aria-hidden>
                  <Icon name="caret" size={11} />
                </span>
              </button>
              {showOlder ? older.map(renderItem) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

Expected: geen fouten in `app/components/bot-dropdown.tsx`. Andere bestaande TS-fouten in het project (indien aanwezig) zijn buiten scope.

- [ ] **Step 3: Diff sanity check**

Run: `git diff --stat app/components/bot-dropdown.tsx app/globals.css`

Expected: twee files gewijzigd; bot-dropdown.tsx ~+50/-15 regels, globals.css ~+30/-0 regels.

---

### Task 3: Browser-verificatie + commit

**Files:** geen wijzigingen, alleen verificatie

- [ ] **Step 1: Start dev server**

Run: `npm run dev -- -p 3002`

Wacht tot Turbopack "Ready in" log toont. Port 3002 omdat 3000/3001 mogelijk in gebruik zijn door de hoofd-repo.

- [ ] **Step 2: Open /admintool en test gedrag**

Open `http://localhost:3002/admintool` in een browser.

Check:
- Klik op de bot-pill rechtsboven → dropdown opent
- Standaard zichtbaar: v0.6, v0.5, v0.4 (newest-first), met checkmark op v0.6
- Onderin: `▾ Toon oudere versies (3)` knop
- Klik op de knop → uitgeklapt: v0.3, v0.2, v0.1 verschijnt onder de divider; knoptekst muteert naar `▴ Verberg oudere versies` met geroteerde caret
- Klik opnieuw → inklappen werkt
- Klik buiten paneel → paneel sluit
- Heropen → opnieuw ingeklapt (geen persistentie)

- [ ] **Step 3: Test oudere-versie edge case**

Open `http://localhost:3002/admintool?v=v0.2`.

Check:
- Bot-pill toont "V0.2"
- Open dropdown → de oudere sectie is al uitgeklapt
- v0.2 heeft de checkmark + active-styling
- v0.6, v0.5, v0.4 zichtbaar in de recente sectie zonder checkmark

- [ ] **Step 4: Test theme switch**

Switch tussen light en dark theme (klein zonnetje/maan-icoon in topbar of via `/home` toggle).

Check:
- `.bot-dropdown-divider` zichtbaar maar subtiel in beide themes
- Toggle-knop hover/focus contrast is leesbaar in beide
- Caret-rotatie animatie soepel

- [ ] **Step 5: Stop dev server**

Ctrl+C in de terminal die `npm run dev` draait. Verifieer dat het Node-proces stopt:

Run (PowerShell): `Get-NetTCPConnection -LocalPort 3002 -EA SilentlyContinue`

Expected: lege output (poort vrij).

- [ ] **Step 6: Commit**

```bash
git add app/components/bot-dropdown.tsx app/globals.css
git commit -m "feat(admintool): compact bot-versie-dropdown met collapse + newest-first

- Toont standaard alleen de 3 nieuwste versies
- 'Toon oudere versies (N)' toggle in footer
- Newest-first ordering binnen elke sectie
- Auto-uitklap als ?v=<oude versie> actief is
- Geen persistente voorkeur — reset bij heropenen"
```

- [ ] **Step 7: Sanity: branch en push**

```bash
git rev-parse --abbrev-ref HEAD     # expected: feat/seb/bot-dropdown-collapse
git log --oneline -3                # expected: 2 commits op deze branch (spec + feat)
git push -u origin feat/seb/bot-dropdown-collapse
```

Pre-push hook moet pass — we pushen geen `main`.

---

## Self-review

**Spec coverage:**
- Default 3 nieuwste → Task 2 Step 1 (RECENT_COUNT, slice/reverse).
- Toggle-knop `Toon oudere versies (N)` → Task 2 Step 1 (`bot-dropdown-toggle` block).
- Newest-first binnen elke sectie → Task 2 Step 1 (`.reverse()` op beide slices).
- Reset bij sluiten/openen → Task 2 Step 1 (`useEffect` op `open`).
- Auto-uitklap bij `?v=v0.2` → Task 2 Step 1 (`currentIsOlder` initial + useEffect sync), geverifieerd in Task 3 Step 3.
- Toetsenbord support → Task 2 Step 1 (button-element + bestaand onKeyDown op items + `:focus-visible` CSS).
- Click-outside ongewijzigd → Task 2 Step 1 (bestaande `onDoc` listener behouden).
- Light/dark themes → Task 3 Step 4.
- `bots.length <= 3` edge case → Task 2 Step 1 (early return in useMemo, geen toggle gerenderd door `older.length > 0` guard).
- Currently-active in older bucket → bovenstaand.
- Lege array → `[].slice(0, 0)` en `[].reverse()` zijn beide veilig in JS; geen explicit branch nodig.

**Placeholder scan:** geen TBD / TODO / "add appropriate". Alle code-stappen tonen complete code.

**Type consistency:** `BotMeta` blijft identiek aan huidige; `bots: BotMeta[]` prop ongewijzigd; geen nieuwe types geïntroduceerd.

Geen issues gevonden — plan klaar voor uitvoering.
