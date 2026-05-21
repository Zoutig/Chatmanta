'use client';

// Instellingen-card: drempel + lijst-grootte voor "Meest gestelde vragen".
//
// Twee number-inputs (minCount, topN) + save-knop. Patroon volgt SettingsForm
// (useState + useTransition + "Opgeslagen ✓"-flash). Validatie is best-effort
// client-side; saveTopQuestionsConfig in de server-action checkt nogmaals en
// gooit AppError('INPUT_INVALID') bij overschrijding.

import { useState, useTransition } from 'react';
import { Check, Save } from 'lucide-react';
import { saveTopQuestionsAction } from '../../actions';
import {
  TOP_QUESTIONS_LIMITS,
  type TopQuestionsConfig,
} from '@/lib/v0/klantendashboard/types';

export function TopQuestionsConfigCard({ initial }: { initial: TopQuestionsConfig }) {
  const [s, setS] = useState<TopQuestionsConfig>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const minCountValid =
    Number.isFinite(s.minCount) &&
    s.minCount >= TOP_QUESTIONS_LIMITS.minCountMin &&
    s.minCount <= TOP_QUESTIONS_LIMITS.minCountMax;
  const topNValid =
    Number.isFinite(s.topN) &&
    s.topN >= TOP_QUESTIONS_LIMITS.topNMin &&
    s.topN <= TOP_QUESTIONS_LIMITS.topNMax;
  const canSave = minCountValid && topNValid && !pending;

  function save() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await saveTopQuestionsAction(s);
      if (res.ok) {
        setS(res.topQuestions);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="klant-card"
      style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif',
            color: 'var(--klant-fg)',
          }}
        >
          Meest gestelde vragen
        </h3>
        <p className="klant-section-help" style={{ margin: '4px 0 0' }}>
          Bepaal vanaf hoe vaak een vraag in de Top-lijst verschijnt en hoeveel
          vragen je maximaal wilt zien.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label className="klant-label">Toon vragen vanaf X keer gesteld</label>
          <input
            className="klant-input"
            type="number"
            min={TOP_QUESTIONS_LIMITS.minCountMin}
            max={TOP_QUESTIONS_LIMITS.minCountMax}
            step={1}
            value={s.minCount}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setS((prev) => ({ ...prev, minCount: Number.isFinite(n) ? n : prev.minCount }));
              setSaved(false);
              setError(null);
            }}
            aria-invalid={!minCountValid}
          />
          <p className="klant-section-help" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {TOP_QUESTIONS_LIMITS.minCountMin} t/m {TOP_QUESTIONS_LIMITS.minCountMax}
          </p>
        </div>

        <div>
          <label className="klant-label">Maximum aantal in lijst</label>
          <input
            className="klant-input"
            type="number"
            min={TOP_QUESTIONS_LIMITS.topNMin}
            max={TOP_QUESTIONS_LIMITS.topNMax}
            step={1}
            value={s.topN}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setS((prev) => ({ ...prev, topN: Number.isFinite(n) ? n : prev.topN }));
              setSaved(false);
              setError(null);
            }}
            aria-invalid={!topNValid}
          />
          <p className="klant-section-help" style={{ margin: '4px 0 0', fontSize: 12 }}>
            {TOP_QUESTIONS_LIMITS.topNMin} t/m {TOP_QUESTIONS_LIMITS.topNMax}
          </p>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--klant-r-sm)',
            background: 'var(--klant-danger-soft)',
            color: 'var(--klant-danger)',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
        {saved && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--klant-success)',
              fontSize: 13,
            }}
          >
            <Check size={14} strokeWidth={2} /> Opgeslagen
          </span>
        )}
        <button
          type="submit"
          className="klant-btn"
          data-variant="primary"
          disabled={!canSave}
        >
          <Save size={13} strokeWidth={2} /> {pending ? 'Bezig…' : 'Opslaan'}
        </button>
      </div>
    </form>
  );
}
