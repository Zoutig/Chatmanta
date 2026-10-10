'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Icon } from '../../ui/icon';
import { Mark } from '../../ui/logo';
import { createGate, prefersReducedMotion } from './gate';

const USER_TEXT = 'Zijn jullie zaterdag open? Mijn band is lek.';
const BOT_TEXT =
  'Ja, op zaterdag zijn we open van 9:00 tot 16:00. Een lekke band plakken we meestal terwijl je wacht.';
const SOURCE = 'vandam-fietsen.nl/openingstijden';

/** Woorden als losse spans (voor het streamen); witruimte blijft gewone tekst. */
function words(text: string) {
  return text.split(/(\s+)/).map((tok, i) =>
    !tok || /^\s+$/.test(tok) ? (
      tok
    ) : (
      <span className="w" key={i}>
        {tok}
      </span>
    ),
  );
}

/**
 * Zelftypend voorbeeldgesprek (hero). Content-first: de SSR-HTML bevat het volledige
 * gesprek (eindstand). Pas na hydratie — en alleen zonder reduced motion — gaat de
 * loop draaien: vraag → typ-indicator → woord-voor-woord antwoord → bronlink-chip,
 * 6s rust, opnieuw. Puur visueel (`aria-live="off"`); pauzeert buiten beeld en bij
 * een verborgen tabblad (zie ./gate.ts). Unmount/reduced-motion ⇒ terug naar eindstand.
 */
export function HeroChat() {
  const reduce = useReducedMotion();
  const chatRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const botRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduce || prefersReducedMotion()) return;
    const chat = chatRef.current;
    const log = logRef.current;
    const user = userRef.current;
    const bot = botRef.current;
    const typing = typingRef.current;
    const chip = chipRef.current;
    if (!chat || !log || !user || !bot || !typing || !chip) return;

    const ac = new AbortController();
    const gate = createGate(chat, 0.3, ac.signal);
    const ws = Array.from(bot.querySelectorAll<HTMLElement>('.w'));
    const parts = [user, bot, chip];

    const reset = () => {
      log.classList.add('prep');
      parts.forEach((e) => e.classList.remove('in'));
      bot.classList.remove('streaming');
      ws.forEach((w) => w.classList.remove('on'));
      typing.classList.remove('on');
    };

    const run = async () => {
      reset();
      await gate.wait(400);
      user.classList.add('in');
      await gate.wait(650);
      typing.classList.add('on');
      await gate.wait(600 + Math.random() * 300);
      typing.classList.remove('on');
      bot.classList.add('streaming', 'in');
      for (const w of ws) {
        await gate.ready();
        w.classList.add('on');
        await gate.sleep(35 + (/[.,?!]$/.test(w.textContent ?? '') ? 90 : 0));
      }
      await gate.wait(250);
      chip.classList.add('in');
    };

    (async () => {
      try {
        for (;;) {
          await run();
          await gate.wait(2500 + 3500);
        }
      } catch {
        /* afgebroken (unmount / reduced motion) */
      }
    })();

    return () => {
      ac.abort();
      // Terug naar de SSR-eindstand: alles zichtbaar.
      log.classList.remove('prep');
      bot.classList.remove('streaming');
      typing.classList.remove('on');
      parts.forEach((e) => e.classList.add('in'));
      ws.forEach((w) => w.classList.add('on'));
    };
  }, [reduce]);

  return (
    <div className="hero-chat-wrap">
      <span className="label-ex">Voorbeeldgesprek</span>
      <div
        className="chat"
        ref={chatRef}
        role="group"
        aria-label="Voorbeeldgesprek met de chatbot van Fietsenmaker Van Dam (fictief bedrijf)"
      >
        <div className="chat-head">
          <div className="chat-av" aria-hidden="true">
            <Mark />
          </div>
          <div>
            <div className="chat-title">Fietsenmaker Van Dam · voorbeeld</div>
            <div className="chat-sub">
              <span className="dot-live" aria-hidden="true" />
              Antwoordt uit vandam-fietsen.nl
            </div>
          </div>
          <time className="chat-clock" dateTime="23:04" aria-label="Tijd: 23:04">
            23:04
          </time>
        </div>
        <div className="chat-log" ref={logRef} aria-live="off">
          <div className="msg user" ref={userRef}>
            <div className="bubble">{USER_TEXT}</div>
          </div>
          <div className="typing" ref={typingRef} aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div className="msg bot" ref={botRef}>
            <div className="bubble">{words(BOT_TEXT)}</div>
            <span className="chip" ref={chipRef}>
              <Icon name="link" />
              Bron: <span className="u">{SOURCE}</span>
            </span>
          </div>
        </div>
        <div className="chat-foot" aria-hidden="true">
          <div className="chat-input">Stel je vraag…</div>
          <div className="chat-send">
            <Icon name="send" />
          </div>
        </div>
      </div>
    </div>
  );
}
