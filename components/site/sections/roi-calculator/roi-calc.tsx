'use client';

import { useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { ROUTES } from '@/lib/site/navigation';
import { Icon } from '../../ui/icon';
import { LinkButton } from '../../ui/button';
import {
  ROI_DEFAULTS,
  ROI_FIELDS,
  computeRoi,
  formatAdvice,
  formatHours,
  formatNet,
  formatSaved,
  type RoiInput,
} from './calc';

/** Mockup: verende cijfers met stiffness 120, damping 20. */
const SPRING = { stiffness: 120, damping: 20, restDelta: 0.05 };

/**
 * Getal dat naar zijn doelwaarde "veert". SSR + eerste render tonen meteen de eindtekst
 * (content-first); bij reduced motion springt hij direct.
 */
function SpringValue({ value, format }: { value: number; format: (v: number) => string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const source = useMotionValue(value);
  const spring = useSpring(source, SPRING);

  useEffect(() => spring.on('change', (v) => {
    if (ref.current) ref.current.textContent = format(v);
  }), [spring, format]);

  useEffect(() => {
    if (reduce) {
      source.jump(value);
      spring.jump(value);
      if (ref.current) ref.current.textContent = format(value);
    } else {
      source.set(value);
    }
  }, [value, reduce, source, spring, format]);

  return <span ref={ref}>{format(value)}</span>;
}

function Slider({
  id,
  label,
  tag,
  display,
  field,
  value,
  onChange,
}: {
  id: string;
  label: string;
  tag?: string;
  display: string;
  field: { min: number; max: number; step: number };
  value: number;
  onChange: (v: number) => void;
}) {
  const p = ((value - field.min) / (field.max - field.min)) * 100;
  return (
    <div className="field">
      <label htmlFor={id}>
        {tag ? (
          <span>
            {label} <span className="tag-a">{tag}</span>
          </span>
        ) : (
          label
        )}
        <output htmlFor={id}>{display}</output>
      </label>
      <input
        type="range"
        id={id}
        min={field.min}
        max={field.max}
        step={field.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--p': `${p}%` } as React.CSSProperties}
      />
    </div>
  );
}

export function RoiCalc() {
  const uid = useId();
  const [input, setInput] = useState<RoiInput>(ROI_DEFAULTS);
  // aria-live debounce: tijdens slepen stil, daarna alleen de eindwaarde aankondigen.
  const [live, setLive] = useState<'off' | 'polite'>('polite');
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
  }, []);

  const set = (key: keyof RoiInput) => (v: number) => {
    setInput((prev) => ({ ...prev, [key]: v }));
    setLive('off');
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => setLive('polite'), 700);
  };

  const r = computeRoi(input);

  return (
    <div className="roi">
      <form className="roi-in" onSubmit={(e) => e.preventDefault()} aria-label="Rekenhulp">
        <Slider
          id={`${uid}-q`}
          label="Klantvragen per week"
          display={String(input.questionsPerWeek)}
          field={ROI_FIELDS.questionsPerWeek}
          value={input.questionsPerWeek}
          onChange={set('questionsPerWeek')}
        />
        <Slider
          id={`${uid}-m`}
          label="Minuten per vraag"
          display={String(input.minutesPerQuestion)}
          field={ROI_FIELDS.minutesPerQuestion}
          value={input.minutesPerQuestion}
          onChange={set('minutesPerQuestion')}
        />
        <details className="assume">
          <summary>
            Aannames aanpassen <Icon name="chev" />
          </summary>
          <Slider
            id={`${uid}-r`}
            label="Uurkosten medewerker"
            display={`€${input.hourlyRate}`}
            field={ROI_FIELDS.hourlyRate}
            value={input.hourlyRate}
            onChange={set('hourlyRate')}
          />
          <Slider
            id={`${uid}-s`}
            label="Deel dat ChatManta zelf afhandelt"
            tag="aanname"
            display={`${input.sharePct}%`}
            field={ROI_FIELDS.sharePct}
            value={input.sharePct}
            onChange={set('sharePct')}
          />
        </details>
      </form>
      <div className="roi-out">
        <div className="roi-big" aria-live={live} aria-atomic="true">
          <div>
            <div className="k">Bespaarde uren per maand</div>
            <div className="v">
              <SpringValue value={r.savedHours} format={formatHours} />
            </div>
          </div>
          <div>
            <div className="k">Besparing per maand</div>
            <div className="v">
              <SpringValue value={r.savedEuro} format={formatSaved} />
            </div>
          </div>
        </div>
        <div className="roi-rows">
          <div>
            <span>Netto na je pakket</span>
            <b>
              <SpringValue value={r.netEuro} format={formatNet} />
            </b>
          </div>
          <div className="adv">
            <span>Pakketadvies</span>
            <b>{formatAdvice(r.tier, r.tierPrice)}</b>
          </div>
        </div>
        <p className="roi-assume">
          Aanname: ChatManta handelt <b>±{input.sharePct}%</b> van de vragen zelf af, tegen <b>€{input.hourlyRate}</b> per
          uur. Pas dit aan onder “Aannames aanpassen”.
        </p>
        <p className="roi-note">
          Schatting. Het afhandelpercentage hangt af van hoe compleet je website is. Vragen die de bot niet weet, stuurt
          hij door in plaats van te gokken.
        </p>
        <LinkButton href={`${ROUTES.kennismaking}?bron=rekenhulp`} variant="light" arrow>
          Bespreek jouw besparing
        </LinkButton>
      </div>
    </div>
  );
}
