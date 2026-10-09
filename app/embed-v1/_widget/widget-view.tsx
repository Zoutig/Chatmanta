'use client';

// Gedeelde weergave van de V1-widget (bord B · Diepzee). Pure presentatie: geen
// netwerk, geen token, geen opslag. Draait op drie plekken:
//   - mode 'embed'     → de echte widget in de iframe van widget-v1.js (fixed)
//   - mode 'contained' → Preview en het live voorbeeld op het Widget-scherm
//                        (absolute binnen een relatief gepositioneerde ouder)
// De chatlogica (stream, retry, contact) zit bij de aanroeper.
//
// Regel: de logo-data-URL gaat alleen in <img src>. Nooit in CSS (url(), mask)
// of dangerouslySetInnerHTML.

import './widget.css';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { bestForegroundOn } from '@/lib/widget/contrast';
import type { WidgetAppearance } from '@/lib/v1/widget/appearance';

export type WidgetMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: ReactNode;
  streaming?: boolean;
  error?: boolean;
  /** Toont "Opnieuw proberen" onder een foutbubbel. */
  retryable?: boolean;
};

export type WidgetViewProps = {
  appearance: WidgetAppearance;
  mode: 'embed' | 'contained';
  /** Echte host-schermbreedte (embed) of gewenste weergave (contained). */
  isMobile?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: WidgetMessage[];
  pending?: boolean;
  onSend?: (text: string) => void;
  onRetry?: (id: string) => void;
  /** Tooltip naast de gesloten launcher. */
  peek?: boolean;
  /** Slot onder de berichten (contactknop of -formulier). */
  belowMessages?: ReactNode;
  /**
   * Embed: false zolang de iframe nog niet op open-formaat is. Het paneel blijft
   * dan onzichtbaar en de open-animatie start pas als dit true wordt.
   */
  ready?: boolean;
  /** Focus naar het invoerveld bij openen (alleen zinvol in de echte widget). */
  autoFocus?: boolean;
  /** Voorbeeld: invoer en startvragen doen niets. */
  readOnly?: boolean;
};

