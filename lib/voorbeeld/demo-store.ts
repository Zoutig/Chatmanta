// Demo-opslag voor /voorbeeld: alles wat een bezoeker in het voorbeeld-dashboard
// wijzigt, leeft ALLEEN in zijn eigen browser (localStorage). Geen server, geen
// gedeelde state tussen bezoekers. De voorbeeldwidget leest dezelfde instellingen,
// zodat een wijziging in het dashboard direct effect heeft op de widget.
//
// Pure client-module (wel SSR-veilig: elke localStorage-toegang zit achter een
// typeof-window-check + try/catch). Alleen `import type` uit settings-config: een
// waarde-import sleept server-code de client-bundel in.

import { useSyncExternalStore } from 'react';
import type { V1ContactRequest, V1ContactRequestStatus } from '@/lib/v1/dashboard/contact-requests';

// Defaults en constanten staan in een losse pure module, zodat server-code ze kan
// importeren zonder deze (client-hook-)module mee te trekken.
export { DEMO_DEFAULT_SETTINGS, DEMO_ORG_NAME, DEMO_SITE_PATH, type DemoSettings } from './demo-defaults';
import { DEMO_DEFAULT_SETTINGS, type DemoSettings } from './demo-defaults';

const SETTINGS_KEY = 'chatmanta-voorbeeld:settings';
const CONTACT_KEY = 'chatmanta-voorbeeld:contact';
const CONVO_KEY = 'chatmanta-voorbeeld:gesprekken';
const CHANGE_EVENT = 'chatmanta-voorbeeld:change';

// ---------------------------------------------------------------------------
// Laag 1: veilige localStorage-toegang + change-notificatie (ook tussen tabs)
// ---------------------------------------------------------------------------

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Vol of geblokkeerd: de demo werkt dan alleen voor deze pagina-sessie.
  }
  cache.clear();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith('chatmanta-voorbeeld:')) {
      cache.clear();
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

// useSyncExternalStore eist een stabiele snapshot: cache per key tot de volgende write.
const cache = new Map<string, unknown>();
function cached<T>(key: string, compute: () => T): T {
  if (!cache.has(key)) cache.set(key, compute());
  return cache.get(key) as T;
}

// ---------------------------------------------------------------------------
// Instellingen
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Stored patch over de demo-defaults, met een lichte type-check per veld. */
function mergeDemoSettings(raw: unknown): DemoSettings {
  const out: DemoSettings = { ...DEMO_DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const src = raw as Record<string, unknown>;
  const target = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(DEMO_DEFAULT_SETTINGS) as (keyof DemoSettings)[]) {
    const v = src[key];
    const def = DEMO_DEFAULT_SETTINGS[key];
    if (v === undefined) continue;
    if (key === 'accentColor') {
      if (typeof v === 'string' && HEX.test(v)) target[key] = v;
    } else if (key === 'customLogoDataUrl') {
      if (v === null || typeof v === 'string') target[key] = v;
    } else if (Array.isArray(def)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) target[key] = v;
    } else if (typeof v === typeof def) {
      target[key] = v;
    }
  }
  if (typeof src.showStarterQuestions === 'boolean') out.showStarterQuestions = src.showStarterQuestions;
  return out;
}

export function readDemoSettings(): DemoSettings {
  return cached(SETTINGS_KEY, () => mergeDemoSettings(readJson(SETTINGS_KEY)));
}

/** Schrijf een (deel)patch; levert het nieuwe complete object. */
export function writeDemoSettings(patch: Partial<DemoSettings>): DemoSettings {
  const next = mergeDemoSettings({ ...readDemoSettings(), ...patch });
  // Alleen de afwijkingen van de defaults bewaren: dan pakt een nieuwe demo-default
  // (na een deploy) vanzelf door bij bezoekers die alleen de kleur aanpasten.
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof DemoSettings)[]) {
    if (JSON.stringify(next[key]) !== JSON.stringify(DEMO_DEFAULT_SETTINGS[key])) diff[key] = next[key];
  }
  writeJson(SETTINGS_KEY, Object.keys(diff).length ? diff : null);
  return next;
}

export function useDemoSettings(): DemoSettings {
  return useSyncExternalStore(subscribe, readDemoSettings, () => DEMO_DEFAULT_SETTINGS);
}

