'use client';

// FeedbackButtons — onderaan elke afgeronde bot-bubble in de widget.
//
// Twee subtiele duim-iconen. Klik op 👎 opent een inline textarea (3 regels)
// met "Verstuur" + "Sla over"-knoppen. Klik op 👍 = directe submit zonder
// follow-up. Na succes is de gekozen rating "filled" en beide knoppen
// disabled — feedback per bericht is one-shot.
//
// State leeft op het Message-object (parent ChatMantaWidget) zodat refresh
// na een streaming-delta of nieuwe message de feedback-status niet wist.

import { bestForegroundOn } from '@/lib/widget/contrast';

export type FeedbackState =
  | 'idle'
  | 'comment-open'
  | 'submitting'
  | 'sent-down'
  | 'sent-up'
  | 'error';

export type FeedbackButtonsProps = {
  /** Pas knoppen tonen wanneer de queryLogId binnen is via het meta-event. */
  queryLogId: string | undefined;
  state: FeedbackState;
  comment: string;
  /** Kleur die hover-fill en filled-state gebruikt (header-accent kleur). */
  accentColor: string;
  onCommentChange: (next: string) => void;
  /** Submit kan met of zonder comment; rating bepaalt welk icoon "filled" wordt. */
  onSubmit: (rating: 'up' | 'down') => void;
  onOpenComment: () => void;
  onSkipComment: () => void;
};

const COMMENT_MAX = 2000;

export function FeedbackButtons({
  queryLogId,
  state,
  comment,
  accentColor,
  onCommentChange,
  onSubmit,
  onOpenComment,
  onSkipComment,
}: FeedbackButtonsProps) {
  // Knoppen alleen actief zodra de meta-event is geland. In praktijk komt 'ie
  // <100ms in, maar zonder gate kan een snelle klik op een eerdere render een
  // empty body posten.
  const ready = Boolean(queryLogId);
  const submitted = state === 'sent-up' || state === 'sent-down';
  const submitting = state === 'submitting';
  const commentOpen = state === 'comment-open';
  const isError = state === 'error';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        marginTop: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 4,
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        {isError && (
          <span
            style={{
              fontSize: 11,
              color: '#b91c1c',
              marginRight: 4,
            }}
            role="status"
          >
            Niet verstuurd
          </span>
        )}
        <ThumbButton
          direction="up"
          filled={state === 'sent-up'}
          dimmed={state === 'sent-down'}
          disabled={!ready || submitted || submitting || commentOpen}
          accentColor={accentColor}
          onClick={() => onSubmit('up')}
          aria-label="Was dit een goed antwoord?"
        />
        <ThumbButton
          direction="down"
          filled={state === 'sent-down'}
          dimmed={state === 'sent-up'}
          disabled={!ready || submitted || submitting}
          accentColor={accentColor}
          onClick={() => (commentOpen ? onSubmit('down') : onOpenComment())}
          aria-label="Klopte er iets niet aan het antwoord?"
        />
      </div>

      {commentOpen && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginTop: 2,
            padding: '8px 10px',
            background: '#f7f8fa',
            borderRadius: 10,
            border: '1px solid #eaecef',
          }}
        >
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value.slice(0, COMMENT_MAX))}
            placeholder="Wat klopte er niet? (optioneel)"
            rows={3}
            disabled={submitting}
            style={{
              width: '100%',
              resize: 'vertical',
              minHeight: 56,
              maxHeight: 160,
              padding: '6px 8px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit',
              color: '#0e1014',
              background: '#ffffff',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onSkipComment}
              disabled={submitting}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: 12,
                color: '#6b7280',
                padding: '4px 8px',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Sla over
            </button>
            <button
              type="button"
              onClick={() => onSubmit('down')}
              disabled={submitting}
              style={{
                background: accentColor,
                color: bestForegroundOn(accentColor),
                border: 'none',
                borderRadius: 6,
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? 'Bezig…' : 'Verstuur'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThumbButton({
  direction,
  filled,
  dimmed,
  disabled,
  accentColor,
  onClick,
  ...rest
}: {
  direction: 'up' | 'down';
  filled: boolean;
  dimmed: boolean;
  disabled: boolean;
  accentColor: string;
  onClick: () => void;
  'aria-label': string;
}) {
  // Subtiel default-grijs; fill bij sent-state in accentColor. `dimmed` zet
  // de tegenovergestelde knop iets zwakker zodat de gekozen feedback domineert.
  const color = filled ? accentColor : dimmed ? '#d1d5db' : '#9ca3af';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={rest['aria-label']}
      style={{
        background: 'transparent',
        border: 'none',
        padding: 4,
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled && !filled ? 0.55 : 1,
        transition: 'color 120ms',
      }}
      onMouseEnter={(e) => {
        if (disabled || filled) return;
        (e.currentTarget.firstElementChild as SVGElement | null)?.setAttribute(
          'data-hover',
          'true',
        );
      }}
    >
      <ThumbIcon direction={direction} filled={filled} color={color} accentColor={accentColor} />
    </button>
  );
}

function ThumbIcon({
  direction,
  filled,
  color,
  accentColor,
}: {
  direction: 'up' | 'down';
  filled: boolean;
  color: string;
  accentColor: string;
}) {
  // Lucide-style icoonpad — zelfde lijn als de rest van de widget. Gebruikt
  // currentColor via inline-style zodat hover-effecten 'gewoon' werken.
  const transform = direction === 'down' ? 'rotate(180deg)' : undefined;
  const stroke = filled ? accentColor : color;
  const fill = filled ? accentColor : 'none';

  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform }}
      aria-hidden="true"
    >
      <path d="M7 10v12" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H7c-1.1 0-2-.9-2-2v-8c0-1.1.9-2 2-2h2.76a2 2 0 0 0 1.79-1.11L15 2c.96 0 2 .96 2 2v1.88Z" />
    </svg>
  );
}