export function WidgetView({
  appearance: a,
  mode,
  isMobile = false,
  open,
  onOpenChange,
  messages,
  pending = false,
  onSend,
  onRetry,
  peek = false,
  belowMessages,
  ready = true,
  autoFocus = false,
  readOnly = false,
}: WidgetViewProps) {
  const fg = bestForegroundOn(a.accentColor);
  const titleId = useId();
  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(open);

  const empty = messages.length === 0;
  const fullscreen = mode === 'embed' && isMobile;
  const showLauncher = !(fullscreen && open);
  const peekText = a.launcherText.trim();

  // Auto-scroll bij nieuwe inhoud, maar alleen als de lezer al onderaan zat (of
  // net zelf iets stuurde): wie omhoog scrolt om terug te lezen, springt niet weg.
  const stickRef = useRef(true);
  const countRef = useRef(messages.length);
  useEffect(() => {
    // Nieuw bericht (bv. net zelf verstuurd) → altijd mee naar beneden.
    if (messages.length > countRef.current) stickRef.current = true;
    countRef.current = messages.length;
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, open, belowMessages]);
  useEffect(() => {
    if (open) stickRef.current = true;
  }, [open]);

  // Focus: naar het invoerveld bij openen (echte widget), terug naar de
  // launcher bij sluiten.
  useEffect(() => {
    if (open && !wasOpen.current && autoFocus && ready && !readOnly) {
      inputRef.current?.focus({ preventScroll: true });
    }
    if (!open && wasOpen.current && mode === 'embed') {
      launcherRef.current?.focus({ preventScroll: true });
    }
    if (ready) wasOpen.current = open;
  }, [open, ready, autoFocus, mode, readOnly]);

  // Escape sluit de echte widget (werkt zodra de iframe focus heeft).
  useEffect(() => {
    if (mode !== 'embed' || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, open, onOpenChange]);

  const submit = () => {
    const text = draft.trim();
    if (!text || pending || readOnly || !onSend) return;
    onSend(text);
    setDraft('');
  };

  const style = { '--cmw-accent': a.accentColor, '--cmw-fg': fg } as CSSProperties;
  const canSend = !readOnly && !pending && draft.trim().length > 0;

  return (
    <div
      className="cmw"
      data-mode={mode}
      data-side={a.position === 'bottom-left' ? 'left' : 'right'}
      data-fullscreen={fullscreen || undefined}
      style={style}
    >
      {!open && peek && peekText ? (
        <div className="cmw-peek" role="status">
          {peekText}
        </div>
      ) : null}

      {open ? (
        <section
          className="cmw-panel"
          data-anim={ready ? 'go' : 'wait'}
          role="dialog"
          aria-labelledby={titleId}
        >
          <header className="cmw-head" data-compact={!empty || !a.welcomeMessage.trim() || undefined}>
            <div className="cmw-head-row">
              <Avatar appearance={a} fg={fg} />
              <div className="cmw-head-text">
                <h2 id={titleId} className="cmw-title">
                  {a.headerTitle}
                </h2>
                {a.subtitle ? <p className="cmw-subtitle">{a.subtitle}</p> : null}
              </div>
              <button
                type="button"
                className="cmw-close"
                aria-label="Chat sluiten"
                onClick={() => onOpenChange(false)}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            {empty && a.welcomeMessage.trim() ? <p className="cmw-greeting">{a.welcomeMessage}</p> : null}
          </header>

          <div
            ref={bodyRef}
            className="cmw-body"
            onScroll={(e) => {
              const el = e.currentTarget;
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
            }}
          >
            {messages.map((m) => (
              <div key={m.id} className="cmw-msg" data-role={m.role}>
                {m.role === 'assistant' && m.streaming && !m.content ? (
                  <div className="cmw-bubble" data-role="assistant" aria-label="Aan het typen">
                    <span className="cmw-typing" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                ) : (
                  <div className="cmw-bubble" data-role={m.role} data-error={m.error || undefined}>
                    {m.content}
                  </div>
                )}
                {m.error && m.retryable && onRetry ? (
                  <button
                    type="button"
                    className="cmw-retry"
                    disabled={pending || readOnly}
                    onClick={() => {
                      onRetry(m.id);
                      // De knop verdwijnt met de foutbubbel; focus niet op body laten vallen.
                      inputRef.current?.focus({ preventScroll: true });
                    }}
                  >
                    <RetryIcon /> Opnieuw proberen
                  </button>
                ) : null}
              </div>
            ))}

            {empty && a.starterQuestions.length > 0 ? (
              <div className="cmw-starters">
                {a.starterQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="cmw-starter"
                    disabled={pending}
                    onClick={() => {
                      if (!readOnly && onSend) onSend(q);
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}

            {belowMessages}
          </div>

          <div className="cmw-foot">
            <form
              className="cmw-composer"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <textarea
                ref={inputRef}
                className="cmw-input"
                rows={1}
                value={draft}
                readOnly={readOnly}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder="Typ je vraag…"
                aria-label="Je vraag"
                maxLength={2000}
              />
              <button type="submit" className="cmw-send" disabled={!canSend} aria-label="Versturen">
                <SendIcon />
              </button>
            </form>
            <p className="cmw-credit">Mogelijk gemaakt door ChatManta</p>
          </div>
        </section>
      ) : null}

      {showLauncher ? (
        <button
          ref={launcherRef}
          type="button"
          className="cmw-launcher"
          data-open={open || undefined}
          aria-label={open ? 'Chat sluiten' : 'Chat openen'}
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <span className="cmw-launcher-icon" data-icon="open" aria-hidden="true">
            <LauncherIcon appearance={a} fg={fg} />
          </span>
          <span className="cmw-launcher-icon" data-icon="close" aria-hidden="true">
            <CloseIcon size={22} />
          </span>
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Avatar en iconen (inline SVG; het merk-icoon als CSS-mask op een vast pad)
// ---------------------------------------------------------------------------

function Avatar({ appearance: a, fg }: { appearance: WidgetAppearance; fg: string }) {
  return (
    <span className="cmw-avatar" aria-hidden="true">
      {a.logoStyle === 'custom-logo' && a.customLogoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.customLogoDataUrl} alt="" className="cmw-avatar-img" />
      ) : a.logoStyle === 'brand-mark' ? (
        <BrandMark color={fg} size={16} />
      ) : (
        <BubbleIcon size={18} />
      )}
    </span>
  );
}

function LauncherIcon({ appearance: a, fg }: { appearance: WidgetAppearance; fg: string }) {
  if (a.logoStyle === 'custom-logo' && a.customLogoDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={a.customLogoDataUrl} alt="" className="cmw-launcher-img" />;
  }
  if (a.logoStyle === 'brand-mark') return <BrandMark color={fg} size={20} />;
  return <BubbleIcon size={24} />;
}

function BrandMark({ color, size }: { color: string; size: number }) {
  return (
    <span
      className="cmw-mark"
      style={{ width: Math.round(size * (36 / 22)), height: size, backgroundColor: color }}
    />
  );
}

function BubbleIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"
        fill="currentColor"
      />
    </svg>
  );
}

function CloseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