/** True zodra de client-snapshot leesbaar is (na hydratie). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
function noopSubscribe() {
  return () => {};
}

// ---------------------------------------------------------------------------
// Contactverzoeken die de bezoeker zelf via de voorbeeldwidget indient
// ---------------------------------------------------------------------------

const EMPTY: never[] = [];

export function readDemoContactRequests(): V1ContactRequest[] {
  return cached(CONTACT_KEY, () => readJson<V1ContactRequest[]>(CONTACT_KEY) ?? EMPTY);
}

export function addDemoContactRequest(
  input: Omit<V1ContactRequest, 'id' | 'status' | 'notes' | 'createdAt'>,
): V1ContactRequest {
  const item: V1ContactRequest = {
    ...input,
    id: `demo-${crypto.randomUUID()}`,
    status: 'new',
    notes: null,
    createdAt: new Date().toISOString(),
  };
  writeJson(CONTACT_KEY, [item, ...readDemoContactRequests()].slice(0, 50));
  return item;
}

export function updateDemoContactRequest(
  id: string,
  patch: Partial<Pick<V1ContactRequest, 'status' | 'notes'>> & { status?: V1ContactRequestStatus },
): void {
  writeJson(
    CONTACT_KEY,
    readDemoContactRequests().map((r) => (r.id === id ? { ...r, ...patch } : r)),
  );
}

export function deleteDemoContactRequest(id: string): void {
  writeJson(
    CONTACT_KEY,
    readDemoContactRequests().filter((r) => r.id !== id),
  );
}

export function useDemoContactRequests(): V1ContactRequest[] {
  return useSyncExternalStore(subscribe, readDemoContactRequests, () => EMPTY);
}

// ---------------------------------------------------------------------------
// Gesprekken die de bezoeker zelf met de voorbeeldwidget voert
// ---------------------------------------------------------------------------

export type DemoTurn = {
  question: string;
  answer: string;
  /** 'answer' | 'fallback' | 'smalltalk' (engine-kind) */
  kind: string;
  sources: { title: string; url?: string; similarity: number }[];
  at: string;
};

export type DemoConversation = {
  id: string;
  startedAt: string;
  turns: DemoTurn[];
};

export function readDemoConversations(): DemoConversation[] {
  return cached(CONVO_KEY, () => readJson<DemoConversation[]>(CONVO_KEY) ?? EMPTY);
}

export function appendDemoTurn(threadId: string, turn: DemoTurn): void {
  const list = readDemoConversations();
  const existing = list.find((c) => c.id === threadId);
  const next = existing
    ? list.map((c) => (c.id === threadId ? { ...c, turns: [...c.turns, turn].slice(-30) } : c))
    : [{ id: threadId, startedAt: turn.at, turns: [turn] }, ...list];
  writeJson(CONVO_KEY, next.slice(0, 30));
}

export function useDemoConversations(): DemoConversation[] {
  return useSyncExternalStore(subscribe, readDemoConversations, () => EMPTY);
}

// ---------------------------------------------------------------------------
// Widgetstatus: aan/uit (Widget-scherm) + laatst gezien (de voorbeeldwebsite)
// ---------------------------------------------------------------------------

export type DemoWidgetState = { isActive: boolean; lastSeenAt: string | null; lastSeenOrigin: string | null };

const WIDGET_KEY = 'chatmanta-voorbeeld:widget';
const WIDGET_DEFAULT: DemoWidgetState = { isActive: true, lastSeenAt: null, lastSeenOrigin: null };

export function readDemoWidgetState(): DemoWidgetState {
  return cached(WIDGET_KEY, () => ({ ...WIDGET_DEFAULT, ...(readJson<Partial<DemoWidgetState>>(WIDGET_KEY) ?? {}) }));
}

export function writeDemoWidgetState(patch: Partial<DemoWidgetState>): DemoWidgetState {
  const next = { ...readDemoWidgetState(), ...patch };
  writeJson(WIDGET_KEY, next);
  return next;
}

export function useDemoWidgetState(): DemoWidgetState {
  return useSyncExternalStore(subscribe, readDemoWidgetState, () => WIDGET_DEFAULT);
}

/** Alles terug naar de begintoestand van de demo. */
export function resetDemo(): void {
  writeJson(WIDGET_KEY, null);
  writeJson(SETTINGS_KEY, null);
  writeJson(CONTACT_KEY, null);
  writeJson(CONVO_KEY, null);
}
