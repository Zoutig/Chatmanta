// Gedeelde maand-ledger voor Anthropic-uitgaven (plan 016 §7). Eén JSONL-bestand buiten de
// worktrees, zodat élke eval-sessie (ook parallelle) dezelfde teller ziet. Remmen:
//   1. assertRunAllowed — vóór een run: maanduitgave + raming ≤ maandplafond
//   2. RunBudget        — tijdens een run: harde cap; overschrijding = stoppen
// De Console-limiet op de workspace blijft het échte vangnet (ook voor ad-hoc-scripts).

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_MONTH_CAP_USD = 90;

export function ledgerPath(): string {
  return process.env.CHATMANTA_LEDGER_PATH ?? join(homedir(), '.chatmanta', 'anthropic-ledger.jsonl');
}

export type LedgerEntry = {
  ts: string;
  runId: string;
  purpose: string;
  model: string;
  usd: number;
  calls: number;
  batch: boolean;
};

export function appendLedger(entry: Omit<LedgerEntry, 'ts'>): void {
  const p = ledgerPath();
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
}

/** Uitgave in de lopende kalendermaand (UTC). Kapotte regels tellen niet en worden gemeld. */
export function monthSpendUsd(now = new Date()): number {
  const p = ledgerPath();
  if (!existsSync(p)) return 0;
  const month = now.toISOString().slice(0, 7);
  let sum = 0;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as LedgerEntry;
      if (e.ts.startsWith(month)) sum += e.usd;
    } catch {
      console.warn(`[ledger] onleesbare regel overgeslagen in ${p}`);
    }
  }
  return sum;
}

export function assertRunAllowed(opts: { estimateUsd: number; monthCapUsd?: number }): void {
  const cap = opts.monthCapUsd ?? DEFAULT_MONTH_CAP_USD;
  const spent = monthSpendUsd();
  if (spent + opts.estimateUsd > cap) {
    throw new Error(
      `Budget: deze maand al $${spent.toFixed(2)} + raming $${opts.estimateUsd.toFixed(2)} > plafond $${cap}. Run gestopt.`,
    );
  }
}

/** Telt tijdens een run mee en schrijft per call naar de ledger. Boven de cap → throw. */
export class RunBudget {
  spentUsd = 0;
  calls = 0;
  constructor(
    readonly runId: string,
    readonly purpose: string,
    readonly capUsd: number,
  ) {}

  record(model: string, usd: number, batch: boolean): void {
    this.spentUsd += usd;
    this.calls += 1;
    appendLedger({ runId: this.runId, purpose: this.purpose, model, usd, calls: 1, batch });
    if (this.spentUsd > this.capUsd) {
      throw new BudgetExceededError(
        `Run-cap overschreden: $${this.spentUsd.toFixed(2)} > $${this.capUsd} (run ${this.runId})`,
      );
    }
  }
}

export class BudgetExceededError extends Error {}
