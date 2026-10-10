// Rekenhulp (ROI) — pure rekenlogica, gedeeld door server-render (startwaarden in de HTML)
// en de client-component. Formule letterlijk uit mockup-final ("Rekenhulp met verende cijfers").
// Bedragen/limieten komen uit lib/site/pricing.ts — nooit hardcoden.

import { TIERS, type Tier } from '@/lib/site/pricing';

/** Gemiddeld aantal weken per maand (52 / 12). */
export const WEEKS_PER_MONTH = 4.33;

export interface RoiInput {
  /** Klantvragen per week. */
  questionsPerWeek: number;
  /** Minuten per vraag. */
  minutesPerQuestion: number;
  /** Uurkosten medewerker in euro's. */
  hourlyRate: number;
  /** Deel dat ChatManta zelf afhandelt, in procenten (20-80). */
  sharePct: number;
}

/** Startwaarden + schuifbereiken (mockup + COPY.md §9). */
export const ROI_FIELDS = {
  questionsPerWeek: { min: 5, max: 500, step: 5, initial: 40 },
  minutesPerQuestion: { min: 1, max: 15, step: 1, initial: 4 },
  hourlyRate: { min: 20, max: 60, step: 1, initial: 30 },
  sharePct: { min: 20, max: 80, step: 5, initial: 50 },
} as const satisfies Record<keyof RoiInput, { min: number; max: number; step: number; initial: number }>;

export const ROI_DEFAULTS: RoiInput = {
  questionsPerWeek: ROI_FIELDS.questionsPerWeek.initial,
  minutesPerQuestion: ROI_FIELDS.minutesPerQuestion.initial,
  hourlyRate: ROI_FIELDS.hourlyRate.initial,
  sharePct: ROI_FIELDS.sharePct.initial,
};

export interface RoiResult {
  /** Bespaarde uren per maand (onafgerond). */
  savedHours: number;
  /** Besparing per maand in euro's (onafgerond). */
  savedEuro: number;
  /** Besparing min. maandprijs van het geadviseerde pakket (jaarlijks, intro). */
  netEuro: number;
  /** Geadviseerd pakket op basis van vragen per maand. */
  tier: Tier;
  /** Maandprijs van dat pakket (jaarlijks gefactureerd, introductieprijs). */
  tierPrice: number;
}

/** Kleinste pakket waarvan de maandlimiet het aantal vragen dekt; anders het grootste. */
export function adviseTier(questionsPerMonth: number): Tier {
  const sorted = [...TIERS].sort((a, b) => a.limits.questionsPerMonth - b.limits.questionsPerMonth);
  return sorted.find((t) => questionsPerMonth <= t.limits.questionsPerMonth) ?? sorted[sorted.length - 1];
}

export function computeRoi(input: RoiInput): RoiResult {
  const hours = ((input.questionsPerWeek * input.minutesPerQuestion) / 60) * WEEKS_PER_MONTH;
  const savedHours = (hours * input.sharePct) / 100;
  const savedEuro = savedHours * input.hourlyRate;
  const tier = adviseTier(input.questionsPerWeek * WEEKS_PER_MONTH);
  const tierPrice = tier.intro.yearly;
  return { savedHours, savedEuro, netEuro: savedEuro - tierPrice, tier, tierPrice };
}

const fmtN = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const round10 = (v: number) => Math.round(v / 10) * 10;

/** "±6 uur" */
export function formatHours(v: number): string {
  return `±${fmtN.format(Math.round(v))} uur`;
}

/** "±€170" (op tientallen) */
export function formatSaved(v: number): string {
  return `±€${fmtN.format(round10(v))}`;
}

/** "±€140", of "−€20" bij een negatieve uitkomst (op tientallen). */
export function formatNet(v: number): string {
  const r = round10(v);
  return `${r < 0 ? '−€' : '±€'}${fmtN.format(Math.abs(r))}`;
}

/** "Start (€29 p/m)" */
export function formatAdvice(tier: Tier, price: number): string {
  return `${tier.name} (€${fmtN.format(price)} p/m)`;
}
