/**
 * Zichtbaarheidspoort (port van `makeGate` uit mockup-final): animatie-loops wachten
 * hierop, zodat ze pauzeren zodra het element buiten beeld is of het tabblad verborgen.
 * Afbreekbaar via een AbortSignal (unmount / reduced-motion-wissel): openstaande
 * wachtpunten rejecten dan met een AbortError, zodat de loop netjes stopt.
 */
export type Gate = {
  /** Resolvet direct als zichtbaar + tab actief, anders zodra dat weer zo is. */
  ready: () => Promise<void>;
  /** Wacht `ms` "zichtbare" tijd: telt niet door zolang de poort dicht is. */
  wait: (ms: number) => Promise<void>;
  /** Pauzeerbare sleep zonder zichtbaarheidscheck (voor korte stapjes). */
  sleep: (ms: number) => Promise<void>;
};

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

export function createGate(el: Element, threshold: number, signal: AbortSignal): Gate {
  let visible = false;
  let waiters: Array<{ resolve: () => void; reject: (e: unknown) => void }> = [];

  const open = () => visible && !document.hidden;
  const flush = () => {
    if (!open()) return;
    const w = waiters;
    waiters = [];
    w.forEach((x) => x.resolve());
  };

  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      flush();
    },
    { threshold },
  );
  io.observe(el);
  document.addEventListener('visibilitychange', flush);

  signal.addEventListener(
    'abort',
    () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', flush);
      const w = waiters;
      waiters = [];
      w.forEach((x) => x.reject(abortError()));
    },
    { once: true },
  );

  const sleep = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(abortError());
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(abortError());
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });

  const ready = () => {
    if (signal.aborted) return Promise.reject(abortError());
    if (open()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
  };

  const wait = async (ms: number) => {
    let t = 0;
    while (t < ms) {
      await ready();
      const step = Math.min(60, ms - t);
      await sleep(step);
      t += step;
    }
  };

  return { ready, wait, sleep };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
