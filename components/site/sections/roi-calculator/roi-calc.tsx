'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ROUTES } from '@/lib/site/navigation';
import { Icon } from '../../ui/icon';
import { LinkButton } from '../../ui/button';
import { useReducedMotion } from '../../ui/motion-hooks';
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

/** Mockup: verende cijfers met stiffness 120, damping 20 (massa 1). */
const SPRING = { stiffness: 120, damping: 20, restDelta: 0.05 };

/**
 * Getal dat naar zijn doelwaarde "veert" (kleine rAF-veersimulatie, geen bibliotheek).
 * SSR + eerste render tonen meteen de eindtekst (content-first); bij reduced motion
 * springt hij direct.
 */
function SpringValue({ value, format }: { value: number; format: (v: number) => string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const state = useRef({ x: value, v: 0, raf: 0 });

  useEffect(() => {
    const st = state.current;
    const show = (x: number) => {
      if (ref.current) ref.current.textContent = format(x);
    };
    cancelAnimationFrame(st.raf);
    if (reduce) {
      st.x = value;
      st.v = 0;
      show(value);
      return;
    }
    let last = performance.now();
    const step = (now: number) => {
      // vaste substappen houden de simulatie stabiel bij haperende frames
      let dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      while (dt > 0) {
        const h = Math.min(dt, 0.008);
        const a = -SPRING.stiffness * (st.x - value) - SPRING.damping * st.v;
        st.v += a * h;
        st.x += st.v * h;
        dt -= h;
      }
      if (Math.abs(st.x - value) < SPRING.restDelta && Math.abs(st.v) < SPRING.restDelta) {
        st.x = value;
        st.v = 0;
        show(value);
        return;
      }
      show(st.x);
      st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(st.raf);
  }, [value, reduce, format]);

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
