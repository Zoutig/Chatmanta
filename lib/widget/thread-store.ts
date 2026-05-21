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
  if (!clean) return 'Nieuw gesprek';
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
      // Corrupt JSON of localStorage-fail — behandel als leeg, log voor diagnose.
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
      title: deriveTitle(patch.messages),
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
