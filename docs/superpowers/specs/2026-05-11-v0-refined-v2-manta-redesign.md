# V0 Refined v2 "Manta" — full visual redesign

**Status:** Spec. Supersedes the *visual* parts of `2026-05-11-v0-abyss-refined-style-toggle-design.md`.
**Owner:** Sebastiaan (`@Zoutig`).
**Scope flag:** V0 only — does NOT touch the production widget or V1 surfaces.

## 1. Why a v2

Refined v1 (current `cc1a1f3`) only shifts CSS-tokens: tighter borders, no gradient bg, slightly bolder accent, wider tracking. The visual delta versus Classic is mostly limited to color and one removed gradient. End-user verdict: "ik zie alleen kleurverschil" — Refined doesn't feel like a different mode.

v2 reframes Refined as a **distinct visual identity** ("Manta") rather than a tuned Classic. It introduces a new component vocabulary (cinematic glass surfaces, pill buttons, gradient-glow blobs as background) while keeping the toggle, hook, storage, and component file structure from v1 untouched.

## 2. The identity — "Manta"

A coherent ChatManta-branded look that reads as *manta ray in deep ocean*. Two coordinated palettes:

- **Dark — Bioluminescent Abyss**: deep navy-black base, large soft glow-blobs in cyan + abyssal blue + a single jellyfish-pink accent for warm tension. Reads as deep ocean with bioluminescence.
- **Light — Reef Pop**: vibrant aqua / teal / mint glow-blobs on a saturated light-cyan base. Reads as coral reef viewed from above. **No warm tones** in light — fully cool palette to keep brand identity ocean-pure.

Both modes use the same component language (cinematic glass, pill buttons, gradient AI-avatar). The mode toggle remains user choice — Refined is not theme-locked.

## 3. Design tokens

CSS custom properties added under `html[data-style="refined"]` scopes, both dark and light variants.

### 3.1 Dark — Bioluminescent Abyss

```
--bg-base:       #02050d
--glow-1-color:  rgba(8,145,178,0.55)      cyan-glow, top-left
--glow-2-color:  rgba(244,114,182,0.32)    jellyfish-pink, bottom-right
--glow-3-color:  rgba(34,211,238,0.30)     bright cyan, top-center
--fg:            #e8f4ff
--fg-muted:      rgba(180,220,255,0.55)
--accent:        #5fe1f0
--accent-2:      #f0abfc                   (used only in avatar gradient)
--glass-tint:    rgba(180,220,255,0.06)    AI bubble / sidebar
--glass-tint-2:  rgba(255,255,255,0.12)    user bubble / topbar
--glass-blur:    blur(40px) saturate(1.6)
--glass-border:  rgba(180,220,255,0.16)
--shadow-soft:   0 8px 32px rgba(0,0,0,0.35)
--r-bubble:      18px
--r-anchor:      4px                       (small radius on bubble's owner-side corner)
--r-pill:        999px
```

### 3.2 Light — Reef Pop (with frosted glass)

```
--bg-base:       #a7f3d0
--glow-1-color:  rgba(34,211,238,0.85)     vibrant cyan, top-left
--glow-2-color:  rgba(20,184,166,0.80)     teal, bottom-right
--glow-3-color:  rgba(95,225,240,0.70)     aqua, top-center
--glow-4-color:  rgba(167,243,208,0.45)    mint, center
--fg:            #042f2e
--fg-muted:      rgba(4,47,46,0.55)
--accent:        #0e7c9a
--accent-2:      #0f766e
--glass-tint:    rgba(255,255,255,0.30)    AI bubble
--glass-tint-2:  rgba(255,255,255,0.55)    user bubble / topbar / sidebar / composer
--glass-blur:    blur(24px) saturate(1.4)
--glass-blur-strong: blur(28px) saturate(1.4)   (topbar, composer)
--glass-border:  rgba(255,255,255,0.55)
--shadow-soft:   0 8px 28px rgba(8,90,90,0.18)
--r-bubble:      18px
--r-anchor:      4px
--r-pill:        999px
```

> The light base was bumped from pastel (`#cffafe`) to mint-cyan (`#a7f3d0`) because frosted glass over near-white is invisible. The trade-off is a more saturated baseline; this was accepted in brainstorm.

## 4. Surface treatment

### 4.1 Body background — static gradient blobs

`body::before` (or `body` direct background, whichever conflicts least with existing rules) renders 3-4 `radial-gradient()` blobs at fixed positions, layered over `--bg-base`. **Static, no ambient animation** — performance + visual calm.

### 4.2 Surfaces using frosted glass

