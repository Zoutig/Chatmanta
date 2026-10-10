'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useHydrated } from '../../ui/use-hydrated';
import { Icon } from '../../ui/icon';
import { Mark } from '../../ui/logo';
import { cx } from '../../ui/cx';

export type Seg = { text: string; mark?: boolean };

type SideState = {
  prep: boolean; // verborgen beginstand (alleen na hydratie, nooit in SSR)
  user: boolean;
  typing: boolean;
  bot: boolean;
  streaming: boolean;
  words: number; // aantal zichtbare woorden tijdens streamen
  extra: boolean; // "Staat nergens op de site" / "Ja, bel me terug"
  drawn: boolean; // markering onder de verzonnen zin
};

const SHOWN: SideState = { prep: false, user: true, typing: false, bot: true, streaming: false, words: 0, extra: true, drawn: true };
const PREP: SideState = { prep: true, user: false, typing: false, bot: false, streaming: false, words: 0, extra: false, drawn: false };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const wordList = (segs: Seg[]) => segs.flatMap((s) => s.text.split(/\s+/).filter(Boolean));

type Gate = { ready: () => Promise<void>; wait: (ms: number) => Promise<void>; dispose: () => void };

/**
 * Zichtbaarheidspoort (mockup `makeGate`): wachten pauzeert buiten beeld en bij een
 * verborgen tabblad. `onFirstEnter` vuurt één keer, bij de eerste keer in beeld.
 */
function makeGate(el: HTMLElement, threshold: number, onFirstEnter: () => void): Gate {
  let visible = false;
  let entered = false;
  let waiters: Array<() => void> = [];
  const flush = () => {
    if (visible && !document.hidden) {
      const w = waiters;
      waiters = [];
      w.forEach((f) => f());
    }
  };
  const io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting;
      if (visible && !entered) {
        entered = true;
        onFirstEnter();
      }
      flush();
    },
    { threshold },
  );
  io.observe(el);
  document.addEventListener('visibilitychange', flush);
  const ready = () => (visible && !document.hidden ? Promise.resolve() : new Promise<void>((r) => waiters.push(r)));
  const wait = async (ms: number) => {
    let t = 0;
    while (t < ms) {
      await ready();
      const step = Math.min(60, ms - t);
      await sleep(step);
      t += step;
    }
  };
  return {
    ready,
    wait,
    dispose: () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', flush);
      waiters = [];
    },
  };
}

/** Woorden als losse spans (voor het streamen); de volledige tekst staat altijd in de DOM. */
function StreamText({ segs, on, drawn }: { segs: Seg[]; on: number | null; drawn: boolean }) {
  let idx = 0;
  const render = (text: string) =>
    text.split(/(\s+)/).map((tok, i) => {
      if (!tok) return null;
      if (/^\s+$/.test(tok)) return tok;
      const k = idx++;
      return (
        <span key={i} className={cx('w', (on === null || k < on) && 'on')}>
          {tok}
        </span>
      );
    });
  return (
    <>
      {segs.map((s, i) =>
        s.mark ? (
          <mark key={i} className={cx('fake', drawn && 'drawn')}>
            {render(s.text)}
          </mark>
        ) : (
          <span key={i}>{render(s.text)}</span>
        ),
      )}
    </>
  );
}

function Typing({ on }: { on: boolean }) {
  return (
    <div className={cx('typing', on && 'on')} aria-hidden="true">
      <i />
      <i />
      <i />
    </div>
  );
}

/**
 * "Liever eerlijk dan verzonnen": gewone chatbot (verzint) naast ChatManta (eerlijk).
 * Eén keer afgespeeld bij in beeld, beide tegelijk (ChatManta 300ms later).
 * Content-first: SSR toont de eindstand; pas ná hydratie (en zonder reduced motion)
 * gaat het naar de verborgen beginstand. Typen is visueel (aria-live="off").
 */
