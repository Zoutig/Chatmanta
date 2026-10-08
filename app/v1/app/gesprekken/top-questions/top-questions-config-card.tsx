'use client';

// Instellingen van de ranglijst "Meest gestelde vragen": vanaf hoe vaak een vraag
// meetelt en hoeveel vragen je ziet. Eerst lezen, dan Wijzigen (zoals Chatbot en
// Account); opslaan bevestigt met een Toast, een fout staat bij het formulier.

import { useState } from 'react';
import { EditablePanel, useEditable, type SaveResult } from '@/app/v1/_ui/editable';
import { Field } from '@/app/v1/_ui/controls';
import { Rows, Row } from '@/app/v1/_ui/panel';
import { useToast } from '@/app/v1/_ui/toast';
import { saveTopQuestionsConfigAction } from '../top-questions-actions';
import { TOP_QUESTIONS_LIMITS as L, type TopQuestionsConfig } from '@/lib/v0/klantendashboard/types';

function inRange(n: number, min: number, max: number): boolean {
  return Number.isFinite(n) && n >= min && n <= max;
}

export function TopQuestionsConfigCard({ initial }: { initial: TopQuestionsConfig }) {
  const toast = useToast();
  const [current, setCurrent] = useState<TopQuestionsConfig>(initial);

  const edit = useEditable<TopQuestionsConfig>({
    current: () => current,
    save: async (draft): Promise<SaveResult> => {
      if (!inRange(draft.minCount, L.minCountMin, L.minCountMax)) {
        return { ok: false, error: `Kies een drempel van ${L.minCountMin} t/m ${L.minCountMax}.` };
      }
      if (!inRange(draft.topN, L.topNMin, L.topNMax)) {
        return { ok: false, error: `Kies een aantal van ${L.topNMin} t/m ${L.topNMax}.` };
      }
      const res = await saveTopQuestionsConfigAction(draft);
      if (!res.ok) return { ok: false, error: res.error };
      setCurrent(res.topQuestions);
      toast.success('Ranglijst opgeslagen');
      return { ok: true };
    },
  });

  function setNumber(key: keyof TopQuestionsConfig, raw: string) {
    const n = parseInt(raw, 10);
    edit.set(key, Number.isFinite(n) ? n : 0);
  }

  return (
    <EditablePanel
      id="ranglijst"
      title="Ranglijst"
      edit={edit}
      view={
        <Rows>
          <Row label="Telt mee vanaf">{current.minCount}× gesteld</Row>
          <Row label="Maximaal in de lijst">{current.topN} vragen</Row>
        </Rows>
      }
    >
      <Field label="Telt mee vanaf (aantal keer gesteld)" hint={`${L.minCountMin} t/m ${L.minCountMax}`}>
        {(id) => (
          <input
            id={id}
            className="v1-input v1-input--narrow"
            type="number"
            inputMode="numeric"
            min={L.minCountMin}
            max={L.minCountMax}
            step={1}
            value={edit.draft.minCount}
            onChange={(e) => setNumber('minCount', e.target.value)}
          />
        )}
      </Field>
      <Field label="Maximaal aantal vragen" hint={`${L.topNMin} t/m ${L.topNMax}`}>
        {(id) => (
          <input
            id={id}
            className="v1-input v1-input--narrow"
            type="number"
            inputMode="numeric"
            min={L.topNMin}
            max={L.topNMax}
            step={1}
            value={edit.draft.topN}
            onChange={(e) => setNumber('topN', e.target.value)}
          />
        )}
      </Field>
    </EditablePanel>
  );
}