- `.topbar`
- `.sidebar`
- `.composer`
- `.msg-user-bubble` (existing class)
- `.msg-ai-bubble` (new class — see §6.1)
- Primary buttons (`.btn-primary` selector or button styling — see §5)

All apply: `background: var(--glass-tint)` (or `--glass-tint-2` for high-emphasis surfaces) + `backdrop-filter: var(--glass-blur)` + `border: 1px solid var(--glass-border)`.

### 4.3 Non-glass surfaces

- Sidebar icon-buttons in inactive state — solid (just opacity-faded fg, no panel)
- Form-controls inside Settings tab (sliders, radios, selects, inputs) — keep current shadcn-look. Only container styling changes. See §10.

## 5. Buttons

Two variants. **Pill-shaped both** (`border-radius: var(--r-pill)`).

### 5.1 Primary

- **Dark**: `background: rgba(255,255,255,0.18)` + `backdrop-filter: var(--glass-blur)` + `border: 1px solid rgba(180,220,255,0.28)` + `color: #fff`.
- **Light**: linear-gradient teal `(135deg, #0e7c9a, #0f766e)` + no border + `color: #fff` + `box-shadow: 0 4px 16px rgba(14,124,154,0.35)`.

Hover: `filter: brightness(1.06)` + transform `translateY(-1px)`, 180ms cubic-bezier.

### 5.2 Ghost

- Both modes: `background: transparent` + thin accent-tinted border + accent-colored text.
- Dark border: `rgba(180,220,255,0.18)` text `#b8d4e8`.
- Light border: `rgba(14,124,154,0.28)` text `#0e7c9a`.

Hover: border-color brighten, bg fill to `rgba(accent, 0.06)`.

### 5.3 Implementation note on existing buttons

Current V0 uses some `<button>` elements with inline `composer-send`, `composer-tool`, etc. classes — no `.btn-primary`/`.btn-ghost` design system. Two options:

- **Selector-by-selector** (chosen for v2): override each existing button class under `html[data-style="refined"]` to apply the pill+glass treatment. Less invasive, no component-API change.
- Component-API change: defer to a later round if button reuse grows.

## 6. Components

### 6.1 Message bubbles

Currently `.msg-user-bubble` exists as a CSS class but AI messages don't have a dedicated bubble class — they render inside `.msg-body` without a wrapper. **v2 introduces `.msg-ai-bubble`** as a wrapper class around the AI message body, applied only when a bubble visual is desired. Refined CSS targets it; Classic ignores it (falls back to current borderless rendering).

- User bubble: `--glass-tint-2`, blur, asymmetric radius (`18px 18px 4px 18px`), white text in dark, dark text in light.
- AI bubble: `--glass-tint`, blur, asymmetric radius (`18px 18px 18px 4px`), accent-colored or fg text.

### 6.2 AI avatar (`.msg-avatar`)

Replace any Classic glow filter with a `background: radial-gradient(circle at 30% 30%, …)`:
- Dark: `#f0abfc` → `#5fe1f0` (50%) → `#0c4a6e`. Shadow `0 0 14px rgba(244,114,182,0.45)`.
- Light: `#5fe1f0` → `#0e7c9a` (60%) → `#042f2e`. Shadow `0 0 14px rgba(14,124,154,0.40)`.

Subtle `transform: scale(…)` pulse animation while AI is generating (`prefers-reduced-motion: respect` — pulse disabled when set).

### 6.3 Brand mark (`.brand-mark`)

**Logo asset stays. `<Image src="/logo/mark.png">` is preserved.** Only the container styling changes:
- Dark: optional `filter: drop-shadow(0 0 12px rgba(244,114,182,0.4))` for a subtle bioluminescent glow.
- Light: container `background: var(--glass-tint-2)` + blur + small padding, so the logo sits on a frosted-tile inside the sidebar.

### 6.4 Composer

Glass surface. Border accent on `:focus-within`. Existing `.composer-actions`, `.composer-hint`, `.composer-send` keep their behavior — Refined just re-themes them via class-targeted CSS (no component change).

### 6.5 Topbar

Glass surface, accent-dot before title gets a glow-shadow in both modes (`box-shadow: 0 0 6px var(--accent)`).

### 6.6 Sidebar

Glass surface in light, very subtle tint in dark (mostly transparent so the body-gradient shows through). Active nav-item gets a `glass-tint-2` panel with accent-colored icon. Inactive items are opacity-faded fg.

## 7. Typography