export function HonestSplit({
  question,
  bad,
  good,
  note,
  callback,
  callbackDone,
  badLabel,
  goodLabel,
}: {
  question: string;
  bad: Seg[];
  good: Seg[];
  note: string;
  callback: string;
  callbackDone: string;
  badLabel: ReactNode;
  goodLabel: ReactNode;
}) {
  const reduce = useReducedMotion();
  const hydrated = useHydrated();
  const ref = useRef<HTMLDivElement>(null);
  // Beginstand = verborgen; wordt pas gebruikt ná hydratie en zonder reduced motion (zie `view`).
  const [b, setB] = useState<SideState>(PREP);
  const [g, setG] = useState<SideState>(PREP);
  const [done, setDone] = useState(false);
  const animate = hydrated && !reduce;

  useEffect(() => {
    const el = ref.current;
    if (!animate || !el) return;
    let cancelled = false;

    const run = async (
      gate: Gate,
      set: Dispatch<SetStateAction<SideState>>,
      words: string[],
      after: (patch: (p: Partial<SideState>) => void) => Promise<void>,
    ) => {
      const patch = (p: Partial<SideState>) => {
        if (!cancelled) set((s) => ({ ...s, ...p }));
      };
      await gate.wait(400);
      patch({ user: true });
      await gate.wait(650);
      patch({ typing: true });
      await gate.wait(600 + Math.random() * 300);
      patch({ typing: false, bot: true, streaming: true, words: 0 });
      for (let k = 1; k <= words.length; k++) {
        if (cancelled) return;
        await gate.ready();
        patch({ words: k });
        await sleep(35 + (/[.,?!]$/.test(words[k - 1]) ? 90 : 0));
      }
      patch({ streaming: false });
      await after(patch);
    };

    const gate: Gate = makeGate(el, 0.35, () => {
      void run(gate, setB, wordList(bad), async (patch) => {
        await gate.wait(200);
        patch({ drawn: true });
        await gate.wait(500);
        patch({ extra: true });
      });
      void sleep(300).then(() =>
        run(gate, setG, wordList(good), async (patch) => {
          await gate.wait(250);
          patch({ extra: true });
        }),
      );
    });

    return () => {
      cancelled = true;
      gate.dispose();
    };
  }, [animate, bad, good]);

  const view = (s: SideState) => (animate ? s : SHOWN);

  const side = (s: SideState, segs: Seg[], kind: 'bad' | 'good') => (
    <div className={cx('chat-log', s.prep && 'prep')} aria-live="off">
      <div className={cx('msg user', s.user && 'in')}>
        <div className="bubble">{question}</div>
      </div>
      <Typing on={s.typing} />
      <div className={cx('msg bot', s.bot && 'in', s.streaming && 'streaming')}>
        <div className="bubble">
          <StreamText segs={segs} on={s.streaming ? s.words : null} drawn={s.drawn} />
        </div>
        {kind === 'bad' ? (
          <span className={cx('fake-note', s.extra && 'in')}>
            <Icon name="warn" />
            {note}
          </span>
        ) : (
          <button
            type="button"
            className={cx('btn btn-outline callback', s.extra && 'in', done && 'done')}
            // Nog onzichtbaar (prep, vóór de animatie)? Dan ook niet focusbaar/voorgelezen.
            tabIndex={s.prep && !s.extra ? -1 : undefined}
            aria-hidden={s.prep && !s.extra ? true : undefined}
            onClick={() => setDone(true)}
          >
            <span className="lbl">{callback}</span>
            <span className="ok">
              <Icon name="check" />
              {callbackDone}
            </span>
          </button>
        )}
        {kind === 'good' ? (
          <span className="sr-only" role="status">
            {done ? callbackDone : ''}
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="split" ref={ref}>
      <div className="side bad">
        <div className="side-lab label">{badLabel}</div>
        {side(view(b), bad, 'bad')}
      </div>
      <div className="side good">
        <div className="side-lab label">
          <Mark />
          {goodLabel}
        </div>
        {side(view(g), good, 'good')}
      </div>
    </div>
  );
}