**No font change.** Keep Inter (already in stack via `--font-inter`). Personality comes from:
- Meta-labels (timestamps, "tijd · auteur", brand-tag) → `letter-spacing: 0.14em`, `text-transform: uppercase`, `opacity: 0.5–0.55`, `font-size: 10px`.
- Body line-height `1.5–1.7` in `.msg-body`.
- Body font-size in `.msg-body` bumped to `14.5px` (carried over from v1).
- No headline font change for V0.

## 8. Spacing & rhythm

- `.conversation-inner` gap between turns: **48–56px** (carried from v1).
- Bubble padding: `10px 14px`.
- Composer padding: `10px 14px`, rounded 14px container.

## 9. Motion

- Hover/focus transitions on buttons + interactive surfaces: 180ms cubic-bezier(0.4, 0, 0.2, 1).
- AI-avatar scale-pulse during streaming/generating. Respect `prefers-reduced-motion`.
- **No** ambient blob-motion in v2 — out of scope, perf risk, mood-disruptive.

## 10. Scope

### Affected V0 surfaces
- Chat shell (composer, conversation, message bubbles, AI avatar, topbar).
- Sidebar + brand mark.
- All right-panel tabs (Bronnen, Claims, Evals, Latency, Docs, Settings, Embed) — they inherit body+token-level styling automatically through scoped CSS.

### Explicitly NOT affected
- Form-controls inside Settings (sliders, radios, selects, inputs) — keep shadcn look. Only container/wrapper styling changes.
- Production widget (`/api/widget/*`) — stays Classic, this is V0-only.
- The `useStyleMode` hook, the boot-script in `app/layout.tsx`, the Settings-tab toggle — all unchanged from v1.

## 11. Implementation approach

Pure CSS extension. **No component refactors** beyond adding the `.msg-ai-bubble` wrapper class in `app/components/messages.tsx`.

- `app/globals.css` — expand the existing `html[data-style="refined"]` block:
  - Replace current dark + light token blocks with the new tokens in §3.
  - Add body background rule with the gradient blobs.
  - Add component-targeted rules for each surface in §4–6.
- `app/components/messages.tsx` — wrap the AI message body in an element with `className="msg-ai-bubble"`. Always present (mode-independent). Classic-mode CSS does not target this class so the visual stays unchanged in Classic.
- No new files. No new dependencies. No hook changes. No Settings UI changes.

## 12. Migration from v1

The old `html[data-style="refined"]` CSS (lines ~71–167 in `app/globals.css`) is **replaced**, not extended. v1 was 8 commits of partial work; v2 is the actual identity. All v1 token + selector rules under the `[data-style="refined"]` selector get rewritten. The Refined v1 commits stay in history but the CSS they introduced is overwritten in this PR.

## 13. Performance considerations

- `backdrop-filter` is rendered on every glass surface — ~5–7 surfaces visible at any time. Should be fine on modern browsers; flagged as the main perf risk.
- Multiple `radial-gradient()` on body — static, paint-only once per layout. Negligible.
- Mitigation: if perf issue observed on low-end devices, fall back via `@media (prefers-reduced-transparency: reduce)` to solid surfaces. Add only if perf actually regresses.

## 14. Accessibility

- Color contrast: validate all text-on-bubble and text-on-button combinations against WCAG AA (4.5:1 for body, 3:1 for large). Specifically check dark AI text on `rgba(180,220,255,0.06)` glass tint — may need to bump glass opacity if contrast fails.
- `prefers-reduced-motion` honored on AI-avatar pulse.
- `prefers-reduced-transparency` honored as perf+a11y fallback (see §13).
- Focus-visible rings preserved on all interactive elements (composer, buttons, toggle).

## 15. Test plan

- E2E spec `tests/v0/style-mode-toggle.spec.ts` already exists from v1. Extend with:
  - Visual assertion: when `data-style="refined"`, `body` background contains `radial-gradient`.
  - Visual assertion: bubbles have `backdrop-filter` set.
  - Light mode + Refined: bubble background is `rgba(255,255,255,0.55)` (or similar).
- Manual visual checks (5 minutes):
  - Toggle Classic ↔ Refined in dark, light, both directions.
  - Verify logo unchanged in sidebar.
  - Verify Settings tab form-controls still functional (shadcn look untouched).
  - Verify right-panel tabs render correctly.

## 16. Open questions (intentionally deferred)

None. All visual decisions made during brainstorm:
- Direction → Aurora/Glass → Cinematic flavor → ocean palette ✓
- Dark palette → Bioluminescent Abyss ✓
- Light palette → Reef Pop with frosted glass ✓
- Typography → keep Inter ✓
- Motion → no ambient animation ✓
- Light mode → separate variant (not theme-locked) ✓
- Logo → preserved ✓
